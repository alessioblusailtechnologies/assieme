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

import { ChatStore, type AllegatoInCorso } from '../chat-store';
import { Icona } from '@shared/ui/icona/icona';
import { RiferimentoDocumento } from '@core/models';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import {
  chipAllegatoPerChiave,
  chipPerId,
  creaChipAllegato,
  creaChipDocumento,
  idChip,
  posizionaCursore,
  posizioneCursore,
  ripulisciSeVuoto,
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
  imports: [Icona, SelettoreDocumenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
})
export class Composer {
  protected readonly store = inject(ChatStore);

  /** Documenti da non riproporre nel selettore: già nel contesto. */
  readonly giaInContesto = input<string[]>([]);

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');
  private readonly selettore = viewChild(SelettoreDocumenti);

  /*
   * La posizione del cursore è stato a tutti gli effetti: la menzione attiva
   * dipende da dove si sta scrivendo, non solo da cosa c'è scritto.
   */
  private readonly cursore = signal(0);

  /** Menzione chiusa con Esc: resta chiusa finché si resta su quella `@`. */
  private readonly soppressaDa = signal<number | undefined>(undefined);

  protected readonly menzione = computed(() => menzioneAlCursore(this.store.bozza(), this.cursore()));

  protected readonly selettoreAperto = computed(() => {
    const menzione = this.menzione();
    return !!menzione && menzione.inizio !== this.soppressaDa();
  });

  protected readonly esclusi = computed(() => [
    ...this.giaInContesto(),
    ...this.store.riferimentiBozza().map((r) => r.id),
  ]);

  protected readonly idOpzioneAttiva = computed(() =>
    this.selettoreAperto() ? this.selettore()?.idOpzioneAttiva() : undefined,
  );

  constructor() {
    // Lo store → l'editor: ricostruzione sul testo, riconciliazione sui chip.
    effect(() => {
      const testo = this.store.bozza();
      const riferimenti = this.store.riferimentiBozza();
      const allegati = this.store.allegati();
      untracked(() => this.sincronizzaEditor(testo, riferimenti, allegati));
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
    if (this.selettoreAperto()) {
      const consumato = this.selettore()?.gestisciTasto(evento);
      if (consumato) {
        evento.preventDefault();
        return;
      }
    }
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

  protected chiudiSelettore(): void {
    const menzione = this.menzione();
    if (menzione) this.soppressaDa.set(menzione.inizio);
  }

  /**
   * Documento scelto: la `@query` diventa il chip, lì dove stava. Il fuoco
   * non si è mai mosso dal campo; il cursore resta subito dopo il chip.
   */
  protected referenzia(documento: RiferimentoDocumento): void {
    const menzione = this.menzione();
    const chip = this.nuovoChip(documento);
    const editor = this.editor;
    editor.focus();
    const da = menzione ? menzione.inizio : this.cursore();
    const a = menzione ? this.cursore() : this.cursore();
    sostituisciIntervallo(editor, da, a, chip);
    // Uno spazio dopo il chip: si continua a scrivere senza incollarsi.
    sostituisciIntervallo(editor, testoAlPunto(editor, chip), testoAlPunto(editor, chip), document.createTextNode(' '));
    this.store.aggiungiRiferimento(documento);
    this.aggiorna();
  }

  /**
   * RF-C-02: un file allegato dal disco. Non entra negli archivi — vive con
   * la conversazione; appena caricato compare come riferimento del contesto.
   */
  protected allegaFile(evento: Event): void {
    const ingresso = evento.target as HTMLInputElement;
    this.store.allega([...(ingresso.files ?? [])]);
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

  private inserisciTesto(testo: string): void {
    const editor = this.editor;
    editor.focus();
    const posizione = this.cursore();
    sostituisciIntervallo(editor, posizione, posizione, document.createTextNode(testo));
    this.aggiorna();
  }

  private nuovoChip(documento: RiferimentoDocumento): HTMLElement {
    return creaChipDocumento(documento, () => {
      chipPerId(this.editor, documento.id)?.remove();
      this.store.rimuoviRiferimento(documento.id);
      this.aggiorna();
      this.editor.focus();
    });
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

/** La posizione di testo subito dopo un chip (i chip non contano caratteri). */
function testoAlPunto(editor: HTMLElement, chip: HTMLElement): number {
  const intervallo = editor.ownerDocument.createRange();
  intervallo.setStart(editor, 0);
  intervallo.setEndAfter(chip);
  const contenitore = document.createElement('div');
  contenitore.append(intervallo.cloneContents());
  return testoEditor(contenitore).length;
}
