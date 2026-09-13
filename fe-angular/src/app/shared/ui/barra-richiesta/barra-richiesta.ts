import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import type { RiferimentoDocumento } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { raggruppaRiferimenti } from '@shared/riferimenti/gruppi';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import {
  creaChipCliente,
  creaChipDocumento,
  posizionaCursore,
  posizioneCursore,
  ripulisciSeVuoto,
  scriviDopoChip,
  sostituisciIntervallo,
  testoEditor,
} from './editor-testo';
import { menzioneAlCursore } from './menzione';
import {
  ATTR_CHIAVE_RIFERIMENTO,
  ATTR_TIPO_RIFERIMENTO,
  riferimentiNelTesto,
  segmenti,
  testoConMarcatori,
  type RiferimentoBarra,
} from './riferimenti-in-linea';

/**
 * La barra della richiesta: testo e, fra le parole, i chip di documenti,
 * prodotti e clienti (14/09/2026).
 *
 * È la barra della chat senza la chat. Lo stesso editor (`editor-testo.ts`),
 * la stessa `@` (`menzione.ts`), lo stesso selettore e gli stessi stili; ma
 * non conosce `ChatStore`, non allega, non manda niente. Chi la usa le lega
 * due modelli, il testo e i riferimenti, e le aggiunge i suoi pulsanti.
 *
 * A differenza del composer i riferimenti restano **al loro posto** nel
 * testo (`riferimenti-in-linea.ts`): è per le richieste che si riaprono e si
 * correggono, come quella di un agente.
 */
