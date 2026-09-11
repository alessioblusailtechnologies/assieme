import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import type { Editor } from '@tiptap/core';
import { firstValueFrom } from 'rxjs';

import {
  ALTEZZA_MASSIMA_FASCIA,
  Allineamento,
  Ancoraggio,
  CORPO_BASE,
  COLORE_TESTO,
  ETICHETTE_CAMPO,
  ETICHETTE_FAMIGLIA,
  Elemento,
  ElementoTesto,
  ErroreApi,
  FONT_FAMIGLIA,
  Famiglia,
  Fascia,
  Intestazione,
  LARGHEZZA_FOGLIO,
  MARGINE_FOGLIO,
  NomeCampo,
  Paragrafo,
} from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { IntestazioneApi } from '@core/api/intestazione-api';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { CasellaTesto, TastoCasella } from './casella-testo';
import {
  coloreEsadecimale,
  corpoValido,
  decimo,
  fasciaNormalizzata,
  testoVuoto,
} from './normalizza';
import {
  Allineamento as Disposizione,
  Guida,
  Maniglia,
  Rettangolo,
  aggancia,
  allinea,
  contorno,
  distribuisci,
  nelFoglio,
  ridimensiona,
  riferimenti,
  siToccano,
} from './tela';
import {
  AttributoStile,
  Segno,
  allineamentoComune,
  conAllineamento,
  conSegno,
  senzaStile,
  tuttiConSegno,
  valoreComune,
} from './testo';

type NomeFascia = 'intestazione' | 'piede';

const FASCE: readonly NomeFascia[] = ['intestazione', 'piede'];

/** Il respiro fra una fascia e il corpo dei documenti (16 pt), in millimetri. */
const RESPIRO = (16 * 25.4) / 72;
/** Quanto si mostra alta una fascia vuota: abbastanza per cliccarci e leggere che cosa fare. */
const ALTEZZA_VUOTA = 16;
/** Da quanti pixel dello schermo una guida attira chi si muove. */
const SOGLIA_PX = 6;
/** Sotto questi pixel un clic resta un clic, non un trascinamento. */
const TREMOLIO_PX = 3;
/** Le frecce spostano di mezzo millimetro, di cinque con Maiuscolo. */
const PASSO = 0.5;
const PASSO_LUNGO = 5;

const MINIMI: Record<Elemento['tipo'], { larghezza: number; altezza: number }> = {
  testo: { larghezza: 5, altezza: 2 },
  immagine: { larghezza: 3, altezza: 1 },
  forma: { larghezza: 0.1, altezza: 0.1 },
};

