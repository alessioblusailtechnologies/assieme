import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import {
  Citazione,
  GrafoMemoria,
  NodoGrafoMemoria,
  TipoNodoGrafo,
} from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { MemoriaApi } from '@core/api/memoria-api';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';

import { etichettaCategoria } from './categorie';

/**
 * Il globo della memoria: il grafo vero di `GET /api/ricordi/grafo`, reso e
 * navigabile — la controparte lavorativa della figura decorativa di
 * `app-grafo-memoria`, di cui riprende palette e deriva lenta perché siano
 * riconoscibili come la stessa «memoria viva».
 *
 * Ogni nodo si tocca: un passaggio citato apre il PDF sulla pagina esatta
 * con l'estratto (lo stesso pattern delle citazioni in chat, RF-C-05), un
 * documento porta alla sua scheda, una conversazione al filo, un ricordo
 * mostra il testo intero. La ricerca accende i nodi che corrispondono e
 * spegne il resto; la legenda fa lo stesso per tipo.
 *
 * Niente librerie: un layout a forze scritto qui (repulsione fra tutti i
 * nodi, molle sui legami, gravità verso il centro), come il resto della
 * grafica del progetto. I numeri sono piccoli — centinaia di nodi, non
 * migliaia — e l'O(n²) della repulsione resta sotto il millisecondo.
 */

/** La palette della memoria viva (grafo-memoria/sito): un colore per tipo. */
const COLORI_TIPO: Record<TipoNodoGrafo, string> = {
  ricordo: '#c08a6e',
  conversazione: '#8fa8b8',
  punto: '#9bb39c',
  documento: '#7f97c4',
  prodotto: '#4e6c9e',
  compagnia: '#b4bcc6',
  ramo: '#6d7681',
};

const ETICHETTE_TIPO: Record<TipoNodoGrafo, [singolare: string, plurale: string]> = {
  ricordo: ['ricordo', 'ricordi'],
  conversazione: ['conversazione', 'conversazioni'],
  punto: ['passaggio citato', 'passaggi citati'],
  documento: ['documento', 'documenti'],
  prodotto: ['prodotto', 'prodotti'],
  compagnia: ['compagnia', 'compagnie'],
  ramo: ['ramo', 'rami'],
};

/** L'ordine della legenda: dal ricordo verso l'archivio, come i legami. */
const ORDINE_TIPI: TipoNodoGrafo[] = [
  'ricordo',
  'conversazione',
  'punto',
  'documento',
  'prodotto',
  'compagnia',
  'ramo',
];

/** La taglia di partenza per tipo: la gerarchia si legge prima del peso. */
const RAGGI_BASE: Record<TipoNodoGrafo, number> = {
  ricordo: 1.9,
  conversazione: 1.9,
  punto: 1.5,
  documento: 1.7,
  prodotto: 2,
  compagnia: 2.4,
  ramo: 2.8,
};

/** Lunghezza a riposo della molla, per coppia di tipi (chiave `a|b` ordinata). */
const LUNGHEZZE: Record<string, number> = {
  'conversazione|ricordo': 70,
  'conversazione|punto': 60,
  'documento|punto': 20,
  'documento|prodotto': 28,
  'compagnia|prodotto': 48,
  'prodotto|ramo': 95,
  'compagnia|documento': 40,
};

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;

/**
 * Il raggio del globo in coordinate di mondo: la fisica contiene tutto nel
 * cerchio e i nodi senza legami si posano sull'orlo — la forma è quella
 * della «memoria viva», ma ogni punto è vero e si tocca.
 */
const RAGGIO_GLOBO = 300;

interface NodoDisegno {
  dato: NodoGrafoMemoria;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Posizione a schermo dell'ultimo fotogramma, per il colpo di mira. */
  sx: number;
  sy: number;
  r: number;
  colore: string;
  /** La deriva lenta della memoria viva: fase, velocità, ampiezza. */
  ph: number;
  sp: number;
  amp: number;
  /** Trattenuto dal trascinamento: la fisica non lo sposta. */
  fisso: boolean;
  vicini: Set<number>;
  /** Vero se passa ricerca e filtro di tipo. */
  acceso: boolean;
  /**
   * Un nodo senza legami non vaga: si posa su un anello interno del globo,
   * come le note orfane nel grafo di Obsidian. L'àncora è il suo posto.
   */
  ancora?: { x: number; y: number };
}