@Component({
  selector: 'ui-barra-richiesta',
  imports: [Icona, SelettoreDocumenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barra-richiesta.html',
  styleUrl: './barra-richiesta.scss',
})
export class BarraRichiesta {
  /** Il testo coi riferimenti come marcatori: è quello che si salva. */
  readonly testo = model('');
  /** I riferimenti citati, con quanto serve a disegnarne i chip. */
  readonly riferimenti = model<RiferimentoBarra[]>([]);

  readonly placeholder = input('Scrivi la richiesta - «@» per documenti, prodotti e clienti');
  readonly ariaLabel = input('Richiesta');
  /** Se fra i risultati della `@` ci vanno anche i clienti. */
  readonly conClienti = input(true);

  private readonly area = viewChild.required<ElementRef<HTMLDivElement>>('area');

  /* Il testo senza chip e il cursore in quel testo: la menzione ragiona lì,
     come nel composer, e i marcatori non la confondono. */
  private readonly testoSemplice = signal('');
  private readonly cursore = signal(0);
  /** Menzione chiusa con Esc: resta chiusa finché si resta su quella `@`. */
  private readonly soppressaDa = signal<number | undefined>(undefined);
  /** Vero mentre un chip prende il posto della `@query`: vedi `chiudiSelettore()`. */
  private inScelta = false;

  protected readonly menzione = computed(() => menzioneAlCursore(this.testoSemplice(), this.cursore()));

  protected readonly selettoreAperto = computed(() => {
    const menzione = this.menzione();
    return !!menzione && menzione.inizio !== this.soppressaDa();
  });

  /** I documenti già citati non si ripropongono: quelli dei prodotti compresi. */
  protected readonly esclusi = computed(() =>
    this.riferimenti().flatMap((r) =>
      r.tipo === 'documento' ? [r.chiave] : r.tipo === 'prodotto' ? r.documenti.map((d) => d.id) : [],
    ),
  );

  constructor() {
    /* Il modello verso l'editor: si ricostruisce solo se il testo è
       davvero cambiato da fuori (un agente aperto in modifica, un ripristino).
       Ogni gesto dell'utente passa da `aggiorna()`, che scrive lo stesso
       testo che l'editor già mostra, e qui non succede niente. */
    effect(() => {
      const testo = this.testo();
      const riferimenti = this.riferimenti();
      untracked(() => this.ricostruisciSeCambiato(testo, riferimenti));
    });
  }

  private get editor(): HTMLDivElement {
    return this.area().nativeElement;
  }

  /** Dall'editor ai modelli, dopo ogni gesto. */
  protected aggiorna(): void {
    const editor = this.editor;
    ripulisciSeVuoto(editor);
    const testo = testoConMarcatori(editor);
    this.testoSemplice.set(testoEditor(editor));
    /* Un chip tolto con Backspace si porta via il suo riferimento. */
    const citati = new Set(riferimentiNelTesto(testo).map((r) => `${r.tipo}:${r.chiave}`));
    if (this.riferimenti().some((r) => !citati.has(`${r.tipo}:${r.chiave}`))) {
      this.riferimenti.update((tutti) => tutti.filter((r) => citati.has(`${r.tipo}:${r.chiave}`)));
    }
    this.testo.set(testo);
    this.aggiornaCursore();
  }

  protected aggiornaCursore(): void {
    this.cursore.set(posizioneCursore(this.editor, document.getSelection()));
    if (!this.menzione()) this.soppressaDa.set(undefined);
  }

  /* Invio va a capo: una richiesta si scrive su più righe, e qui non c'è
     niente da mandare. */
  protected suTasto(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.isComposing) {
      evento.preventDefault();
      this.inserisciTesto('\n');
    }
  }

  /** Si incolla solo testo: l'editor non accetta markup da fuori. */
  protected incolla(evento: ClipboardEvent): void {
    evento.preventDefault();
    const testo = evento.clipboardData?.getData('text/plain') ?? '';
    if (testo) this.inserisciTesto(testo);
  }

  /** Il pulsante di referenziazione è la stessa `@`, per chi non la conosce. */
  protected apriDaPulsante(): void {
    this.editor.focus();
    const prefisso = this.testoSemplice().slice(0, this.cursore());
    const inserto = !prefisso || /[\s([{]$/.test(prefisso) ? '@' : ' @';
    this.soppressaDa.set(undefined);
    this.inserisciTesto(inserto);
  }

  /** Il selettore si chiude senza scegliere, e la `@` se ne va con lui. */
  protected chiudiSelettore(): void {
    if (this.inScelta || !this.selettoreAperto()) return;
    const menzione = this.menzione();
    if (!menzione) return;
    this.soppressaDa.set(menzione.inizio);
    this.editor.focus();
    sostituisciIntervallo(this.editor, menzione.inizio, this.cursore(), document.createTextNode(''));
    this.aggiorna();
  }

  protected referenzia(documento: RiferimentoDocumento): void {
    this.referenziaInsieme([documento]);
  }

  /** Un prodotto è un chip solo, coi documenti del suo set dietro. */
  protected referenziaInsieme(documenti: RiferimentoDocumento[]): void {
    const gruppo = raggruppaRiferimenti(documenti)[0];
    if (!gruppo) return;
    this.inserisci(
      gruppo.riferimenti[0]?.set
        ? { tipo: 'prodotto', chiave: gruppo.chiave, titolo: gruppo.titolo, documenti: gruppo.riferimenti }
        : { tipo: 'documento', chiave: gruppo.chiave, titolo: gruppo.titolo, archivio: gruppo.archivio },
    );
  }

  protected aggancia(cliente: { id: string; nome: string }): void {
    this.inserisci({ tipo: 'cliente', chiave: cliente.id, titolo: cliente.nome });
  }

  /** La `@query` diventa il chip, lì dove stava, col cursore subito dopo. */
  private inserisci(riferimento: RiferimentoBarra): void {
    this.inScelta = true;
    const menzione = this.menzione();
    const editor = this.editor;
    editor.focus();
    const chip = this.nuovoChip(riferimento);
    const da = menzione ? menzione.inizio : this.cursore();
    sostituisciIntervallo(editor, da, this.cursore(), chip);
    scriviDopoChip(editor, chip, ' ');
    if (!this.riferimenti().some((r) => r.tipo === riferimento.tipo && r.chiave === riferimento.chiave)) {
      this.riferimenti.update((tutti) => [...tutti, riferimento]);
    }
    this.aggiorna();
    this.inScelta = false;
  }

  private inserisciTesto(testo: string): void {
    const editor = this.editor;
    editor.focus();
    const posizione = this.cursore();
    sostituisciIntervallo(editor, posizione, posizione, document.createTextNode(testo));
    this.aggiorna();
  }

  /** Il chip di un riferimento, con gli attributi che lo fanno tornare marcatore. */
  private nuovoChip(riferimento: RiferimentoBarra | undefined, tipo?: string, chiave?: string): HTMLElement {
    const togli = (chip: HTMLElement) => () => {
      chip.remove();
      this.aggiorna();
      this.editor.focus();
    };
    let chip: HTMLElement;
    if (!riferimento) {
      /* Un riferimento che il server non sa più risolvere (un documento
         eliminato): il chip resta, e dice che cosa è successo. */
      chip = creaChipDocumento(
        { id: chiave ?? '', titolo: 'Riferimento non più disponibile', archivio: 'privato' },
        () => togli(chip)(),
        { stato: 'errore', messaggio: 'non trovato' },
      );
    } else if (riferimento.tipo === 'cliente') {
      chip = creaChipCliente({ id: riferimento.chiave, nome: riferimento.titolo }, () => togli(chip)());
    } else {
      chip = creaChipDocumento(
        {
          id: riferimento.chiave,
          titolo: riferimento.titolo,
          archivio: riferimento.tipo === 'prodotto' ? 'pubblico' : riferimento.archivio,
        },
        () => togli(chip)(),
      );
    }
    chip.setAttribute(ATTR_TIPO_RIFERIMENTO, riferimento?.tipo ?? tipo ?? 'documento');
    chip.setAttribute(ATTR_CHIAVE_RIFERIMENTO, riferimento?.chiave ?? chiave ?? '');
    return chip;
  }

  private ricostruisciSeCambiato(testo: string, riferimenti: RiferimentoBarra[]): void {
    const editor = this.editor;
    if (testoConMarcatori(editor) === testo) return;
    editor.replaceChildren();
    for (const s of segmenti(testo)) {
      if (!('tipo' in s)) {
        editor.append(document.createTextNode(s.testo));
        continue;
      }
      const riferimento = riferimenti.find((r) => r.tipo === s.tipo && r.chiave === s.chiave);
      editor.append(this.nuovoChip(riferimento, s.tipo, s.chiave));
    }
    this.testoSemplice.set(testoEditor(editor));
    if (document.activeElement === editor) posizionaCursore(editor, this.testoSemplice().length);
  }
}
