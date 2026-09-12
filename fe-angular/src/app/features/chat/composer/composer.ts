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

import { TokenStore } from '@core/auth/token-store';
import { ChatStore, type AllegatoInCorso, type StatoElaborazioneAllegato } from '../chat-store';
import { Icona } from '@shared/ui/icona/icona';
import { MenuAzioni, type VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { NotificheStore } from '@core/notifiche/notifiche-store';
import { ESTENSIONI_DOCUMENTO, Id, ModoAllegato, RiferimentoDocumento } from '@core/models';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import {
  chiaveGruppo,
  raggruppaRiferimenti,
  type GruppoRiferimenti,
} from '@shared/riferimenti/gruppi';
import { ErroreMicrofono, Registratore } from './registratore';
import { immaginiIncollate } from './appunti';
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
  host: {
    '[class.is-attaccato]': 'attaccatoSopra()',
  },
})
export class Composer {
  protected readonly store = inject(ChatStore);

  /** Vero nella chat di un cliente: vedi `Conversazione.perCliente`. */
  private readonly token = inject(TokenStore);
  protected readonly perCliente = computed(() => Boolean(this.token.tokenOspite()));

  /* La finestra di scelta mostra solo ciò che sappiamo leggere: scoprirlo
     dopo il caricamento, con un 415, è il modo peggiore di apprenderlo. */
  protected readonly estensioni = ESTENSIONI_DOCUMENTO;

  /** Documenti da non riproporre nel selettore: già nel contesto. */
  readonly giaInContesto = input<string[]>([]);

  /**
   * Vero quando sopra il campo c'è qualcosa che gli si appoggia (la barra
   * delle azioni sulla conversazione, 12/09/2026): il riquadro smette di
   * arrotondarsi in cima, e i due pezzi diventano un blocco solo.
   *
   * Lo dice chi lo usa invece di farselo indovinare, e soprattutto invece
   * di far allungare le mani sul `.campo` da fuori: è dentro questo
   * componente, e da fuori si raggiunge solo forzando l'incapsulamento.
   */
  readonly attaccatoSopra = input(false);

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

  /**
   * In chat si referenzia il **prodotto**, non il singolo documento
   * (12/09/2026): il pannello mostra una riga per set informativo, e
   * sceglierla porta nel contesto tutti i documenti del set sotto un chip
   * solo. Altrove (tabelle, agenti) la riga è e resta un documento.
   */
  protected readonly granularita = 'prodotto' as const;

  protected readonly selettoreAperto = computed(() => {
    const menzione = this.menzione();
    return !!menzione && menzione.inizio !== this.soppressaDa();
  });

  protected readonly esclusi = computed(() => [
    ...this.giaInContesto(),
    ...this.store.riferimentiBozza().map((r) => r.id),
  ]);

