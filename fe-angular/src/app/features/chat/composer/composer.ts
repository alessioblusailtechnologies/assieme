import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { ChatStore, type AllegatoInCorso, type StatoElaborazioneAllegato } from '../chat-store';
import { Icona } from '@shared/ui/icona/icona';
import { MenuAzioni, type VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { NotificheStore } from '@core/notifiche/notifiche-store';
import { ESTENSIONI_DOCUMENTO, Id, ModoAllegato, RiferimentoDocumento } from '@core/models';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import { ErroreMicrofono, Registratore } from './registratore';
import {
  chipAllegatoPerChiave,
  chipPerId,
  creaChipAllegato,
  creaChipDocumento,
  idChip,
  posizionaCursore,
  posizioneCursore,
  ripulisciSeVuoto,
  scriviDopoChip,
  sostituisciIntervallo,
  testoEditor,
} from './editor-testo';
import { menzioneAlCursore } from './menzione';

/**
 * Composizione del messaggio: testo, referenziazione `@`, invio.
 *
 * Il campo è un editor `contenteditable` che il componente governa via DOM
 * (`editor-testo.ts`): i documenti referenziati sono chip **tra le parole**,
 * non una riga sopra il campo — si scrive «@», si sceglie, e il chip prende
 * il posto della `@query`. Il messaggio che parte resta testo semplice più
 * gli id (contratto RF-C-02): la posizione dei chip nel testo è di chi
 * scrive, non del server.
 *
 * Il selettore si apre digitando `@` o col pulsante — che non è una seconda
 * modalità: inserisce una `@` nel testo, e da lì in poi i due gesti sono lo
 * stesso gesto. Mentre è aperto la tastiera naviga i risultati senza che il
 * fuoco lasci il campo.
 *
 * Lo store resta la verità (bozza = testo, riferimentiBozza = documenti):
 * l'editor la riflette e la aggiorna. Se la bozza cambia da fuori (invio,
 * ripristino dopo un errore, suggerimento cliccato) l'editor si ricostruisce;
 * se cambiano solo i riferimenti, i chip si aggiungono o tolgono sul posto.
 */
@Component({
  selector: 'app-composer',
  imports: [Icona, MenuAzioni, SelettoreDocumenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
})
export class Composer {
  protected readonly store = inject(ChatStore);

  /* La finestra di scelta mostra solo ciò che sappiamo leggere: scoprirlo
     dopo il caricamento, con un 415, è il modo peggiore di apprenderlo. */
  protected readonly estensioni = ESTENSIONI_DOCUMENTO;

  /** Documenti da non riproporre nel selettore: già nel contesto. */
  readonly giaInContesto = input<string[]>([]);

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  private readonly campoFile = viewChild.required<ElementRef<HTMLInputElement>>('file');
  private readonly selettore = viewChild(SelettoreDocumenti);

  /*
   * La posizione del cursore è stato a tutti gli effetti: la menzione attiva
   * dipende da dove si sta scrivendo, non solo da cosa c'è scritto.
   */
  private readonly cursore = signal(0);

  /** Menzione chiusa con Esc: resta chiusa finché si resta su quella `@`. */
  private readonly soppressaDa = signal<number | undefined>(undefined);

  /** Vero per la durata di `referenzia()`: vedi `chiudiSelettore()`. */
  private inScelta = false;

  protected readonly menzione = computed(() => menzioneAlCursore(this.store.bozza(), this.cursore()));

  protected readonly selettoreAperto = computed(() => {
    const menzione = this.menzione();
    return !!menzione && menzione.inizio !== this.soppressaDa();
  });

  protected readonly esclusi = computed(() => [
    ...this.giaInContesto(),
    ...this.store.riferimentiBozza().map((r) => r.id),
  ]);

  constructor() {
    // Lo store → l'editor: ricostruzione sul testo, riconciliazione sui chip.
    effect(() => {
      const testo = this.store.bozza();
      const riferimenti = this.store.riferimentiBozza();
      const allegati = this.store.allegati();
      /* Letto qui perché l'effect lo segua: il chip di un allegato cambia
         faccia quando il server finisce di leggerlo, o quando fallisce. */
      const elaborazioni = this.store.elaborazioni();
      untracked(() => this.sincronizzaEditor(testo, riferimenti, allegati, elaborazioni));
    });
  }

  private get editor(): HTMLDivElement {
    return this.area().nativeElement;
  }

  /** Dall'editor allo store, dopo ogni gesto dell'utente. */
  protected aggiorna(): void {
    const editor = this.editor;
    ripulisciSeVuoto(editor);
    this.store.bozza.set(testoEditor(editor));
    const presenti = new Set(idChip(editor));
    if (this.store.riferimentiBozza().some((r) => !presenti.has(r.id))) {
      // Un chip tolto con Backspace: il riferimento se ne va con lui.
      this.store.riferimentiBozza.update((r) => r.filter((d) => presenti.has(d.id)));
    }
    this.aggiornaCursore();
  }

  protected aggiornaCursore(): void {
    this.cursore.set(posizioneCursore(this.editor, document.getSelection()));
    /* Uscire dalla menzione azzera la soppressione: la prossima `@` deve
       aprire il selettore anche se nasce nello stesso punto del testo. */
    if (!this.menzione()) this.soppressaDa.set(undefined);
  }

  protected suTasto(evento: KeyboardEvent): void {
    /* Col selettore aperto il fuoco è nel suo campo di ricerca: qui non
       arriva più niente, e non c'è nulla da inoltrare. */
    if (evento.key === 'Enter') {
      evento.preventDefault();
      if (evento.shiftKey) this.inserisciTesto('\n');
      else this.invia();
    }
  }

  /** Si incolla solo testo: l'editor non accetta markup da fuori. */
  protected incolla(evento: ClipboardEvent): void {
    evento.preventDefault();
    const testo = evento.clipboardData?.getData('text/plain') ?? '';
    if (testo) this.inserisciTesto(testo);
  }

  /**
   * Il selettore si chiude senza scegliere — Esc, Backspace a vuoto, un clic
   * altrove — e **la `@` se ne va con lui**.
   *
   * Era un comando, non testo: con la barra di ricerca dentro al pannello
   * non porta più con sé ciò che si stava cercando, e lasciarla lì
   * significherebbe lasciare un segno che l'utente non ha voluto scrivere.
   *
   * La soppressione resta come rete: se la cancellazione non andasse a
   * segno, senza di lei il pannello si riaprirebbe all'istante.
   */
  protected chiudiSelettore(): void {
    /* Scegliendo si passa comunque di qui, perché `referenzia()` riporta il
       fuoco all'editor e il campo di ricerca perde il suo: lì la `@` sta per
       diventare un chip e non va toccata. */
    if (this.inScelta || !this.selettoreAperto()) return;

    const menzione = this.menzione();
    if (!menzione) return;
    this.soppressaDa.set(menzione.inizio);

    const editor = this.editor;
    editor.focus();
    sostituisciIntervallo(editor, menzione.inizio, this.cursore(), document.createTextNode(''));
    this.aggiorna();
  }

  /**
   * Documento scelto: la `@query` diventa il chip, lì dove stava. Il fuoco
   * non si è mai mosso dal campo; il cursore resta subito dopo il chip —
   * anche quando davanti ce n'è già un altro, che è il caso in cui prima
   * finiva in mezzo ai due.
   */
  protected referenzia(documento: RiferimentoDocumento): void {
    /* Il fuoco è nel campo di ricerca del pannello: torna qui, e ci resta
       perché il pannello sparisce insieme alla menzione. */
    this.inScelta = true;
    const menzione = this.menzione();
    const chip = this.nuovoChip(documento);
    const editor = this.editor;
    editor.focus();
    const da = menzione ? menzione.inizio : this.cursore();
    const a = menzione ? this.cursore() : this.cursore();
    sostituisciIntervallo(editor, da, a, chip);
    // Uno spazio dopo il chip: si continua a scrivere senza incollarsi.
    scriviDopoChip(editor, chip, ' ');
    this.store.aggiungiRiferimento(documento);
    this.aggiorna();
    this.inScelta = false;
  }

  /**
   * RF-C-02: un file allegato dal disco. Non entra negli archivi — vive con
   * la conversazione; appena caricato compare come riferimento del contesto.
   */
  /**
   * Il modo scelto nel menù, che vale per il file che sta per arrivare.
   *
   * Sta qui e non nello store perché è una scelta del gesto, non della
   * conversazione: il prossimo allegato può volere l'altro modo.
   */
  private modoScelto: ModoAllegato = 'archivio';

  /**
   * Le due strade dell'allegato (RF-C-02). La differenza non è tecnica ed è
   * scritta com'è: dove finisce il documento e quanto bene viene letto.
   */
  protected readonly vociAllega: VoceMenu[] = [
    {
      etichetta: 'Aggiungi all’Archivio privato',
      dettaglio: 'lettura accurata, resta all’agenzia',
      azione: () => this.scegliFile('archivio'),
    },
    {
      etichetta: 'Solo per questa chat',
      dettaglio: 'lettura rapida, meno precisa',
      azione: () => this.scegliFile('rapido'),
    },
  ];

  private scegliFile(modo: ModoAllegato): void {
    this.modoScelto = modo;
    this.campoFile().nativeElement.click();
  }

  protected allegaFile(evento: Event): void {
    const ingresso = evento.target as HTMLInputElement;
    this.store.allega([...(ingresso.files ?? [])], this.modoScelto);
    /* Lo stesso file deve poter essere riallegato: l'input si azzera. */
    ingresso.value = '';
    this.editor.focus();
  }

  /** Il pulsante di referenziazione è la stessa `@`, per chi non la conosce. */
  protected apriDaPulsante(): void {
    this.editor.focus();
    const testo = this.store.bozza();
    const cursore = this.cursore();
    const prefisso = testo.slice(0, cursore);
    const inserto = !prefisso || /[\s([{]$/.test(prefisso) ? '@' : ' @';
    this.soppressaDa.set(undefined);
    this.inserisciTesto(inserto);
  }

  protected invia(): void {
    if (this.store.inRisposta() || !this.store.bozza().trim()) return;
    this.store.invia();
  }

  /** «Scrivi il prompt»: lo store riscrive la bozza; l'editor la segue da solo (effetto sopra). */
  protected scriviPrompt(): void {
    this.store.generaPrompt();
    this.editor.focus();
  }

  protected ripristina(): void {
    this.store.ripristinaAbbozzo();
    this.editor.focus();
  }

  // --- La dettatura ---------------------------------------------------------

  private readonly notifiche = inject(NotificheStore);
  private readonly registratore = new Registratore();

  /** Vero dal clic che apre il microfono al clic che lo chiude. */
  protected readonly inRegistrazione = signal(false);

  protected readonly microfonoDisponibile = Registratore.supportato();

  /**
   * Un clic apre il microfono, il successivo lo chiude e manda l'audio a
   * trascrivere: il testo arriva in coda a ciò che c'è nel campo. Il
   * permesso lo chiede il browser al primo clic; un rifiuto si spiega, non
   * si ripete in silenzio.
   */
  protected async dettatura(): Promise<void> {
    if (this.inRegistrazione()) {
      this.inRegistrazione.set(false);
      const audio = await this.registratore.ferma();
      this.store.trascrivi(audio);
      this.editor.focus();
      return;
    }
    try {
      await this.registratore.avvia();
      this.inRegistrazione.set(true);
    } catch (errore) {
      const messaggio = errore instanceof ErroreMicrofono ? errore.message : 'Il microfono non è partito.';
      this.notifiche.aggiungi({ gravita: 'errore', titolo: 'Dettatura non disponibile', dettaglio: messaggio });
    }
  }

  private inserisciTesto(testo: string): void {
    const editor = this.editor;
    editor.focus();
    const posizione = this.cursore();
    sostituisciIntervallo(editor, posizione, posizione, document.createTextNode(testo));
    this.aggiorna();
  }

  private nuovoChip(documento: RiferimentoDocumento): HTMLElement {
    return creaChipDocumento(
      documento,
      () => {
        chipPerId(this.editor, documento.id)?.remove();
        this.store.rimuoviRiferimento(documento.id);
        this.aggiorna();
        this.editor.focus();
      },
      this.store.elaborazioni().get(documento.id),
    );
  }

  /**
   * Lo store verso l'editor. Sul testo si confronta e, se differisce, si
   * ricostruisce (chip davanti, testo dopo, cursore in fondo se il campo ha
   * il fuoco); sui riferimenti si riconcilia chip per chip.
   */
  private sincronizzaEditor(
    testo: string,
    riferimenti: RiferimentoDocumento[],
    allegati: AllegatoInCorso[],
    elaborazioni: Map<Id, StatoElaborazioneAllegato>,
  ): void {
    const editor = this.editor;
    const presenti = new Set(idChip(editor));
    const attesi = new Set(riferimenti.map((r) => r.id));

    if (testoEditor(editor) !== testo) {
      editor.replaceChildren();
      for (const r of riferimenti) editor.append(this.nuovoChip(r), document.createTextNode(' '));
      if (testo) editor.append(document.createTextNode(testo));
      if (document.activeElement === editor) posizionaCursore(editor, testo.length);
    } else {
      for (const id of presenti) if (!attesi.has(id)) chipPerId(editor, id)?.remove();
      for (const r of riferimenti) {
        if (!presenti.has(r.id)) editor.append(document.createTextNode(' '), this.nuovoChip(r));
      }
    }

    /* Il chip di un documento che sta ancora venendo letto cambia faccia
       quando il server finisce: si rifà quello e basta, riconoscendolo dallo
       stato che porta scritto addosso. */
    for (const r of riferimenti) {
      const chip = chipPerId(editor, r.id);
      if (!chip) continue;
      const atteso = elaborazioni.get(r.id)?.stato ?? '';
      if ((chip.dataset['stato'] ?? '') !== atteso) chip.replaceWith(this.nuovoChip(r));
    }

    // Gli allegati in corso: chip transitori, per chiave; via quando spariscono dallo store.
    const chiaviAttese = new Set(allegati.map((a) => a.chiave));
    for (const c of Array.from(editor.querySelectorAll<HTMLElement>('.riferimento[data-chiave]'))) {
      if (!chiaviAttese.has(Number(c.getAttribute('data-chiave')))) c.remove();
    }
    for (const a of allegati) {
      const esistente = chipAllegatoPerChiave(editor, a.chiave);
      const nuovo = creaChipAllegato(a, () => {
        this.store.rimuoviAllegato(a.chiave);
        this.editor.focus();
      });
      if (esistente) esistente.replaceWith(nuovo);
      else editor.append(document.createTextNode(' '), nuovo);
    }

    ripulisciSeVuoto(editor);
    this.cursore.set(posizioneCursore(editor, document.getSelection()));
  }
}