const MANIGLIE: readonly Maniglia[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** Un'immagine si allarga dagli angoli, e tiene le proporzioni. */
const MANIGLIE_IMMAGINE: readonly Maniglia[] = ['nw', 'ne', 'se', 'sw'];

/** I corpi proposti; se ne può scrivere un altro, dal 5 al 72. */
const CORPI = [6, 7, 7.5, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

/** Pochi colori, e quello del marchio lo si sceglie una volta: poi torna fra questi. */
const TINTE = [
  { valore: COLORE_TESTO, etichetta: 'Colore del testo' },
  { valore: '#737373', etichetta: 'Grigio' },
  { valore: '#2f4b7c', etichetta: 'Blu' },
] as const;

/** Gli esempi accanto ai campi, nel menù: che cosa diventeranno sulla carta. */
const ESEMPI_CAMPO: Record<NomeCampo, string> = {
  pagina: '3',
  pagine: '12',
  data: 'oggi',
  titolo: 'dal documento',
  agenzia: 'dal profilo',
};

const FASCIA_VUOTA: Fascia = { altezza: 0, elementi: [] };

/** Gli elementi copiati, per incollarli anche nell'altra fascia. */
let appunti: Elemento[] = [];

let progressivo = 0;
const nuovoId = (): string => `e${Date.now().toString(36)}${(progressivo++).toString(36)}`;

const uguali = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const entro = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Lo stesso valore in tutti, o `undefined`. */
function comune<T>(valori: readonly T[]): T | undefined {
  return valori.length && valori.every((v) => v === valori[0]) ? valori[0] : undefined;
}

/** Il rapporto altezza/larghezza di un'immagine, dal file appena scelto. */
function proporzioni(url: string): Promise<number> {
  return new Promise((risolvi) => {
    const img = new Image();
    const riserva = setTimeout(() => risolvi(0.5), 3000);
    img.onload = () => {
      clearTimeout(riserva);
      risolvi(img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.5);
    };
    img.onerror = () => {
      clearTimeout(riserva);
      risolvi(0.5);
    };
    img.src = url;
  });
}

interface StatoTesto {
  grassetto: boolean;
  corsivo: boolean;
  sottolineato: boolean;
  corpo: number | undefined;
  famiglia: Famiglia | undefined;
  colore: string | undefined;
  allineamento: Allineamento | undefined;
  verticale: Ancoraggio | undefined;
}

interface StatoBarra {
  puoAnnullare: boolean;
  puoRipetere: boolean;
  quanti: number;
  /** L'elemento selezionato, se è uno solo. */
  unico: Elemento | undefined;
  /** Con una casella in scrittura, o solo caselle selezionate. */
  testo: StatoTesto | undefined;
  /** Vero se sono selezionate solo forme; `forma` è il loro colore, se è uno. */
  forme: boolean;
  forma: string | undefined;
  immagine: boolean;
}

interface Gesto {
  tipo: 'sposta' | 'ridimensiona' | 'lazo' | 'altezza';
  fascia: NomeFascia;
  /** Il modello prima del gesto: la voce della cronologia, se qualcosa cambia. */
  prima: Intestazione;
  clientX: number;
  clientY: number;
  /** Pixel per millimetro, e l'origine della fascia sullo schermo. */
  mmPx: number;
  origine: { left: number; top: number };
  /** L'altezza della fascia all'inizio del gesto. */
  altezza: number;
  mosso: boolean;
  partenze?: Map<string, Rettangolo>;
  maniglia?: Maniglia;
  elemento?: Elemento;
  rettangolo?: Rettangolo;
  selezionePrima?: readonly string[];
  /** L'elemento cliccato dentro una selezione di più: se non ci si muove, resta selezionato solo lui. */
  soloLui?: string;
}

/**
 * L'editor di intestazione e piè di pagina (11/09/2026): due tele libere su
 * un foglio A4 in scala.
 *
 * Ogni fascia è larga quanto il foglio e alta quanto si vuole, e dentro
 * caselle di testo, immagini e forme stanno dove le si mette: si
 * trascinano, si allargano dalle maniglie, si allineano fra loro o ai
 * margini con le guide che attirano, si spostano dalla tastiera. Il testo
 * di una casella si scrive con un doppio clic, e sta in cima, a metà o in
 * fondo. È la libertà che il flusso di paragrafi e colonne di prima non
 * dava: un nome accanto a un logo alto, centrato, e un secondo logo dopo.
 *
 * Una barra sola, che cambia con ciò che è selezionato, e una cronologia
 * sola per tutto, testo compreso. Le misure sono quelle del motore:
 * millimetri sul foglio, punti per il testo, alla scala del contenitore
 * (`--mm`, `--pt`).
 */
@Component({
  selector: 'app-editor-intestazione',
  imports: [CasellaTesto, Icona, MenuAzioni, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-intestazione.html',
  styleUrl: './editor-intestazione.scss',
})
export class EditorIntestazione {
  private readonly api = inject(IntestazioneApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Il contenuto da caricare: cambia al caricamento e ad «Annulla», non a ogni gesto. */
  readonly valore = input.required<Intestazione>();
  readonly modificabile = input(true);
  /** A ogni modifica, nella forma del contratto. */
  readonly cambiato = output<Intestazione>();

  private readonly foglio = viewChild<ElementRef<HTMLElement>>('foglio');
  private readonly sceltaFile = viewChild<ElementRef<HTMLInputElement>>('sceltaFile');
  private readonly caselle = viewChildren(CasellaTesto);

  protected readonly fasce = FASCE;
  protected readonly modello = signal<Intestazione>({
    intestazione: FASCIA_VUOTA,
    piede: FASCIA_VUOTA,
  });
  protected readonly attiva = signal<NomeFascia>('intestazione');
  protected readonly selezione = signal<readonly string[]>([]);
  /** La casella in cui si sta scrivendo. */
  protected readonly inModifica = signal<string | undefined>(undefined);
  protected readonly guide = signal<readonly Guida[]>([]);
  protected readonly lazo = signal<Rettangolo | undefined>(undefined);
  /** L'altezza del testo di ogni casella, in millimetri, come la misura il browser. */
  private readonly contenuti = signal<ReadonlyMap<string, number>>(new Map());

  private readonly passato = signal<readonly Intestazione[]>([]);
  private readonly futuro = signal<readonly Intestazione[]>([]);
  /** La chiave dell'ultima voce della cronologia: modifiche di fila con la stessa chiave ne fanno una sola. */
  private ultimaChiave: { chiave: string; quando: number } | undefined;
  /** Cresce a ogni transazione di TipTap: la barra si ricalcola leggendolo. */
  private readonly versione = signal(0);

  protected readonly urlImmagini = signal<Readonly<Record<string, string>>>({});
  private readonly richieste = new Set<string>();
  protected readonly caricamentoImmagine = signal(false);
  protected readonly erroreImmagine = signal<string | undefined>(undefined);
  private sostituisci = false;

  private gesto: Gesto | undefined;
  /**
   * L'ultimo clic su un elemento, per riconoscere il doppio clic: il
   * `dblclick` del browser non arriva, perché il `pointerdown` si ferma
   * (niente selezione del testo della pagina mentre si trascina).
   */
  private ultimoClic: { id: string; quando: number; x: number; y: number } | undefined;

  protected readonly tinte = TINTE;
  protected readonly corpi = CORPI;
  protected readonly famiglie = Object.entries(ETICHETTE_FAMIGLIA) as [Famiglia, string][];
  protected readonly fontFamiglia = FONT_FAMIGLIA;
  protected readonly margine = MARGINE_FOGLIO;
  protected readonly larghezzaFoglio = LARGHEZZA_FOGLIO;

  protected readonly vociCampo: VoceMenu[] = (Object.keys(ETICHETTE_CAMPO) as NomeCampo[]).map(
    (nome) => ({
      etichetta: ETICHETTE_CAMPO[nome],
      dettaglio: ESEMPI_CAMPO[nome],
      azione: () => this.inserisciCampo(nome),
    }),
  );

  protected readonly selezionati = computed(() => {
    const ids = new Set(this.selezione());
    return this.modello()[this.attiva()].elementi.filter((e) => ids.has(e.id));
  });

  /** I colori scelti a mano già usati nelle due fasce: il marchio dell'agenzia, di solito. */
  protected readonly tinteUsate = computed(() => {
    const note = new Set<string>(TINTE.map((t) => t.valore));
    const usate = new Set<string>();
    const aggiungi = (c: string | null | undefined): void => {
      const hex = coloreEsadecimale(c);
      if (hex && !note.has(hex)) usate.add(hex);
    };
    for (const nome of FASCE) {
      for (const e of this.modello()[nome].elementi) {
        if (e.tipo === 'immagine') continue;
        aggiungi(e.colore);
        if (e.tipo !== 'testo') continue;
        for (const p of e.paragrafi)
          for (const n of p.content ?? [])
            if (n.type !== 'hardBreak')
              for (const m of n.marks ?? []) if (m.type === 'textStyle') aggiungi(m.attrs?.color);
      }
    }
    return [...usate].slice(0, 4);
  });

  protected readonly stato = computed<StatoBarra>(() => {
    this.versione();
    const selezionati = this.selezionati();
    const unico = selezionati.length === 1 ? selezionati[0] : undefined;
    const forme = selezionati.length > 0 && selezionati.every((e) => e.tipo === 'forma');
    return {
      puoAnnullare: this.passato().length > 0,
      puoRipetere: this.futuro().length > 0,
      quanti: selezionati.length,
      unico,
      testo: this.statoTesto(selezionati),
      forme,
      forma: forme ? comune(selezionati.map((e) => (e as { colore: string }).colore)) : undefined,
      immagine: unico?.tipo === 'immagine',
    };
  });

  constructor() {
    /* Il contenuto nuovo si carica senza entrare nella cronologia: «Annulla» non deve riportare al foglio bianco. */
    effect(() => {
      const valore = this.valore();
      untracked(() => {
        this.modello.set({
          intestazione: fasciaNormalizzata(valore.intestazione),
          piede: fasciaNormalizzata(valore.piede),
        });
        this.passato.set([]);
        this.futuro.set([]);
        this.selezione.set([]);
        this.inModifica.set(undefined);
      });
    });

    /* Le immagini si scaricano col token, una volta sola. */
    effect(() => {
      const ids = FASCE.flatMap((nome) =>
        this.modello()[nome].elementi.flatMap((e) => (e.tipo === 'immagine' ? [e.immagine] : [])),
      );
      untracked(() => {
        for (const id of ids) {
          if (this.richieste.has(id)) continue;
          this.richieste.add(id);
          void firstValueFrom(this.api.scaricaImmagine(id)).then(
            (blob) => this.urlImmagini.update((u) => ({ ...u, [id]: URL.createObjectURL(blob) })),
            () => undefined,
          );
        }
      });
    });

    /* Mentre si scrive, un clic fuori dall'editor (sul Salva, per dire) chiude la casella. */
    effect((pulizia) => {
      if (!this.inModifica()) return;
      const fuori = (evento: PointerEvent): void => {
        if (!this.host.nativeElement.contains(evento.target as Node)) this.esciDaModifica();
      };
      document.addEventListener('pointerdown', fuori, true);
      pulizia(() => document.removeEventListener('pointerdown', fuori, true));
    });

    inject(DestroyRef).onDestroy(() => {
      this.fermaGesto();
      for (const url of Object.values(this.urlImmagini())) URL.revokeObjectURL(url);
    });
  }

  // --- Misure per il template -------------------------------------------------

  protected mm(valore: number): string {
    return `calc(${valore} * var(--mm))`;
  }

  protected pt(valore: number): string {
    return `calc(${valore} * var(--pt))`;
  }

  /** Una casella è alta almeno quanto il suo testo. */
  protected altezzaVisiva(e: Elemento): number {
    return e.tipo === 'testo' ? Math.max(e.altezza, this.contenuti().get(e.id) ?? 0) : e.altezza;
  }

  protected rettangolo(e: Elemento): Rettangolo {
    return { x: e.x, y: e.y, larghezza: e.larghezza, altezza: this.altezzaVisiva(e) };
  }

  private fondoElementi(fascia: Fascia): number {
    return Math.max(0, ...fascia.elementi.map((e) => e.y + this.altezzaVisiva(e)));
  }

  /** Quanto si vede alta la fascia: la sua altezza, o di più se un testo sporge sotto. */
  protected altezzaMostrata(nome: NomeFascia): number {
    const fascia = this.modello()[nome];
    return fascia.elementi.length
      ? Math.max(fascia.altezza, this.fondoElementi(fascia))
      : ALTEZZA_VUOTA;
  }

  /** Il respiro fra la fascia e il corpo finto: lo stesso del motore, mai meno del margine dal bordo. */
  protected spazioCorpo(nome: NomeFascia): number {
    const fascia = this.modello()[nome];
    const altezza = fascia.elementi.length ? this.altezzaMostrata(nome) : 0;
    return altezza ? Math.max(MARGINE_FOGLIO, altezza + RESPIRO) - altezza : MARGINE_FOGLIO;
  }

  protected maniglie(e: Elemento): readonly Maniglia[] {
    return e.tipo === 'immagine' ? MANIGLIE_IMMAGINE : MANIGLIE;
  }

  protected verticale(e: ElementoTesto): string {
    return e.verticale === 'middle'
      ? 'center'
      : e.verticale === 'bottom'
        ? 'flex-end'
        : 'flex-start';
  }

  protected descrizione(e: Elemento): string {
    if (e.tipo === 'immagine') return 'Immagine';
    if (e.tipo === 'forma') return e.altezza <= 1.5 || e.larghezza <= 1.5 ? 'Linea' : 'Rettangolo';
    const testo = e.paragrafi
      .flatMap((p) => p.content ?? [])
      .map((n) =>
        n.type === 'text' ? n.text : n.type === 'campo' ? ETICHETTE_CAMPO[n.attrs.nome] : ' ',
      )
      .join('')
      .trim();
    return `Casella di testo: ${testo.slice(0, 40) || 'vuota'}`;
  }

  // --- Modello e cronologia -----------------------------------------------------

  private emetti(): void {
    const m = this.modello();
    this.cambiato.emit({
      intestazione: fasciaNormalizzata(m.intestazione),
      piede: fasciaNormalizzata(m.piede),
    });
  }

  /**
   * Un cambiamento che entra nella cronologia. Con una `chiave` uguale a
   * quella di poco prima (lo stesso testo che si scrive, la stessa freccia
   * premuta) si unisce alla voce precedente.
   */
  private cambia(nuovo: Intestazione, chiave?: string): void {
    const attuale = this.modello();
    if (uguali(nuovo, attuale)) return;
    const ora = Date.now();
    const unisci =
      !!chiave && this.ultimaChiave?.chiave === chiave && ora - this.ultimaChiave.quando < 1500;
    if (!unisci) this.passato.update((p) => [...p.slice(-99), attuale]);
    /* Tornati dove si era prima dell'ultima voce: la voce non serve più. */
    const passato = this.passato();
    if (passato.length && uguali(passato[passato.length - 1], nuovo))
      this.passato.set(passato.slice(0, -1));
    this.futuro.set([]);
    this.ultimaChiave = chiave ? { chiave, quando: ora } : undefined;
    this.modello.set(nuovo);
    this.emetti();
  }

  /** Durante un gesto: il modello cambia, la cronologia aspetta la fine. */
  private aggiornaDalGesto(nuovo: Intestazione): void {
    this.modello.set(nuovo);
    this.emetti();
  }

  private registra(prima: Intestazione): void {
    if (uguali(prima, this.modello())) return;
    this.passato.update((p) => [...p.slice(-99), prima]);
    this.futuro.set([]);
    this.ultimaChiave = undefined;
  }

  protected annulla(): void {
    const passato = this.passato();
    if (!passato.length) return;
    this.futuro.update((f) => [this.modello(), ...f]);
    this.passato.set(passato.slice(0, -1));
    this.ricarica(passato[passato.length - 1]!);
  }

  protected ripeti(): void {
    const [prossimo, ...resto] = this.futuro();
    if (!prossimo) return;
    this.passato.update((p) => [...p, this.modello()]);
    this.futuro.set(resto);
    this.ricarica(prossimo);
  }

  private ricarica(stato: Intestazione): void {
    this.ultimaChiave = undefined;
    this.modello.set(stato);
    /* La selezione perde ciò che non c'è più; la casella in scrittura resta se c'è ancora. */
    const presenti = new Set(stato[this.attiva()].elementi.map((e) => e.id));
    this.selezione.update((s) => s.filter((id) => presenti.has(id)));
    if (this.inModifica() && !presenti.has(this.inModifica()!)) this.inModifica.set(undefined);
    this.emetti();
  }

  /** Cambia gli elementi della fascia con gli id dati, e alza la fascia se ne escono sotto. */
  private modificaElementi(
    nome: NomeFascia,
    ids: ReadonlySet<string>,
    cambia: (e: Elemento) => Elemento,
    chiave?: string,
  ): void {
    const m = this.modello();
    const elementi = m[nome].elementi.map((e) => (ids.has(e.id) ? cambia(e) : e));
    this.cambia({ ...m, [nome]: this.conAltezza({ ...m[nome], elementi }) }, chiave);
  }

  /** La fascia alta abbastanza da contenere i suoi elementi (e mai più dell'altezza massima). */
  private conAltezza(fascia: Fascia, minima = 0): Fascia {
    if (!fascia.elementi.length) return { ...fascia, altezza: 0 };
    return {
      ...fascia,
      altezza: decimo(
        entro(
          Math.max(fascia.altezza, minima, this.fondoElementi(fascia)),
          0,
          ALTEZZA_MASSIMA_FASCIA,
        ),
      ),
    };
  }

  private trova(id: string): { nome: NomeFascia; elemento: Elemento } | undefined {
    for (const nome of FASCE) {
      const elemento = this.modello()[nome].elementi.find((e) => e.id === id);
      if (elemento) return { nome, elemento };
    }
    return undefined;
  }

  // --- Selezione e scrittura ------------------------------------------------------

  private attivaFascia(nome: NomeFascia): void {
    if (this.attiva() === nome) return;
    this.attiva.set(nome);
    this.selezione.set([]);
  }

  private fuocoAlFoglio(): void {
    this.foglio()?.nativeElement.focus({ preventScroll: true });
  }

  private casella(id: string): CasellaTesto | undefined {
    return this.caselle().find((c) => c.idElemento() === id);
  }

  /** L'editor della casella in cui si sta scrivendo. */
  private editorInScrittura(): Editor | undefined {
    const id = this.inModifica();
    return id ? this.casella(id)?.editor : undefined;
  }

  protected scriviIn(id: string, punto?: { x: number; y: number }): void {
    const trovato = this.trova(id);
    if (!trovato || trovato.elemento.tipo !== 'testo' || !this.modificabile()) return;
    this.attivaFascia(trovato.nome);
    this.selezione.set([id]);
    this.inModifica.set(id);
    this.ultimaChiave = undefined;
    this.casella(id)?.scrivi(punto);
  }

  /** Smette di scrivere; una casella rimasta vuota se ne va. */
  protected esciDaModifica(): void {
    const id = this.inModifica();
    if (!id) return;
    this.inModifica.set(undefined);
    const trovato = this.trova(id);
    if (trovato?.elemento.tipo === 'testo' && testoVuoto(trovato.elemento.paragrafi)) {
      const m = this.modello();
      const fascia = m[trovato.nome];
      this.cambia(
        {
          ...m,
          [trovato.nome]: this.conAltezza({
            ...fascia,
            elementi: fascia.elementi.filter((e) => e.id !== id),
          }),
        },
        `testo:${id}`,
      );
      this.selezione.update((s) => s.filter((x) => x !== id));
    }
    this.ultimaChiave = undefined;
  }

  protected testoCambiato(nome: NomeFascia, id: string, paragrafi: Paragrafo[]): void {
    this.modificaElementi(
      nome,
      new Set([id]),
      (e) => (e.tipo === 'testo' ? { ...e, paragrafi } : e),
      `testo:${id}`,
    );
  }

  protected altezzaTesto(id: string, pixel: number): void {
    const larghezza = this.foglio()?.nativeElement.getBoundingClientRect().width ?? 0;
    if (!larghezza || !pixel) return;
    const mm = decimo(pixel / (larghezza / LARGHEZZA_FOGLIO));
    if (this.contenuti().get(id) === mm) return;
    this.contenuti.update((c) => new Map(c).set(id, mm));
    /* Mentre ci si scrive, la fascia cresce col testo: è l'altezza che avrà sul documento. */
    const trovato = this.inModifica() === id ? this.trova(id) : undefined;
    if (!trovato) return;
    const m = this.modello();
    const fascia = m[trovato.nome];
    const fondo = this.fondoElementi(fascia);
    if (fondo > fascia.altezza + 0.05) {
      this.aggiornaDalGesto({
        ...m,
        [trovato.nome]: { ...fascia, altezza: decimo(Math.min(fondo, ALTEZZA_MASSIMA_FASCIA)) },
      });
    }
  }

  protected tastoCasella(tasto: TastoCasella): void {
    if (tasto === 'esci') {
      this.esciDaModifica();
      this.fuocoAlFoglio();
    } else if (tasto === 'annulla') this.annulla();
    else this.ripeti();
  }

  protected transazione(): void {
    this.versione.update((v) => v + 1);
  }

  // --- Gesti col puntatore --------------------------------------------------------

  private tela(nome: NomeFascia): HTMLElement | null | undefined {
    return this.foglio()?.nativeElement.querySelector<HTMLElement>(`[data-fascia="${nome}"]`);
  }

  private nuovoGesto(
    evento: PointerEvent,
    nome: NomeFascia,
    tipo: Gesto['tipo'],
  ): Gesto | undefined {
    const tela = this.tela(nome);
    const r = tela?.getBoundingClientRect();
    const mmPx = r ? r.width / LARGHEZZA_FOGLIO : 0;
    return {
      tipo,
      fascia: nome,
      prima: this.modello(),
      clientX: evento.clientX,
      clientY: evento.clientY,
      mmPx: mmPx || 1,
      origine: { left: r?.left ?? 0, top: r?.top ?? 0 },
      altezza: this.modello()[nome].altezza,
      mosso: false,
    };
  }

  private readonly muovi = (evento: PointerEvent): void => this.muoviGesto(evento);
  private readonly rilascia = (): void => this.chiudiGesto();

  private iniziaGesto(gesto: Gesto): void {
    this.fermaGesto();
    this.gesto = gesto;
    document.addEventListener('pointermove', this.muovi);
    document.addEventListener('pointerup', this.rilascia);
    document.addEventListener('pointercancel', this.rilascia);
  }

  private fermaGesto(): void {
    document.removeEventListener('pointermove', this.muovi);
    document.removeEventListener('pointerup', this.rilascia);
    document.removeEventListener('pointercancel', this.rilascia);
    this.gesto = undefined;
  }

  private chiudiGesto(): void {
    const gesto = this.gesto;
    this.fermaGesto();
    this.guide.set([]);
    this.lazo.set(undefined);
    if (gesto?.mosso && gesto.tipo !== 'lazo') this.registra(gesto.prima);
    if (gesto && !gesto.mosso && gesto.soloLui) this.selezione.set([gesto.soloLui]);
  }

  /** Il clic sul fondo di una fascia: toglie la selezione e comincia un lazo. */
  protected premiTela(evento: PointerEvent, nome: NomeFascia): void {
    if (!this.modificabile() || evento.button !== 0) return;
    evento.preventDefault();
    this.esciDaModifica();
    this.attivaFascia(nome);
    this.fuocoAlFoglio();
    const aggiungi = evento.shiftKey || evento.ctrlKey || evento.metaKey;
    if (!aggiungi) this.selezione.set([]);
    const gesto = this.nuovoGesto(evento, nome, 'lazo');
    if (gesto) this.iniziaGesto({ ...gesto, selezionePrima: this.selezione() });
  }

  protected premiElemento(evento: PointerEvent, nome: NomeFascia, elemento: Elemento): void {
    if (!this.modificabile() || evento.button !== 0) return;
    /* Nella casella in cui si scrive, il clic è di TipTap: sposta il cursore, seleziona. Alla tela non arriva. */
    if (this.inModifica() === elemento.id) {
      evento.stopPropagation();
      return;
    }
    evento.preventDefault();
    evento.stopPropagation();
    /* Il secondo clic sulla stessa casella, poco dopo e poco lontano dal primo: si scrive, dove si è cliccato. */
    const ora = Date.now();
    const prima = this.ultimoClic;
    this.ultimoClic = { id: elemento.id, quando: ora, x: evento.clientX, y: evento.clientY };
    if (
      elemento.tipo === 'testo' &&
      prima?.id === elemento.id &&
      ora - prima.quando < 450 &&
      Math.hypot(evento.clientX - prima.x, evento.clientY - prima.y) < 6
    ) {
      this.ultimoClic = undefined;
      this.fermaGesto();
      this.scriviIn(elemento.id, { x: evento.clientX, y: evento.clientY });
      return;
    }
    this.esciDaModifica();
    this.attivaFascia(nome);
    this.fuocoAlFoglio();
    const aggiungi = evento.shiftKey || evento.ctrlKey || evento.metaKey;
    const selezione = this.selezione();
    if (aggiungi) {
      if (selezione.includes(elemento.id)) {
        this.selezione.set(selezione.filter((id) => id !== elemento.id));
        return;
      }
      this.selezione.set([...selezione, elemento.id]);
    } else if (!selezione.includes(elemento.id)) {
      this.selezione.set([elemento.id]);
    }
    /* Dentro una selezione di più si trascinano tutti; un clic fermo sceglie solo lui. */
    const soloLui =
      !aggiungi && selezione.length > 1 && selezione.includes(elemento.id)
        ? elemento.id
        : undefined;
    this.iniziaSpostamento(evento, nome, soloLui);
  }

  /** Il bordo di una casella in cui si scrive: da lì la si trascina. */
  protected premiBordo(evento: PointerEvent, nome: NomeFascia): void {
    if (!this.modificabile() || evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    this.esciDaModifica();
    this.fuocoAlFoglio();
    this.iniziaSpostamento(evento, nome);
  }

  private iniziaSpostamento(evento: PointerEvent, nome: NomeFascia, soloLui?: string): void {
    const gesto = this.nuovoGesto(evento, nome, 'sposta');
    if (!gesto) return;
    const partenze = new Map(this.selezionati().map((e) => [e.id, this.rettangolo(e)] as const));
    this.iniziaGesto({ ...gesto, partenze, soloLui });
  }

  protected premiManiglia(evento: PointerEvent, nome: NomeFascia, maniglia: Maniglia): void {
    const elemento = this.stato().unico;
    if (!this.modificabile() || evento.button !== 0 || !elemento) return;
    evento.preventDefault();
    evento.stopPropagation();
    const gesto = this.nuovoGesto(evento, nome, 'ridimensiona');
    if (gesto)
      this.iniziaGesto({ ...gesto, maniglia, elemento, rettangolo: this.rettangolo(elemento) });
  }

  protected premiAltezza(evento: PointerEvent, nome: NomeFascia): void {
    if (!this.modificabile() || evento.button !== 0) return;
    evento.preventDefault();
    evento.stopPropagation();
    this.esciDaModifica();
    this.attivaFascia(nome);
    const gesto = this.nuovoGesto(evento, nome, 'altezza');
    if (gesto) this.iniziaGesto({ ...gesto, altezza: this.altezzaMostrata(nome) });
  }

  private muoviGesto(evento: PointerEvent): void {
    const g = this.gesto;
    if (!g) return;
    const px = { x: evento.clientX - g.clientX, y: evento.clientY - g.clientY };
    if (!g.mosso && Math.hypot(px.x, px.y) < TREMOLIO_PX) return;
    g.mosso = true;
    const dx = px.x / g.mmPx;
    const dy = px.y / g.mmPx;
    const soglia = evento.altKey ? 0 : SOGLIA_PX / g.mmPx;
    const m = this.modello();
    const fascia = m[g.fascia];

    if (g.tipo === 'lazo') {
      const x0 = (g.clientX - g.origine.left) / g.mmPx;
      const y0 = (g.clientY - g.origine.top) / g.mmPx;
      const lazo = {
        x: Math.min(x0, x0 + dx),
        y: Math.min(y0, y0 + dy),
        larghezza: Math.abs(dx),
        altezza: Math.abs(dy),
      };
      this.lazo.set(lazo);
      const presi = fascia.elementi
        .filter((e) => siToccano(lazo, this.rettangolo(e)))
        .map((e) => e.id);
      this.selezione.set([...new Set([...(g.selezionePrima ?? []), ...presi])]);
      return;
    }

    if (g.tipo === 'altezza') {
      const minima = fascia.elementi.length ? this.fondoElementi(fascia) : 0;
      const altezza = decimo(entro(g.altezza + dy, minima, ALTEZZA_MASSIMA_FASCIA));
      this.aggiornaDalGesto({
        ...m,
        [g.fascia]: { ...fascia, altezza: fascia.elementi.length ? altezza : 0 },
      });
      return;
    }

    const altri = (escludi: ReadonlySet<string>): Rettangolo[] =>
      fascia.elementi.filter((e) => !escludi.has(e.id)).map((e) => this.rettangolo(e));

    if (g.tipo === 'sposta' && g.partenze?.size) {
      let sx = dx;
      let sy = dy;
      /* Con Maiuscolo si va dritti, in orizzontale o in verticale. */
      if (evento.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) sy = 0;
        else sx = 0;
      }
      const partenza = contorno([...g.partenze.values()]);
      const mosso = { ...partenza, x: partenza.x + sx, y: partenza.y + sy };
      const aggancio = aggancia(
        mosso,
        riferimenti(g.altezza, altri(new Set(g.partenze.keys()))),
        soglia,
      );
      const dentro = nelFoglio({ ...mosso, x: mosso.x + aggancio.dx, y: mosso.y + aggancio.dy });
      const ddx = dentro.x - partenza.x;
      const ddy = dentro.y - partenza.y;
      this.guide.set(aggancio.guide);
      const elementi = fascia.elementi.map((e) => {
        const p = g.partenze!.get(e.id);
        return p ? { ...e, x: decimo(p.x + ddx), y: decimo(p.y + ddy) } : e;
      });
      this.aggiornaDalGesto({
        ...m,
        [g.fascia]: this.conAltezza({ ...fascia, elementi, altezza: g.altezza }),
      });
      return;
    }

    if (g.tipo === 'ridimensiona' && g.elemento && g.rettangolo && g.maniglia) {
      const el = g.elemento;
      const minimo =
        el.tipo === 'testo'
          ? { larghezza: MINIMI.testo.larghezza, altezza: MINIMI.testo.altezza }
          : MINIMI[el.tipo];
      let r = ridimensiona(g.rettangolo, g.maniglia, dx, dy, {
        minimo,
        proporzioni: el.tipo === 'immagine',
      });
      if (el.tipo !== 'immagine' && soglia) {
        const lati = {
          x: g.maniglia.includes('e')
            ? (['fine'] as const)
            : g.maniglia.includes('w')
              ? (['inizio'] as const)
              : ([] as const),
          y: g.maniglia.includes('s')
            ? (['fine'] as const)
            : g.maniglia.includes('n')
              ? (['inizio'] as const)
              : ([] as const),
        };
        const a = aggancia(r, riferimenti(g.altezza, altri(new Set([el.id]))), soglia, lati);
        r = {
          x: g.maniglia.includes('w') ? r.x + a.dx : r.x,
          y: g.maniglia.includes('n') ? r.y + a.dy : r.y,
          larghezza: r.larghezza + (g.maniglia.includes('w') ? -a.dx : a.dx),
          altezza: r.altezza + (g.maniglia.includes('n') ? -a.dy : a.dy),
        };
        this.guide.set(a.guide);
      }
      const elementi = fascia.elementi.map((e) =>
        e.id === el.id
          ? {
              ...e,
              x: decimo(r.x),
              y: decimo(r.y),
              larghezza: decimo(Math.max(minimo.larghezza, r.larghezza)),
              altezza: decimo(Math.max(minimo.altezza, r.altezza)),
            }
          : e,
      );
      this.aggiornaDalGesto({
        ...m,
        [g.fascia]: this.conAltezza({ ...fascia, elementi, altezza: g.altezza }),
      });
    }
  }

  // --- Tastiera -----------------------------------------------------------------------

  protected tastiera(evento: KeyboardEvent): void {
    /* I tasti del testo di una casella li ha già visti la casella (anche l'Esc che la chiude): qui non contano. */
    if (
      !this.modificabile() ||
      this.inModifica() ||
      (evento.target as HTMLElement).closest('.ProseMirror')
    )
      return;
    const mod = evento.ctrlKey || evento.metaKey;
    const tasto = evento.key.length === 1 ? evento.key.toLowerCase() : evento.key;
    const esegui = (azione: () => void): void => {
      evento.preventDefault();
      azione();
    };
    if (mod && tasto === 'z')
      return esegui(() => (evento.shiftKey ? this.ripeti() : this.annulla()));
    if (mod && tasto === 'y') return esegui(() => this.ripeti());
    if (mod && tasto === 'a')
      return esegui(() =>
        this.selezione.set(this.modello()[this.attiva()].elementi.map((e) => e.id)),
      );
    if (mod && tasto === 'v') return esegui(() => this.incolla());
    if (!this.selezione().length) return;
    if (mod && tasto === 'c') return esegui(() => this.copia());
    if (mod && tasto === 'x') {
      return esegui(() => {
        this.copia();
        this.elimina();
      });
    }
    if (mod && tasto === 'd') return esegui(() => this.duplica());
    const passo = evento.shiftKey ? PASSO_LUNGO : PASSO;
    const frecce: Record<string, [number, number]> = {
      ArrowLeft: [-passo, 0],
      ArrowRight: [passo, 0],
      ArrowUp: [0, -passo],
      ArrowDown: [0, passo],
    };
    const freccia = frecce[tasto];
    if (freccia) return esegui(() => this.sposta(freccia[0], freccia[1]));
    if (tasto === 'Delete' || tasto === 'Backspace') return esegui(() => this.elimina());
    if (tasto === 'Escape') return esegui(() => this.selezione.set([]));
    const unico = this.stato().unico;
    if (tasto === 'Enter' && unico?.tipo === 'testo') return esegui(() => this.scriviIn(unico.id));
  }

  private sposta(dx: number, dy: number): void {
    const selezionati = this.selezionati();
    if (!selezionati.length) return;
    const partenza = contorno(selezionati.map((e) => this.rettangolo(e)));
    const dentro = nelFoglio({ ...partenza, x: partenza.x + dx, y: partenza.y + dy });
    const sx = dentro.x - partenza.x;
    const sy = dentro.y - partenza.y;
    this.modificaElementi(
      this.attiva(),
      new Set(this.selezione()),
      (e) => ({ ...e, x: decimo(e.x + sx), y: decimo(e.y + sy) }),
      'frecce',
    );
  }

  // --- Aggiungere ----------------------------------------------------------------------

  /**
   * Un posto dentro la fascia dove l'elemento nuovo non copre gli altri,
   * cercato riga per riga dal margine sinistro. Se non c'è, va sopra gli
   * altri in alto a sinistra: lo si vede e lo si sposta, e la fascia non si
   * allunga a sorpresa.
   */
  private postoLibero(
    fascia: Fascia,
    larghezza: number,
    altezza: number,
  ): { x: number; y: number } {
    const occupati = fascia.elementi.map((e) => this.rettangolo(e));
    const alta = Math.max(fascia.elementi.length ? fascia.altezza : ALTEZZA_VUOTA, altezza + 5);
    for (let y = 5; y + altezza <= alta; y += 5) {
      for (
        let x = MARGINE_FOGLIO;
        x + larghezza <= LARGHEZZA_FOGLIO - MARGINE_FOGLIO + 0.1;
        x += 10
      ) {
        const posto = { x, y, larghezza, altezza };
        if (!occupati.some((r) => siToccano(r, posto))) return { x: decimo(x), y };
      }
    }
    return { x: decimo(MARGINE_FOGLIO), y: decimo(entro(alta - altezza, 0, 5)) };
  }

  private aggiungi(elemento: Elemento, chiave?: string): void {
    const nome = this.attiva();
    const m = this.modello();
    const fascia = m[nome];
    /* La prima cosa in una fascia vuota non la fa rimpicciolire sotto l'altezza con cui la si vedeva. */
    const minima = fascia.elementi.length ? 0 : ALTEZZA_VUOTA;
    this.cambia(
      {
        ...m,
        [nome]: this.conAltezza({ ...fascia, elementi: [...fascia.elementi, elemento] }, minima),
      },
      chiave,
    );
    this.selezione.set([elemento.id]);
  }

  private nuovaCasella(paragrafi: Paragrafo[], larghezza = 80): ElementoTesto {
    const altezza = 5;
    return {
      tipo: 'testo',
      id: nuovoId(),
      ...this.postoLibero(this.modello()[this.attiva()], larghezza, altezza),
      larghezza,
      altezza,
      verticale: 'top',
      dimensione: CORPO_BASE,
      famiglia: 'sans',
      colore: COLORE_TESTO,
      paragrafi,
    };
  }

  protected aggiungiTesto(): void {
    this.esciDaModifica();
    const casella = this.nuovaCasella([{ type: 'paragraph' }]);
    this.aggiungi(casella, `testo:${casella.id}`);
    /* La casella nasce vuota e ci si scrive subito: la vista la crea al prossimo giro. */
    afterNextRender(() => this.scriviIn(casella.id), { injector: this.injector });
  }

  protected aggiungiLinea(): void {
    this.esciDaModifica();
    const fascia = this.modello()[this.attiva()];
    const y = fascia.elementi.length
      ? entro(this.fondoElementi(fascia) + 2, 0, ALTEZZA_MASSIMA_FASCIA - 1)
      : 10;
    this.aggiungi({
      tipo: 'forma',
      id: nuovoId(),
      x: decimo(MARGINE_FOGLIO),
      y: decimo(y),
      larghezza: decimo(LARGHEZZA_FOGLIO - 2 * MARGINE_FOGLIO),
      altezza: 0.3,
      colore: '#737373',
    });
  }

  protected aggiungiRettangolo(): void {
    this.esciDaModifica();
    this.aggiungi({
      tipo: 'forma',
      id: nuovoId(),
      ...this.postoLibero(this.modello()[this.attiva()], 40, 12),
      larghezza: 40,
      altezza: 12,
      colore: '#e7e5e4',
    });
  }

  /** Un campo: dove si sta scrivendo, o in una casella nuova tutta sua. */
  private inserisciCampo(nome: NomeCampo): void {
    const editor = this.editorInScrittura();
    if (editor) {
      editor.chain().focus().inserisciCampo(nome).run();
      return;
    }
    this.aggiungi(
      this.nuovaCasella([{ type: 'paragraph', content: [{ type: 'campo', attrs: { nome } }] }], 50),
    );
  }

  protected scegliImmagine(sostituisci = false): void {
    this.sostituisci = sostituisci;
    this.sceltaFile()?.nativeElement.click();
  }

  protected async caricaImmagine(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const file = campo.files?.[0];
    campo.value = '';
    if (!file) return;
    this.erroreImmagine.set(undefined);
    /* Qualsiasi immagine (11/09/2026): quelle che non sono PNG o JPEG il
       server le porta a PNG. Una HEIC Windows la passa senza tipo. */
    if (!file.type.startsWith('image/') && !/\.(heic|heif|tiff?|bmp|webp|gif|avif)$/i.test(file.name)) {
      this.erroreImmagine.set('Serve un’immagine.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.erroreImmagine.set('L’immagine supera i 2 MB.');
      return;
    }
    this.caricamentoImmagine.set(true);
    try {
      const { id } = await firstValueFrom(this.api.caricaImmagine(file));
      /* Un PNG o un JPEG si mostra dal file scelto; gli altri (una HEIC che
         il browser non sa aprire) dal PNG che il server ne ha fatto. */
      const url = ['image/png', 'image/jpeg'].includes(file.type)
        ? URL.createObjectURL(file)
        : URL.createObjectURL(await firstValueFrom(this.api.scaricaImmagine(id)));
      this.richieste.add(id);
      this.urlImmagini.update((u) => ({ ...u, [id]: url }));
      const rapporto = await proporzioni(url);
      const unico = this.stato().unico;
      if (this.sostituisci && unico?.tipo === 'immagine') {
        this.modificaElementi(this.attiva(), new Set([unico.id]), (e) => ({
          ...e,
          immagine: id,
          altezza: decimo(
            entro(e.larghezza * rapporto, MINIMI.immagine.altezza, ALTEZZA_MASSIMA_FASCIA),
          ),
        }));
        return;
      }
      /* Largo 35 mm, o meno se così verrebbe più alto di 30. */
      const larghezza = rapporto * 35 > 30 ? 30 / rapporto : 35;
      const altezza = larghezza * rapporto;
      this.esciDaModifica();
      this.aggiungi({
        tipo: 'immagine',
        id: nuovoId(),
        ...this.postoLibero(this.modello()[this.attiva()], larghezza, altezza),
        larghezza: decimo(larghezza),
        altezza: decimo(altezza),
        immagine: id,
      });
    } catch (errore) {
      const api = errore instanceof HttpErrorResponse ? (errore.error as ErroreApi | null) : null;
      this.erroreImmagine.set(api?.messaggio ?? 'Caricamento dell’immagine non riuscito.');
    } finally {
      this.caricamentoImmagine.set(false);
    }
  }

  // --- Disporre ------------------------------------------------------------------------

  protected allineaSelezione(come: Disposizione): void {
    const selezionati = this.selezionati();
    if (!selezionati.length) return;
    const posizioni = allinea(
      selezionati.map((e) => this.rettangolo(e)),
      come,
      this.modello()[this.attiva()].altezza,
    );
    const perId = new Map(selezionati.map((e, i) => [e.id, posizioni[i]!] as const));
    this.modificaElementi(this.attiva(), new Set(perId.keys()), (e) => {
      const p = nelFoglio({ ...this.rettangolo(e), ...perId.get(e.id)! });
      return { ...e, x: decimo(p.x), y: decimo(p.y) };
    });
  }

  protected distribuisciSelezione(asse: 'x' | 'y'): void {
    const selezionati = this.selezionati();
    if (selezionati.length < 3) return;
    const posizioni = distribuisci(
      selezionati.map((e) => this.rettangolo(e)),
      asse,
    );
    const perId = new Map(selezionati.map((e, i) => [e.id, posizioni[i]!] as const));
    this.modificaElementi(this.attiva(), new Set(perId.keys()), (e) => ({
      ...e,
      x: decimo(perId.get(e.id)!.x),
      y: decimo(perId.get(e.id)!.y),
    }));
  }

  /** In primo piano (in fondo alla lista) o dietro a tutti (in cima), nell'ordine che avevano. */
  protected livello(dove: 'avanti' | 'dietro'): void {
    const nome = this.attiva();
    const ids = new Set(this.selezione());
    const m = this.modello();
    const scelti = m[nome].elementi.filter((e) => ids.has(e.id));
    const altri = m[nome].elementi.filter((e) => !ids.has(e.id));
    const elementi = dove === 'avanti' ? [...altri, ...scelti] : [...scelti, ...altri];
    this.cambia({ ...m, [nome]: { ...m[nome], elementi } });
  }

  protected elimina(): void {
    const nome = this.attiva();
    const ids = new Set(this.selezione());
    if (!ids.size) return;
    this.inModifica.set(undefined);
    const m = this.modello();
    this.cambia({
      ...m,
      [nome]: this.conAltezza({
        ...m[nome],
        elementi: m[nome].elementi.filter((e) => !ids.has(e.id)),
      }),
    });
    this.selezione.set([]);
  }

  private copia(): void {
    appunti = this.selezionati().map((e) => structuredClone(e));
  }

  /** Copie con un id nuovo, spostate di 3 mm se no finirebbero sopra gli originali. */
  private incollaQui(elementi: readonly Elemento[]): void {
    if (!elementi.length) return;
    const nome = this.attiva();
    const m = this.modello();
    const posti = new Set(m[nome].elementi.map((e) => `${e.x}:${e.y}`));
    const copie = elementi.map((e) => {
      const scarto = posti.has(`${e.x}:${e.y}`) ? 3 : 0;
      const p = nelFoglio({ ...this.rettangolo(e), x: e.x + scarto, y: e.y + scarto });
      return { ...structuredClone(e), id: nuovoId(), x: decimo(p.x), y: decimo(p.y) };
    });
    this.cambia({
      ...m,
      [nome]: this.conAltezza({ ...m[nome], elementi: [...m[nome].elementi, ...copie] }),
    });
    this.selezione.set(copie.map((e) => e.id));
  }

  private incolla(): void {
    this.incollaQui(appunti);
  }

  protected duplica(): void {
    this.incollaQui(this.selezionati());
  }

  /** Posizione e misure scritte a mano: un'immagine tiene le proporzioni. */
  protected impostaGeometria(campo: keyof Rettangolo, valore: string): void {
    const e = this.stato().unico;
    const v = Number(valore.replace(',', '.'));
    if (!e || !Number.isFinite(v)) return;
    const r = { x: e.x, y: e.y, larghezza: e.larghezza, altezza: e.altezza, [campo]: v };
    if (e.tipo === 'immagine' && campo === 'larghezza') r.altezza = (v * e.altezza) / e.larghezza;
    if (e.tipo === 'immagine' && campo === 'altezza') r.larghezza = (v * e.larghezza) / e.altezza;
    r.larghezza = Math.max(MINIMI[e.tipo].larghezza, r.larghezza);
    r.altezza = Math.max(MINIMI[e.tipo].altezza, r.altezza);
    const p = nelFoglio(r);
    this.modificaElementi(
      this.attiva(),
      new Set([e.id]),
      (x) => ({
        ...x,
        x: decimo(p.x),
        y: decimo(p.y),
        larghezza: decimo(p.larghezza),
        altezza: decimo(p.altezza),
      }),
      `geometria:${e.id}:${campo}`,
    );
  }

  protected impostaAltezzaFascia(valore: string): void {
    const nome = this.attiva();
    const v = Number(valore.replace(',', '.'));
    const m = this.modello();
    const fascia = m[nome];
    if (!Number.isFinite(v) || !fascia.elementi.length) return;
    const altezza = decimo(entro(v, this.fondoElementi(fascia), ALTEZZA_MASSIMA_FASCIA));
    this.cambia({ ...m, [nome]: { ...fascia, altezza } }, `altezza:${nome}`);
  }

  // --- Il testo -----------------------------------------------------------------------

  private statoTesto(selezionati: readonly Elemento[]): StatoTesto | undefined {
    const editor = this.editorInScrittura();
    const inScrittura = this.inModifica() ? this.trova(this.inModifica()!)?.elemento : undefined;
    if (editor && inScrittura?.tipo === 'testo') {
      const stile = editor.getAttributes('textStyle');
      return {
        grassetto: editor.isActive('bold'),
        corsivo: editor.isActive('italic'),
        sottolineato: editor.isActive('underline'),
        corpo: corpoValido(stile['fontSize']) ?? inScrittura.dimensione,
        famiglia: (stile['fontFamily'] as Famiglia | null) ?? inScrittura.famiglia,
        colore: coloreEsadecimale(stile['color']) ?? inScrittura.colore,
        allineamento:
          (editor.getAttributes('paragraph')['textAlign'] as Allineamento | null) ?? 'left',
        verticale: inScrittura.verticale,
      };
    }
    if (!selezionati.length || selezionati.some((e) => e.tipo !== 'testo')) return undefined;
    const caselle = selezionati as ElementoTesto[];
    return {
      grassetto: caselle.every((c) => tuttiConSegno(c.paragrafi, 'bold')),
      corsivo: caselle.every((c) => tuttiConSegno(c.paragrafi, 'italic')),
      sottolineato: caselle.every((c) => tuttiConSegno(c.paragrafi, 'underline')),
      corpo: comune(caselle.map((c) => valoreComune(c.paragrafi, 'fontSize', c.dimensione))),
      famiglia: comune(caselle.map((c) => valoreComune(c.paragrafi, 'fontFamily', c.famiglia))),
      colore: comune(caselle.map((c) => valoreComune(c.paragrafi, 'color', c.colore))),
      allineamento: comune(caselle.map((c) => allineamentoComune(c.paragrafi))),
      verticale: comune(caselle.map((c) => c.verticale)),
    };
  }

  /** Le caselle su cui agisce la barra: quella in cui si scrive, o quelle selezionate. */
  private caselleScelte(): ReadonlySet<string> {
    const id = this.inModifica();
    if (id) return new Set([id]);
    return new Set(
      this.selezionati()
        .filter((e) => e.tipo === 'testo')
        .map((e) => e.id),
    );
  }

  private suCaselle(cambia: (c: ElementoTesto) => ElementoTesto, chiave?: string): void {
    const ids = this.caselleScelte();
    if (!ids.size) return;
    const trovato = this.trova([...ids][0]!);
    if (!trovato) return;
    this.modificaElementi(trovato.nome, ids, (e) => (e.tipo === 'testo' ? cambia(e) : e), chiave);
    this.editorInScrittura()?.commands.focus();
  }

  /** Vero se nella casella in cui si scrive è selezionato tutto il testo: allora si cambia la casella, non i pezzi. */
  private tuttoSelezionato(editor: Editor): boolean {
    const { from, to, empty } = editor.state.selection;
    return !empty && from <= 1 && to >= editor.state.doc.content.size - 1;
  }

  protected segno(segno: Segno): void {
    const editor = this.editorInScrittura();
    if (editor) {
      const catena = editor.chain().focus();
      (segno === 'bold'
        ? catena.toggleBold()
        : segno === 'italic'
          ? catena.toggleItalic()
          : catena.toggleUnderline()
      ).run();
      return;
    }
    const acceso =
      !this.stato().testo?.[
        segno === 'bold' ? 'grassetto' : segno === 'italic' ? 'corsivo' : 'sottolineato'
      ];
    this.suCaselle((c) => ({ ...c, paragrafi: conSegno(c.paragrafi, segno, acceso) }));
  }

  /**
   * Corpo, famiglia e colore: sui pezzi selezionati mentre si scrive; su
   * tutta la casella (che diventa il suo stile, e i pezzi lo seguono) se è
   * selezionata lei, o se si è selezionato tutto il suo testo.
   */
  private stile<K extends 'dimensione' | 'famiglia' | 'colore'>(
    chiave: K,
    attributo: AttributoStile,
    valore: ElementoTesto[K],
    suiPezzi: (editor: Editor) => void,
  ): void {
    const editor = this.editorInScrittura();
    if (editor && !this.tuttoSelezionato(editor)) {
      suiPezzi(editor);
      return;
    }
    this.suCaselle(
      (c) =>
        ({
          ...c,
          [chiave]: valore,
          paragrafi: senzaStile(c.paragrafi, attributo),
        }) as ElementoTesto,
    );
  }

  protected corpo(valore: string): void {
    const punti = corpoValido(valore.replace(',', '.'));
    if (!punti) return;
    this.stile('dimensione', 'fontSize', punti, (e) => e.chain().focus().impostaCorpo(punti).run());
  }

  protected famiglia(valore: string): void {
    const famiglia = valore as Famiglia;
    if (!FONT_FAMIGLIA[famiglia]) return;
    this.stile('famiglia', 'fontFamily', famiglia, (e) =>
      e.chain().focus().impostaFamiglia(famiglia).run(),
    );
  }

  protected colore(valore: string): void {
    const hex = coloreEsadecimale(valore);
    if (!hex) return;
    if (!this.inModifica() && this.selezionati().some((e) => e.tipo === 'forma')) {
      this.modificaElementi(
        this.attiva(),
        new Set(
          this.selezionati()
            .filter((e) => e.tipo === 'forma')
            .map((e) => e.id),
        ),
        (e) => (e.tipo === 'forma' ? { ...e, colore: hex } : e),
        'colore',
      );
      return;
    }
    this.stile('colore', 'color', hex, (e) => e.chain().focus().setColor(hex).run());
  }

  protected allineaTesto(allineamento: Allineamento): void {
    const editor = this.editorInScrittura();
    if (editor) {
      editor.chain().focus().setTextAlign(allineamento).run();
      return;
    }
    this.suCaselle((c) => ({ ...c, paragrafi: conAllineamento(c.paragrafi, allineamento) }));
  }

  protected verticaleTesto(verticale: Ancoraggio): void {
    this.suCaselle((c) => ({ ...c, verticale }));
  }

  /** La casella alta quanto il suo testo, né più né meno. */
  protected adattaAlTesto(): void {
    this.suCaselle((c) => {
      const testo = this.contenuti().get(c.id);
      return testo ? { ...c, altezza: decimo(Math.max(MINIMI.testo.altezza, testo)) } : c;
    });
  }
}