interface LegameDisegno {
  a: number;
  b: number;
  peso: number;
  lunghezza: number;
}

/** Congruenziale lineare: layout identico a ogni apertura, come la figura del sito. */
function pseudoCasuale(seme: number): () => number {
  let stato = seme >>> 0 || 1;
  return () => (stato = (stato * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function hashChiave(chiave: string): number {
  let h = 2166136261;
  for (let i = 0; i < chiave.length; i++) {
    h ^= chiave.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

@Component({
  selector: 'app-globo-memoria',
  imports: [Bottone, Campo, Cassetto, Icona, RouterLink, Scheletro, StatoVuoto, Tag, VisualizzatorePdf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './globo-memoria.html',
  styleUrl: './globo-memoria.scss',
})
export class GloboMemoria {
  private readonly api = inject(MemoriaApi);
  private readonly apiPubblici = inject(DocumentiApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);
  private readonly apiConversazioni = inject(ConversazioniApi);

  private readonly tela = viewChild<ElementRef<HTMLCanvasElement>>('tela');

  private readonly risorsa = httpResource<GrafoMemoria>(() => this.api.urlGrafo());

  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;
  protected readonly grafo = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : undefined,
  );
  protected readonly vuoto = computed(() => this.grafo()?.nodi.length === 0);

  protected riprova(): void {
    this.risorsa.reload();
  }

  // --- Ciò che si governa da fuori del canvas -----------------------------

  protected readonly ricerca = signal('');
  protected readonly tipoEvidenziato = signal<TipoNodoGrafo | undefined>(undefined);
  protected readonly selezionato = signal<NodoGrafoMemoria | undefined>(undefined);

  protected readonly legenda = computed(() => {
    const nodi = this.grafo()?.nodi ?? [];
    return ORDINE_TIPI.map((tipo) => {
      const quanti = nodi.filter((n) => n.tipo === tipo).length;
      return {
        tipo,
        colore: COLORI_TIPO[tipo],
        etichetta: ETICHETTE_TIPO[tipo][quanti === 1 ? 0 : 1],
        quanti,
      };
    }).filter((voce) => voce.quanti > 0);
  });

  protected readonly conteggio = computed(() => {
    const g = this.grafo();
    return g ? `${g.nodi.length} nodi · ${g.legami.length} legami` : '';
  });

  protected alternaTipo(tipo: TipoNodoGrafo): void {
    this.tipoEvidenziato.update((attuale) => (attuale === tipo ? undefined : tipo));
  }

  // --- La scheda del nodo selezionato -------------------------------------

  protected etichettaCategoria = etichettaCategoria;

  protected readonly titoloScheda = computed(() => {
    const nodo = this.selezionato();
    if (!nodo) return '';
    switch (nodo.tipo) {
      case 'ricordo':
        return 'Ricordo';
      case 'punto':
        return nodo.citazione?.documentoTitolo ?? 'Passaggio citato';
      default:
        return nodo.etichetta;
    }
  });

  /** La conversazione vicina di un ricordo selezionato, per il link al filo. */
  protected readonly conversazioneDelSelezionato = computed(() => {
    const nodo = this.selezionato();
    const g = this.grafo();
    if (!nodo || nodo.tipo !== 'ricordo' || !g) return undefined;
    const legame = g.legami.find((l) => l.da === nodo.chiave && l.a.startsWith('conversazione:'));
    return legame ? g.nodi.find((n) => n.chiave === legame.a) : undefined;
  });

  /** Mai «art. Articolo 4»: il prefisso solo quando il campo non lo porta già. */
  protected etichettaArticolo(articolo: string): string {
    return /^art/i.test(articolo.trim()) ? articolo : `art. ${articolo}`;
  }

  protected urlFileCitazione(citazione: Citazione): string {
    switch (citazione.archivio) {
      case 'pubblico':
        return this.apiPubblici.urlFile(citazione.documentoId);
      case 'conversazione':
        return this.apiConversazioni.urlFileAllegato(citazione.documentoId);
      default:
        return this.apiPrivati.urlFile(citazione.documentoId);
    }
  }

  // --- Il motore: dati di disegno -----------------------------------------

  private nodi: NodoDisegno[] = [];
  private legami: LegameDisegno[] = [];
  private indicePerChiave = new Map<string, number>();

  private ctx?: CanvasRenderingContext2D;
  private larghezza = 0;
  private altezza = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;

  /** L'energia della simulazione: alta all'avvio, si spegne da sola. */
  private alfa = 0;
  private inMira = -1;
  private trascinato = -1;
  private inPanoramica = false;
  private mosso = false;
  private ultimoPuntatore = { x: 0, y: 0 };

  private raf = 0;
  private inCorsa = false;
  private visibile = true;
  private senzaMovimento = false;
  private fontMono = '"Geist Mono", ui-monospace, monospace';

  private readonly distruzione = inject(DestroyRef);
  private telaPronta = false;

  constructor() {
    /* I dati possono arrivare prima o dopo la prima resa: l'effect copre
       entrambi i casi, e ricostruisce il globo a ogni reload. */
    effect(() => {
      const grafo = this.grafo();
      if (grafo) this.monta(grafo);
    });

    /* Ricerca e legenda non muovono la fisica: riaccendono solo il disegno. */
    effect(() => {
      this.ricerca();
      this.tipoEvidenziato();
      this.aggiornaAccesi();
      this.chiediFotogramma();
    });

    /* Il canvas vive in un ramo `@else` (dopo caricamento ed errore): si
       aggancia quando compare, non alla prima resa del componente. */
    effect(() => {
      const canvas = this.tela()?.nativeElement;
      if (!canvas || this.telaPronta) return;
      this.telaPronta = true;
      this.preparaTela(canvas);
    });
  }

  private preparaTela(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this.ctx = ctx;

    const mono = getComputedStyle(canvas).getPropertyValue('--f-mono').trim();
    if (mono) this.fontMono = mono;
    this.senzaMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ridimensiona = new ResizeObserver(() => this.ridimensiona(canvas));
    ridimensiona.observe(canvas);

    /* Nessun motivo di animare un globo che non si vede. */
    const osservatore = new IntersectionObserver(([voce]) => {
      this.visibile = Boolean(voce?.isIntersecting);
      if (this.visibile) this.avvia();
      else this.ferma();
    });
    osservatore.observe(canvas);

    const suVisibilita = (): void => {
      if (document.hidden) this.ferma();
      else if (canvas.isConnected && this.visibile) this.avvia();
    };
    document.addEventListener('visibilitychange', suVisibilita);

    this.collegaPuntatore(canvas);
    this.ridimensiona(canvas);

    this.distruzione.onDestroy(() => {
      this.ferma();
      ridimensiona.disconnect();
      osservatore.disconnect();
      document.removeEventListener('visibilitychange', suVisibilita);
    });
  }

  // --- Montaggio ----------------------------------------------------------

  private monta(grafo: GrafoMemoria): void {
    this.indicePerChiave = new Map(grafo.nodi.map((n, i) => [n.chiave, i]));

    this.nodi = grafo.nodi.map((dato) => {
      const rnd = pseudoCasuale(hashChiave(dato.chiave));
      const angolo = rnd() * Math.PI * 2;
      /* I nodi collegati nascono sparsi nel cerchio: le molle li tessono. */
      const raggio = RAGGIO_GLOBO * (0.15 + rnd() * 0.6);
      /* Punti piccoli, come nel grafo di Obsidian: la taglia parte dal tipo
         e cresce con la radice del peso — un hub si vede, non domina. */
      return {
        dato,
        x: Math.cos(angolo) * raggio,
        y: Math.sin(angolo) * raggio,
        vx: 0,
        vy: 0,
        sx: 0,
        sy: 0,
        r: Math.min(RAGGI_BASE[dato.tipo] + 1.15 * Math.sqrt(dato.peso), 9),
        colore: COLORI_TIPO[dato.tipo],
        ph: rnd() * Math.PI * 2,
        sp: 0.25 + rnd() * 0.5,
        amp: 1.2 + rnd() * 2.2,
        fisso: false,
        vicini: new Set<number>(),
        acceso: true,
      };
    });

    this.legami = grafo.legami.flatMap((legame) => {
      const a = this.indicePerChiave.get(legame.da);
      const b = this.indicePerChiave.get(legame.a);
      if (a === undefined || b === undefined) return [];
      this.nodi[a].vicini.add(b);
      this.nodi[b].vicini.add(a);
      const tipi = [this.nodi[a].dato.tipo, this.nodi[b].dato.tipo].sort().join('|');
      return [{ a, b, peso: legame.peso, lunghezza: LUNGHEZZE[tipi] ?? 60 }];
    });

    /* Un nodo senza legami si posa sull'orlo del globo, al suo angolo di
       sempre (seme dalla chiave): come le note orfane nel grafo di Obsidian,
       fanno corona invece di vagare ai margini. */
    for (const nodo of this.nodi) {
      if (nodo.vicini.size) continue;
      const rnd = pseudoCasuale(hashChiave(nodo.dato.chiave) ^ 0x9e3779b9);
      const angolo = rnd() * Math.PI * 2;
      nodo.ancora = {
        x: Math.cos(angolo) * RAGGIO_GLOBO * 0.9,
        y: Math.sin(angolo) * RAGGIO_GLOBO * 0.9,
      };
      nodo.x = nodo.ancora.x;
      nodo.y = nodo.ancora.y;
    }

    this.aggiornaAccesi();

    /* Il riscaldamento avviene fuori scena: il globo appare già composto,
       poi continua ad assestarsi con la deriva lenta della memoria viva. */
    this.alfa = 1;
    for (let i = 0; i < 500; i++) this.passo();
    this.inquadra();
    this.avvia();
  }

  private aggiornaAccesi(): void {
    const termine = this.ricerca().trim().toLowerCase();
    const tipo = this.tipoEvidenziato();
    for (const nodo of this.nodi) {
      const d = nodo.dato;
      const perTipo = !tipo || d.tipo === tipo;
      const perTesto =
        !termine ||
        d.etichetta.toLowerCase().includes(termine) ||
        (d.testo?.toLowerCase().includes(termine) ?? false) ||
        (d.citazione &&
          `${d.citazione.estratto} ${d.citazione.documentoTitolo}`.toLowerCase().includes(termine));
      nodo.acceso = Boolean(perTipo && perTesto);
    }
  }

  // --- Fisica -------------------------------------------------------------

  private passo(): void {
    const a = this.alfa;
    const nodi = this.nodi;

    /* Repulsione a due portate: una spinta corta e decisa perché i punti
       non si accavallino, una lunga e tenue perché i cluster respirino.
       Sono le molle a dare la forma — la repulsione non deve vincere. */
    for (let i = 0; i < nodi.length; i++) {
      for (let j = i + 1; j < nodi.length; j++) {
        const dx = nodi[i].x - nodi[j].x;
        const dy = nodi[i].y - nodi[j].y;
        const d2 = dx * dx + dy * dy + 0.01;
        if (d2 > 62_500) continue; // oltre 250 unità non ci si sente più
        const d = Math.sqrt(d2);
        let f = 40 / d2;
        if (d < 60) f += ((60 - d) * 0.05) / d;
        f *= a;
        const fx = dx * f;
        const fy = dy * f;
        nodi[i].vx += fx;
        nodi[i].vy += fy;
        nodi[j].vx -= fx;
        nodi[j].vy -= fy;
      }
    }

    for (const legame of this.legami) {
      const na = nodi[legame.a];
      const nb = nodi[legame.b];
      const dx = nb.x - na.x;
      const dy = nb.y - na.y;
      const d = Math.hypot(dx, dy) || 1;
      /* Un legame percorso più volte tira di più, con un tetto: la molla
         serve a raggruppare, non a incollare. */
      const forza = 0.06 + 0.02 * Math.min(legame.peso, 4);
      const err = ((d - legame.lunghezza) / d) * forza * a;
      const fx = dx * err;
      const fy = dy * err;
      na.vx += fx;
      na.vy += fy;
      nb.vx -= fx;
      nb.vy -= fy;
    }

    const bordo = RAGGIO_GLOBO * 0.92;
    for (const nodo of nodi) {
      if (nodo.fisso) {
        nodo.vx = 0;
        nodo.vy = 0;
        continue;
      }
      if (nodo.ancora) {
        // L'orfano torna al suo posto sull'orlo.
        nodo.vx += (nodo.ancora.x - nodo.x) * 0.04 * a;
        nodo.vy += (nodo.ancora.y - nodo.y) * 0.04 * a;
      } else {
        nodo.vx -= nodo.x * 0.02 * a;
        nodo.vy -= nodo.y * 0.02 * a;
        // Oltre il bordo morbido si viene riaccompagnati dentro.
        const d = Math.hypot(nodo.x, nodo.y);
        if (d > bordo) {
          const spinta = ((d - bordo) / d) * 0.08 * a;
          nodo.vx -= nodo.x * spinta;
          nodo.vy -= nodo.y * spinta;
        }
      }
      nodo.vx *= 0.86;
      nodo.vy *= 0.86;
      const v = Math.hypot(nodo.vx, nodo.vy);
      if (v > 6) {
        nodo.vx = (nodo.vx / v) * 6;
        nodo.vy = (nodo.vy / v) * 6;
      }
      nodo.x += nodo.vx;
      nodo.y += nodo.vy;

      /* La parete del globo è vera: nulla la oltrepassa — è lei a dare
         al grafo la silhouette circolare, qualunque cosa faccia la fisica. */
      const dopo = Math.hypot(nodo.x, nodo.y);
      const massimo = RAGGIO_GLOBO * 0.96;
      if (dopo > massimo) {
        const scala = massimo / dopo;
        nodo.x *= scala;
        nodo.y *= scala;
      }
    }

    this.alfa = Math.max(this.alfa * 0.993, 0.003);
  }

  /** Inquadra il cerchio intero: il globo è la composizione. */
  private inquadra(): void {
    if (!this.larghezza) return;
    const raggio = RAGGIO_GLOBO * 1.05;
    this.zoom = Math.min(
      Math.max((Math.min(this.larghezza, this.altezza) * 0.94) / (raggio * 2), ZOOM_MIN),
      ZOOM_MAX,
    );
    this.panX = 0;
    this.panY = 0;
    this.chiediFotogramma();
  }

  protected azzeraVista(): void {
    this.inquadra();
  }

  protected cambiaZoom(fattore: number): void {
    this.applicaZoom(this.zoom * fattore, this.larghezza / 2, this.altezza / 2);
  }

  private applicaZoom(nuovo: number, sx: number, sy: number): void {
    const zoom = Math.min(Math.max(nuovo, ZOOM_MIN), ZOOM_MAX);
    /* Lo zoom tiene fermo il punto sotto al cursore, come in ogni mappa. */
    const cx = this.larghezza / 2;
    const cy = this.altezza / 2;
    const wx = (sx - cx - this.panX) / this.zoom;
    const wy = (sy - cy - this.panY) / this.zoom;
    this.zoom = zoom;
    this.panX = sx - cx - wx * zoom;
    this.panY = sy - cy - wy * zoom;
    this.chiediFotogramma();
  }

  // --- Puntatore ----------------------------------------------------------

  private collegaPuntatore(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.mosso = false;
      this.ultimoPuntatore = this.puntoLocale(canvas, e);
      const colpito = this.colpisci(this.ultimoPuntatore.x, this.ultimoPuntatore.y);
      if (colpito >= 0) {
        this.trascinato = colpito;
        this.nodi[colpito].fisso = true;
      } else {
        this.inPanoramica = true;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const punto = this.puntoLocale(canvas, e);
      if (this.trascinato >= 0) {
        const nodo = this.nodi[this.trascinato];
        const cx = this.larghezza / 2;
        const cy = this.altezza / 2;
        nodo.x = (punto.x - cx - this.panX) / this.zoom;
        nodo.y = (punto.y - cy - this.panY) / this.zoom;
        this.mosso = true;
        this.alfa = Math.max(this.alfa, 0.25);
        this.avvia();
      } else if (this.inPanoramica) {
        this.panX += punto.x - this.ultimoPuntatore.x;
        this.panY += punto.y - this.ultimoPuntatore.y;
        if (Math.hypot(punto.x - this.ultimoPuntatore.x, punto.y - this.ultimoPuntatore.y) > 2) {
          this.mosso = true;
        }
        this.ultimoPuntatore = punto;
        this.chiediFotogramma();
      } else {
        const prima = this.inMira;
        this.inMira = this.colpisci(punto.x, punto.y);
        canvas.style.cursor = this.inMira >= 0 ? 'pointer' : 'grab';
        if (prima !== this.inMira) this.chiediFotogramma();
      }
    });

    const rilascia = (e: PointerEvent): void => {
      if (this.trascinato >= 0) {
        const nodo = this.nodi[this.trascinato];
        nodo.fisso = false;
        if (!this.mosso) this.selezionato.set(nodo.dato);
        this.trascinato = -1;
      } else if (this.inPanoramica && !this.mosso) {
        /* Un clic sul vuoto chiude la scheda: lo stesso gesto della chat. */
        this.selezionato.set(undefined);
      }
      this.inPanoramica = false;
      canvas.releasePointerCapture(e.pointerId);
      this.chiediFotogramma();
    };
    canvas.addEventListener('pointerup', rilascia);
    canvas.addEventListener('pointercancel', rilascia);

    canvas.addEventListener('pointerleave', () => {
      if (this.inMira >= 0) {
        this.inMira = -1;
        this.chiediFotogramma();
      }
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const punto = this.puntoLocale(canvas, e);
        this.applicaZoom(this.zoom * Math.exp(-e.deltaY * 0.0014), punto.x, punto.y);
      },
      { passive: false },
    );
  }

  private puntoLocale(canvas: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Il nodo sotto al puntatore, il più vicino se più d'uno è a tiro. */
  private colpisci(sx: number, sy: number): number {
    let migliore = -1;
    let distanza = Infinity;
    for (let i = 0; i < this.nodi.length; i++) {
      const nodo = this.nodi[i];
      const d = Math.hypot(nodo.sx - sx, nodo.sy - sy);
      const tiro = Math.max(nodo.r * this.zoom + 4, 11);
      if (d <= tiro && d < distanza) {
        migliore = i;
        distanza = d;
      }
    }
    return migliore;
  }

  // --- Ciclo di resa ------------------------------------------------------

  private ridimensiona(canvas: HTMLCanvasElement): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const primaVolta = this.larghezza === 0;
    this.larghezza = canvas.clientWidth;
    this.altezza = canvas.clientHeight;
    canvas.width = Math.round(this.larghezza * dpr);
    canvas.height = Math.round(this.altezza * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (primaVolta) this.inquadra();
    this.chiediFotogramma();
  }

  private avvia(): void {
    if (this.inCorsa || !this.ctx || !this.visibile) return;
    if (this.senzaMovimento) {
      /* Senza movimento: si assesta subito e resta fermo — le interazioni
         ridisegnano fotogramma per fotogramma. */
      while (this.alfa > 0.01) this.passo();
      this.chiediFotogramma();
      return;
    }
    this.inCorsa = true;
    let ultimo = 0;
    const fotogramma = (ts: number): void => {
      if (!this.inCorsa) return;
      this.raf = requestAnimationFrame(fotogramma);
      if (ts - ultimo < 33) return; // ~30 fps bastano, e costano metà CPU
      ultimo = ts;
      this.passo();
      this.disegna(ts / 1000);
    };
    this.raf = requestAnimationFrame(fotogramma);
  }

  private ferma(): void {
    this.inCorsa = false;
    cancelAnimationFrame(this.raf);
  }

  /** Un fotogramma singolo, per gli stati fermi (ridotto movimento, hover). */
  private chiediFotogramma(): void {
    if (this.inCorsa || !this.ctx) return;
    requestAnimationFrame((ts) => this.disegna(ts / 1000));
  }

  private disegna(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.larghezza, this.altezza);

    const cx = this.larghezza / 2;
    const cy = this.altezza / 2;
    const zoom = this.zoom;
    /* La deriva si sente solo a simulazione quieta: mentre le forze
       lavorano sarebbe un tremolio sovrapposto. */
    const deriva = this.senzaMovimento ? 0 : Math.max(0, 1 - this.alfa * 6);

    for (const nodo of this.nodi) {
      const dx = deriva * Math.sin(t * nodo.sp + nodo.ph) * nodo.amp;
      const dy = deriva * Math.cos(t * nodo.sp * 0.85 + nodo.ph) * nodo.amp;
      nodo.sx = cx + this.panX + (nodo.x + dx) * zoom;
      nodo.sy = cy + this.panY + (nodo.y + dy) * zoom;
    }

    const selezionata = this.selezionato()?.chiave;
    const fuoco =
      this.inMira >= 0
        ? this.inMira
        : selezionata !== undefined
          ? (this.indicePerChiave.get(selezionata) ?? -1)
          : -1;
    const filtroAttivo = this.nodi.some((n) => !n.acceso);

    const rilievo = (i: number): number => {
      const nodo = this.nodi[i];
      if (fuoco >= 0) {
        const nelFuoco = i === fuoco || this.nodi[fuoco].vicini.has(i);
        return nelFuoco ? 1 : filtroAttivo && !nodo.acceso ? 0.05 : 0.12;
      }
      return !filtroAttivo || nodo.acceso ? 1 : 0.1;
    };

    // --- Legami: fili sottili, non geometrie — la trama, non la gabbia ---
    ctx.lineWidth = Math.max(0.45, 0.6 * Math.min(zoom, 1.3));
    for (const legame of this.legami) {
      const na = this.nodi[legame.a];
      const nb = this.nodi[legame.b];
      let alfa = 0.09 + 0.04 * Math.min(legame.peso, 4);
      if (fuoco >= 0) {
        alfa = legame.a === fuoco || legame.b === fuoco ? 0.5 : 0.03;
      } else if (filtroAttivo) {
        alfa = na.acceso && nb.acceso ? alfa + 0.12 : 0.03;
      }
      ctx.strokeStyle = `rgba(159, 180, 214, ${alfa.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(na.sx, na.sy);
      ctx.lineTo(nb.sx, nb.sy);
      ctx.stroke();
    }

    // --- Nodi ---
    for (let i = 0; i < this.nodi.length; i++) {
      const nodo = this.nodi[i];
      const alfa = rilievo(i);
      const raggio = nodo.r * Math.min(zoom, 1.6);
      /* L'alone è raro: il fuoco, i nodi accesi da ricerca o filtro, e gli
         hub grossi. I punti piccoli restano nitidi, senza bagliori. */
      const enfasi = i === fuoco || (fuoco < 0 && filtroAttivo && nodo.acceso);

      ctx.globalAlpha = alfa;
      if (enfasi) {
        ctx.shadowColor = nodo.colore;
        ctx.shadowBlur = 12;
      } else if (alfa > 0.5 && nodo.r >= 6) {
        ctx.shadowColor = nodo.colore;
        ctx.shadowBlur = 7;
      }
      ctx.beginPath();
      ctx.arc(nodo.sx, nodo.sy, raggio, 0, Math.PI * 2);
      if (nodo.dato.tipo === 'ricordo' && nodo.dato.attivo === false) {
        /* Il ricordo sospeso è un cerchio vuoto: c'è, ma dorme. */
        ctx.strokeStyle = nodo.colore;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        ctx.fillStyle = nodo.colore;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (nodo.dato.chiave === selezionata) {
        ctx.strokeStyle = 'rgba(242, 239, 232, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(nodo.sx, nodo.sy, raggio + 3.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // --- Etichette: gli hub sempre, il resto quando conta ---
    ctx.font = `10.5px ${this.fontMono}`;
    ctx.textAlign = 'center';
    /* L'ombra scura stacca il testo dal fondale di puntini. */
    ctx.shadowColor = 'rgba(12, 11, 9, 0.9)';
    ctx.shadowBlur = 4;
    for (let i = 0; i < this.nodi.length; i++) {
      const nodo = this.nodi[i];
      const nelFuoco = fuoco >= 0 && (i === fuoco || this.nodi[fuoco].vicini.has(i));
      /* Con un filtro o una ricerca attivi i nodi accesi si nominano: sono
         la risposta alla domanda appena fatta. */
      const daFiltro = fuoco < 0 && filtroAttivo && nodo.acceso;
      /* A riposo il globo tace: i nomi emergono in dissolvenza con lo zoom
         — prima gli hub, poi tutto il resto — come nel grafo di Obsidian. */
      const daZoom =
        rilievo(i) > 0.5 ? Math.min(1, Math.max(0, (nodo.r * zoom - 9) / 4)) : 0;
      if (!nelFuoco && !daFiltro && daZoom <= 0) continue;
      const alfa = nelFuoco || daFiltro ? 0.95 : daZoom * 0.8;
      ctx.fillStyle = `rgba(230, 227, 218, ${alfa.toFixed(3)})`;
      ctx.fillText(nodo.dato.etichetta, nodo.sx, nodo.sy + nodo.r * Math.min(zoom, 1.6) + 12);
    }
    ctx.shadowBlur = 0;
  }
}