  constructor() {
    /* Il livello mostrato accanto al microfono è quello dell'agenzia di
       adesso, non di quando si è aperta la chat la prima volta. */
    this.store.aggiornaLivelli();

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
    /* I chip portano la chiave del **gruppo**: l'id del documento, o quella
       del set. Un prodotto tolto con Backspace si porta via i suoi documenti
       tutti insieme. */
    const presenti = new Set(idChip(editor));
    if (this.store.riferimentiBozza().some((r) => !presenti.has(chiaveGruppo(r)))) {
      // Un chip tolto con Backspace: il riferimento se ne va con lui.
      this.store.riferimentiBozza.update((r) => r.filter((d) => presenti.has(chiaveGruppo(d))));
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

  /**
   * Si incolla solo testo: l'editor non accetta markup da fuori.
   *
   * Un'immagine è l'eccezione, perché non è markup ma contenuto. Va **solo
   * in questa chat** (`rapido`), mai nell'Archivio Privato: quello che si
   * incolla è materiale di passaggio, e nell'archivio dell'agenzia i
   * documenti ci si mettono apposta, dal menù di fianco.
   */
  protected incolla(evento: ClipboardEvent): void {
    evento.preventDefault();
    const { leggibili, scartate } = immaginiIncollate(evento.clipboardData);
    if (leggibili.length) this.store.allega(leggibili, 'rapido');
    if (scartate) {
      /* Come per la finestra di scelta: che un formato non si legga si dice
         prima, non con un 415 dopo il caricamento. */
      this.notifiche.aggiungi({
        gravita: 'errore',
        titolo: scartate > 1 ? 'Immagini non allegate' : 'Immagine non allegata',
        dettaglio: 'Di immagini sappiamo leggere PNG e JPEG: salvala in uno dei due e allegala.',
      });
    }
    if (leggibili.length || scartate) return;

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
    this.referenziaInsieme([documento]);
  }

  /**
   * Un cliente menzionato: la conversazione diventa sua, e la `@` sparisce
   * dal testo.
   *
   * Non nasce un chip come per i documenti: il cliente non è un documento
   * nel contesto, è **di chi si sta parlando**, e si vede nella barra del
   * contesto, dove resta finché non lo si stacca. Un chip nel messaggio
   * direbbe che quella menzione vale per quel messaggio, e non è così.
   */
  protected aggancia(cliente: { id: string; nome: string }): void {
    this.inScelta = true;
    const menzione = this.menzione();
    const editor = this.editor;
    editor.focus();
    if (menzione) sostituisciIntervallo(editor, menzione.inizio, this.cursore(), document.createTextNode(''));
    this.store.agganciaCliente(cliente);
    this.aggiorna();
    this.inScelta = false;
  }

  /**
   * Un prodotto scelto: i documenti del suo set entrano tutti nel contesto,
   * ma nel testo compare **un chip solo**, col nome del prodotto. Toglierlo
   * li toglie insieme, che è il motivo per cui sono un gruppo.
   */
  protected referenziaInsieme(documenti: RiferimentoDocumento[]): void {
    const gruppo = raggruppaRiferimenti(documenti)[0];
    if (!gruppo) return;
    /* Il fuoco è nel campo di ricerca del pannello: torna qui, e ci resta
       perché il pannello sparisce insieme alla menzione. */
    this.inScelta = true;
    const menzione = this.menzione();
    const chip = this.nuovoChip(gruppo);
    const editor = this.editor;
    editor.focus();
    const da = menzione ? menzione.inizio : this.cursore();
    const a = menzione ? this.cursore() : this.cursore();
    sostituisciIntervallo(editor, da, a, chip);
    // Uno spazio dopo il chip: si continua a scrivere senza incollarsi.
    scriviDopoChip(editor, chip, ' ');
    for (const d of gruppo.riferimenti) this.store.aggiungiRiferimento(d);
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
   * scritta com'è: dove finisce il documento, e se si aspetta la lettura.
   * Quello «solo per questa chat» non si trascrive (11/09/2026): è pronto
   * subito, e il motore apre il file com'è quando parte la domanda.
   */
  protected readonly vociAllega: VoceMenu[] = [
    {
      etichetta: 'Aggiungi all’Archivio privato',
      dettaglio: 'lettura accurata, resta all’agenzia',
      azione: () => this.scegliFile('archivio'),
    },
    {
      etichetta: 'Solo per questa chat',
      dettaglio: 'subito, non resta in archivio',
      azione: () => this.scegliFile('rapido'),
    },
  ];

  /**
   * I livelli, con quello in uso e quello dell'agenzia segnati a destra:
   * scegliere quello dell'agenzia è il modo di tornarci.
   */
  protected readonly vociLivelli = computed<VoceMenu[]>(() => {
    const inUso = this.store.livelloInUso()?.id;
    const agenzia = this.store.livelloAgenzia()?.id;
    return this.store.livelli().map((l) => ({
      etichetta: l.nome,
      ...(l.id === inUso ? { dettaglio: 'in uso' } : l.id === agenzia ? { dettaglio: 'agenzia' } : {}),
      azione: () => {
        this.store.scegliLivello(l.id);
        this.editor.focus();
      },
    }));
  });

  protected readonly titoloLivello = computed(() => {
    const agenzia = this.store.livelloAgenzia()?.nome ?? '';
    return this.store.livelloScelto()
      ? `Livello solo per questa chat: quello dell'agenzia è ${agenzia}`
      : `Livello dell'agenzia: puoi cambiarlo solo per questa chat`;
  });

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

  /**
   * Il chip di un gruppo: un documento, o il prodotto coi documenti del suo
   * set. Miniatura e stato di lettura valgono per il documento singolo - un
   * set dell'Archivio Pubblico è sempre già letto.
   */
  private nuovoChip(gruppo: GruppoRiferimenti): HTMLElement {
    const solo = gruppo.riferimenti.length === 1 ? gruppo.riferimenti[0] : undefined;
    const anteprima = solo && this.store.anteprima(solo.id);
    return creaChipDocumento(
      {
        id: gruppo.chiave,
        titolo: gruppo.titolo,
        archivio: gruppo.archivio,
        ...(anteprima && { anteprima }),
      },
      () => {
        chipPerId(this.editor, gruppo.chiave)?.remove();
        for (const r of gruppo.riferimenti) this.store.rimuoviRiferimento(r.id);
        this.aggiorna();
        this.editor.focus();
      },
      solo && this.store.elaborazioni().get(solo.id),
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
    /* Si riconcilia per gruppo, non per documento: i quattro documenti di un
       set sono un chip solo, e vanno e vengono insieme. */
    const gruppi = raggruppaRiferimenti(riferimenti);
    const attesi = new Set(gruppi.map((g) => g.chiave));

    if (testoEditor(editor) !== testo) {
      editor.replaceChildren();
      for (const g of gruppi) editor.append(this.nuovoChip(g), document.createTextNode(' '));
      if (testo) editor.append(document.createTextNode(testo));
      if (document.activeElement === editor) posizionaCursore(editor, testo.length);
    } else {
      for (const id of presenti) if (!attesi.has(id)) chipPerId(editor, id)?.remove();
      for (const g of gruppi) {
        if (!presenti.has(g.chiave)) editor.append(document.createTextNode(' '), this.nuovoChip(g));
      }
    }

    /* Il chip di un documento che sta ancora venendo letto cambia faccia
       quando il server finisce: si rifà quello e basta, riconoscendolo dallo
       stato che porta scritto addosso. */
    for (const g of gruppi) {
      const chip = chipPerId(editor, g.chiave);
      if (!chip) continue;
      const solo = g.riferimenti.length === 1 ? g.riferimenti[0] : undefined;
      const atteso = (solo && elaborazioni.get(solo.id)?.stato) ?? '';
      if ((chip.dataset['stato'] ?? '') !== atteso) chip.replaceWith(this.nuovoChip(g));
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
