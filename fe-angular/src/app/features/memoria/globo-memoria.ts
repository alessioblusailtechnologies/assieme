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
import { EtichettaStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';

import { nomeCompagnia } from '@shared/testi/etichette';

import { etichettaCategoria } from './categorie';

/**
 * Il globo della memoria: **la figura del sito, fatta di cose vere**.
 *
 * La composizione è quella di `website/src/scripts/memory-graph.ts` (e della
 * sua gemella `app-grafo-memoria`): i temi addensati in grappoli sparsi nel
 * cerchio, la trama fitta dei legami corti, i fili lunghi che attraversano
 * il quadro, gli anelli perimetrali, la deriva lenta che non si ferma mai.
 * Lì i pallini sono generati; qui ognuno è un nodo di
 * `GET /api/ricordi/grafo` — un ricordo, una conversazione, un passaggio
 * citato, un documento, un prodotto, una compagnia, un ramo.
 *
 * Rispetto al globo di prima cambia il posto dei nodi. Non c'è più un
 * layout a forze che si assesta e si spegne: i grappoli sono quelli veri
 * dei dati (una compagnia coi suoi prodotti e documenti, una conversazione
 * coi suoi passaggi e ricordi), disposti a corona come nella figura, e i
 * rami stanno al centro perché i loro fili attraversino il quadro. Il posto
 * è deterministico — stesso seme, stessa figura a ogni apertura — e sopra
 * ci corre soltanto la deriva.
 *
 * Passando sopra un pallino il dettaglio si legge lì: tipo, nome, contesto,
 * e per un passaggio citato l'estratto. Il clic apre la scheda nel cassetto
 * (il PDF alla pagina esatta, la conversazione, il documento). La ricerca
 * accende i nodi che corrispondono e spegne il resto; la legenda fa lo
 * stesso per tipo.
 *
 * Niente librerie: geometria scritta qui, come il resto della grafica del
 * progetto. Se la figura cambia sul sito va riportata qui e in
 * `app-grafo-memoria`: sono la stessa cosa e devono restare tali.
 */

/** La palette della memoria viva (sito e figura decorativa): un colore per tipo. */
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
  ramo: 4.6,
  compagnia: 4,
  conversazione: 3.6,
  prodotto: 2.8,
  ricordo: 2.8,
  punto: 2.1,
  documento: 1.9,
};

/** Cosa fa il clic, per tipo: l'ultima riga del dettaglio in evidenza. */
const AZIONI: Record<TipoNodoGrafo, string> = {
  ricordo: 'clic per il ricordo intero',
  conversazione: 'clic per aprire il filo',
  punto: 'clic per il passaggio nel PDF',
  documento: 'clic per la scheda del documento',
  prodotto: 'clic per la scheda',
  compagnia: 'clic per la scheda',
  ramo: 'clic per la scheda',
};

const DUE_PI = Math.PI * 2;

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;

/**
 * Il raggio del quadro in coordinate di mondo: lo stesso della figura del
 * sito (là `R = min(W, H) * 0.4` su una tela 1040x1000), così le taglie dei
 * pallini e l'ampiezza della deriva si portano di peso.
 */
const RAGGIO = 400;

/** Gli anelli stanno appena fuori dal quadro: l'inquadratura li tiene dentro. */
const RAGGIO_INQUADRATURA = RAGGIO * 1.14;

/** Il dettaglio testuale che compare sfiorando un pallino. */
interface SchedaNodo {
  tipo: string;
  titolo: string;
  /** La riga breve sotto al nome: ambito, archivio, pagina, compagnia. */
  contesto?: string;
  /** Il testo lungo: l'estratto citato, i conteggi dei figli. */
  dettaglio?: string;
  azione: string;
}

/** Ciò che il riquadro in evidenza mostra, e dove. */
interface Evidenza extends SchedaNodo {
  x: number;
  y: number;
  /** Il riquadro sbatterebbe contro il bordo destro: si apre a sinistra. */
  aSinistra: boolean;
}

interface NodoDisegno {
  dato: NodoGrafoMemoria;
  /** Il posto nel quadro: la deriva ci oscilla intorno, non lo cambia. */
  bx: number;
  by: number;
  /** Posizione a schermo dell'ultimo fotogramma, per il colpo di mira. */
  sx: number;
  sy: number;
  r: number;
  colore: string;
  /** La deriva lenta della memoria viva: fase, velocità, ampiezza. */
  ph: number;
  sp: number;
  amp: number;
  vicini: Set<number>;
  /** Vero se passa ricerca e filtro di tipo. */
  acceso: boolean;
  scheda: SchedaNodo;
}

interface LegameDisegno {
  a: number;
  b: number;
  peso: number;
  /** Dentro un grappolo è trama fitta; fuori è un filo lungo, quasi spento. */
  dentro: boolean;
}

/** Il tema attorno a cui la memoria si addensa: una compagnia, una conversazione. */
interface Grappolo {
  seme: number;
  membri: number[];
  x: number;
  y: number;
  r: number;
}

/** Un pallino dell'orlo: gli anelli perimetrali della figura del sito. */
interface PuntoAnello {
  a: number;
  r: number;
  o: number;
  ph: number;
}

/** Congruenziale lineare: figura identica a ogni apertura, come sul sito. */
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

const NOME_ARCHIVIO: Record<string, string> = {
  pubblico: 'archivio pubblico',
  privato: 'archivio privato',
  conversazione: 'allegato di conversazione',
};

/**
 * Il dettaglio che si legge sfiorando il pallino. Dice cos'è, come si chiama
 * e la cosa che conta: il testo di un ricordo, l'estratto di un passaggio,
 * quanti figli ha un nodo dell'archivio.
 */
function schedaDelNodo(nodo: NodoGrafoMemoria, vicini: NodoGrafoMemoria[]): SchedaNodo {
  const quanti = (tipo: TipoNodoGrafo): number => vicini.filter((v) => v.tipo === tipo).length;
  const elenca = (...tipi: TipoNodoGrafo[]): string =>
    tipi
      .map((tipo) => [quanti(tipo), tipo] as const)
      .filter(([q]) => q > 0)
      .map(([q, tipo]) => `${q} ${ETICHETTE_TIPO[tipo][q === 1 ? 0 : 1]}`)
      .join(' · ');

  const base = {
    tipo: ETICHETTE_TIPO[nodo.tipo][0],
    titolo: nodo.etichetta,
    azione: AZIONI[nodo.tipo],
  };

  switch (nodo.tipo) {
    case 'ricordo': {
      const parti = [nodo.ambito === 'tenant' ? 'agenzia' : 'personale'];
      if (nodo.categoria) parti.push(etichettaCategoria(nodo.categoria).toLowerCase());
      if (nodo.attivo === false) parti.push('sospeso');
      return { ...base, titolo: nodo.testo ?? nodo.etichetta, contesto: parti.join(' · ') };
    }

    case 'punto': {
      const c = nodo.citazione;
      if (!c) return base;
      const posizione = [`pagina ${c.posizione.pagina}`];
      if (c.posizione.sezione) posizione.push(c.posizione.sezione);
      posizione.push(c.documentoTitolo);
      return { ...base, contesto: posizione.join(' · '), dettaglio: `«${c.estratto}»` };
    }

    case 'documento':
      return {
        ...base,
        contesto: NOME_ARCHIVIO[nodo.archivio ?? 'pubblico'],
        dettaglio: elenca('punto') || undefined,
      };

    case 'prodotto':
      return {
        ...base,
        contesto: vicini.find((v) => v.tipo === 'compagnia')?.etichetta,
        dettaglio: elenca('documento') || undefined,
      };

    case 'conversazione':
      return { ...base, dettaglio: elenca('punto', 'ricordo') || 'nessun passaggio citato' };

    case 'compagnia':
      return { ...base, dettaglio: elenca('prodotto', 'documento') || undefined };

    case 'ramo':
      return { ...base, dettaglio: elenca('prodotto', 'compagnia') || undefined };
  }
}

@Component({
  selector: 'app-globo-memoria',
  imports: [
    Bottone,
    Campo,
    Cassetto,
    EtichettaStato,
    Icona,
    RouterLink,
    Scheletro,
    StatoVuoto,
    Tag,
    VisualizzatorePdf,
  ],
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
  /** Il dettaglio del pallino sotto al puntatore: c'è solo mentre lo si sfiora. */
  protected readonly evidenza = signal<Evidenza | undefined>(undefined);

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
  private anelli: PuntoAnello[] = [];
  private indicePerChiave = new Map<string, number>();

  private ctx?: CanvasRenderingContext2D;
  private larghezza = 0;
  private altezza = 0;
  private zoom = 1;
  private panX = 0;
  private panY = 0;

  private inMira = -1;
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
       entrambi i casi, e ricompone la figura a ogni reload. */
    effect(() => {
      const grafo = this.grafo();
      if (grafo) this.componi(grafo);
    });

    /* Ricerca e legenda non spostano nulla: riaccendono solo il disegno. */
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

    /* Nessun motivo di animare una figura che non si vede. */
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

  // --- La composizione: i grappoli veri al posto dei cluster generati -----

  private componi(grafo: GrafoMemoria): void {
    this.indicePerChiave = new Map(grafo.nodi.map((n, i) => [n.chiave, i]));

    /* Nomi di compagnia al presente (`nomeCompagnia`): sola resa. */
    const dati = grafo.nodi.map((originale) =>
      originale.tipo === 'compagnia'
        ? { ...originale, etichetta: nomeCompagnia(originale.id, originale.etichetta) }
        : originale,
    );

    const adiacenza: number[][] = dati.map(() => []);
    const legami: LegameDisegno[] = [];
    for (const legame of grafo.legami) {
      const a = this.indicePerChiave.get(legame.da);
      const b = this.indicePerChiave.get(legame.a);
      if (a === undefined || b === undefined) continue;
      adiacenza[a].push(b);
      adiacenza[b].push(a);
      legami.push({ a, b, peso: legame.peso, dentro: false });
    }
    this.legami = legami;

    this.nodi = dati.map((dato, i) => {
      const rnd = pseudoCasuale(hashChiave(dato.chiave));
      return {
        dato,
        bx: 0,
        by: 0,
        sx: 0,
        sy: 0,
        /* Le taglie della figura del sito: i pallini piccoli, gli hub appena
           più grossi. La radice del peso, così un ramo con venti prodotti si
           vede senza dominare il quadro. */
        r: Math.min(RAGGI_BASE[dato.tipo] + 0.55 * Math.sqrt(dato.peso), 8.5),
        colore: COLORI_TIPO[dato.tipo],
        ph: rnd() * DUE_PI,
        sp: 0.25 + rnd() * 0.5,
        amp: 1.4 + rnd() * 2.2,
        vicini: new Set<number>(adiacenza[i]),
        acceso: true,
        scheda: schedaDelNodo(
          dato,
          adiacenza[i].map((j) => dati[j]),
        ),
      };
    });

    this.disponi(dati, adiacenza);
    this.componiAnelli();
    this.aggiornaAccesi();
    this.inquadra();
    this.avvia();
  }

  /**
   * Il posto di ogni nodo. I temi (compagnie e conversazioni) fanno da semi:
   * una visita in ampiezza dà a ognuno il suo grappolo, i grappoli si
   * dispongono a corona come i cluster della figura, i rami restano al centro
   * perché i loro fili attraversino il quadro. Tutto seminato dalla chiave del
   * nodo: la figura è la stessa a ogni apertura.
   */
  private disponi(dati: NodoGrafoMemoria[], adiacenza: number[][]): void {
    const n = dati.length;
    const eSeme = (tipo: TipoNodoGrafo): boolean =>
      tipo === 'compagnia' || tipo === 'conversazione';

    /* Prima le compagnie, poi le conversazioni: a pari distanza un documento
       d'archivio resta alla sua compagnia, non alla chat che l'ha citato. */
    const indici = dati.map((_, i) => i);
    const semi = [
      ...indici.filter((i) => dati[i].tipo === 'compagnia'),
      ...indici.filter((i) => dati[i].tipo === 'conversazione'),
    ];

    const grappoloDi = new Int32Array(n).fill(-1);
    const padre = new Int32Array(n).fill(-1);
    const coda: number[] = [];
    semi.forEach((indice, g) => {
      grappoloDi[indice] = g;
      coda.push(indice);
    });

    /* La coda cresce mentre la si percorre: è la visita in ampiezza, e
       l'iteratore dell'array legge la lunghezza a ogni passo. */
    for (const i of coda) {
      /* Il ramo non fa da ponte: se ci passasse, tutte le compagnie dello
         stesso ramo finirebbero in un grappolo solo. */
      if (dati[i].tipo === 'ramo') continue;
      for (const j of adiacenza[i]) {
        if (grappoloDi[j] >= 0 || eSeme(dati[j].tipo) || dati[j].tipo === 'ramo') continue;
        grappoloDi[j] = grappoloDi[i];
        padre[j] = i;
        coda.push(j);
      }
    }

    const grappoli: Grappolo[] = semi.map((seme) => ({ seme, membri: [], x: 0, y: 0, r: 0 }));
    for (let i = 0; i < n; i++) {
      if (grappoloDi[i] >= 0) grappoli[grappoloDi[i]].membri.push(i);
    }

    /* Il disco del grappolo cresce con la radice dei membri: la densità resta
       quella della figura, comunque sia fatto l'archivio. */
    for (const g of grappoli) {
      g.r = Math.min(Math.max(16 * Math.sqrt(g.membri.length), RAGGIO * 0.08), RAGGIO * 0.3);
    }

    this.disponiGrappoli(grappoli, dati);
    for (const g of grappoli) this.disponiMembri(g, dati, padre);

    /* I rami al centro: il tronco da cui parte l'archivio. */
    const rami = indici.filter((i) => dati[i].tipo === 'ramo');
    rami.forEach((indice, k) => {
      const angolo = (k / Math.max(rami.length, 1)) * DUE_PI + 0.4;
      const distanza = rami.length === 1 ? 0 : RAGGIO * 0.14;
      this.nodi[indice].bx = Math.cos(angolo) * distanza;
      this.nodi[indice].by = Math.sin(angolo) * distanza;
    });

    /* Ciò che non ha né grappolo né tronco è il rumore di fondo della figura
       del sito: sparso nel cerchio, al suo posto di sempre. */
    for (let i = 0; i < n; i++) {
      if (grappoloDi[i] >= 0 || dati[i].tipo === 'ramo') continue;
      const rnd = pseudoCasuale(hashChiave(dati[i].chiave) ^ 0x9e3779b9);
      const angolo = rnd() * DUE_PI;
      const distanza = Math.sqrt(rnd()) * RAGGIO * 0.95;
      this.nodi[i].bx = Math.cos(angolo) * distanza;
      this.nodi[i].by = Math.sin(angolo) * distanza;
    }

    for (const legame of this.legami) {
      legame.dentro = grappoloDi[legame.a] >= 0 && grappoloDi[legame.a] === grappoloDi[legame.b];
    }
  }

  /** I centri dei grappoli: a corona come nella figura, poi distanziati. */
  private disponiGrappoli(grappoli: Grappolo[], dati: NodoGrafoMemoria[]): void {
    /* L'ordine attorno alla corona alterna i grappoli grossi e quelli
       piccoli. Coi dati veri i temi non si somigliano — una compagnia porta
       quaranta documenti, un'altra cinque — e metterli in fila lascerebbe
       mezzo quadro vuoto e l'altra metà ammassata. */
    const perTaglia = [...grappoli].sort((a, b) => b.membri.length - a.membri.length);
    const corona = perTaglia.map((_, k) =>
      k % 2 === 0 ? perTaglia[k / 2] : perTaglia[perTaglia.length - 1 - (k - 1) / 2],
    );

    corona.forEach((g, i) => {
      if (corona.length === 1) {
        g.x = 0;
        g.y = 0;
        return;
      }
      const rnd = pseudoCasuale(hashChiave(dati[g.seme].chiave));
      const angolo = (i / corona.length) * DUE_PI + rnd() * 0.35;
      /* La distanza si misura dall'orlo, non dal centro: conta dove arriva
         il bordo del disco, così un grappolo di tre nodi riempie il quadro
         quanto uno di quaranta invece di sparire in un angolo. Le due
         profondità, a coppie, danno alla corona il respiro della figura del
         sito, dove i cluster non stanno tutti sullo stesso cerchio. */
      const bersaglio = (Math.floor(i / 2) % 2 === 0 ? 0.9 : 0.64) - 0.05 * rnd();
      const distanza = Math.max(RAGGIO * bersaglio - g.r * 0.86, RAGGIO * 0.3);
      g.x = Math.cos(angolo) * distanza;
      g.y = Math.sin(angolo) * distanza;
    });

    /* Due dischi sovrapposti sarebbero una macchia sola: qualche passata di
       distanziamento e la corona si legge. Deterministica come il resto. */
    for (let passata = 0; passata < 260; passata++) {
      for (let i = 0; i < grappoli.length; i++) {
        for (let j = i + 1; j < grappoli.length; j++) {
          const a = grappoli[i];
          const b = grappoli[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const minima = (a.r + b.r) * 0.92 + 10;
          if (d >= minima) continue;
          const spinta = ((minima - d) / d) * 0.25;
          a.x -= dx * spinta;
          a.y -= dy * spinta;
          b.x += dx * spinta;
          b.y += dy * spinta;
        }
      }
      for (const g of grappoli) {
        /* Il quadro è tondo: nessun disco sfonda l'orlo, e nessuno si siede
           sul tronco dei rami al centro. */
        const d = Math.hypot(g.x, g.y) || 0.01;
        const massima = RAGGIO * 0.94 - g.r;
        if (d > massima) {
          g.x *= massima / d;
          g.y *= massima / d;
        }
        const minima = RAGGIO * 0.26 + g.r * 0.45;
        if (d < minima) {
          g.x *= minima / d;
          g.y *= minima / d;
        }
      }
    }
  }

  /**
   * Dentro il grappolo: il tema al centro, i suoi figli su un anello, i
   * nipoti in una nuvoletta attorno al padre. È la densità dei cluster della
   * figura, con la struttura vera sotto.
   */
  private disponiMembri(g: Grappolo, dati: NodoGrafoMemoria[], padre: Int32Array): void {
    const figli = new Map<number, number[]>();
    for (const membro of g.membri) {
      const p = padre[membro];
      if (p < 0) continue;
      const elenco = figli.get(p);
      if (elenco) elenco.push(membro);
      else figli.set(p, [membro]);
    }

    this.nodi[g.seme].bx = g.x;
    this.nodi[g.seme].by = g.y;

    const rndSeme = pseudoCasuale(hashChiave(dati[g.seme].chiave) ^ 0x5bf03635);
    const scarto = rndSeme() * DUE_PI;

    const primi = figli.get(g.seme) ?? [];
    primi.forEach((figlio, k) => {
      const angolo = scarto + (k / Math.max(primi.length, 1)) * DUE_PI;
      const rnd = pseudoCasuale(hashChiave(dati[figlio].chiave));
      const distanza = g.r * (0.6 + rnd() * 0.08);
      const x = g.x + Math.cos(angolo) * distanza;
      const y = g.y + Math.sin(angolo) * distanza;
      this.nodi[figlio].bx = x;
      this.nodi[figlio].by = y;
      this.disponiNuvola(figlio, x, y, angolo, g, dati, figli, 1);
    });

    /* Un membro senza padre nel grappolo non resta nell'origine: si posa nel
       disco come tutto il resto. */
    for (const membro of g.membri) {
      if (membro === g.seme || padre[membro] >= 0) continue;
      const rnd = pseudoCasuale(hashChiave(dati[membro].chiave) ^ 0x2545f491);
      const angolo = rnd() * DUE_PI;
      const distanza = Math.sqrt(rnd()) * g.r;
      this.nodi[membro].bx = g.x + Math.cos(angolo) * distanza;
      this.nodi[membro].by = g.y + Math.sin(angolo) * distanza;
    }
  }

  /** La nuvoletta dei figli attorno al padre, spinta verso l'orlo. */
  private disponiNuvola(
    nodo: number,
    px: number,
    py: number,
    verso: number,
    g: Grappolo,
    dati: NodoGrafoMemoria[],
    figli: Map<number, number[]>,
    profondita: number,
  ): void {
    const elenco = figli.get(nodo);
    if (!elenco?.length || profondita > 3) return;

    const raggio = Math.min(g.r * 0.4, 7 * Math.sqrt(elenco.length) + 4);
    /* Il centro della nuvoletta sta appena più fuori del padre: i documenti
       di un prodotto guardano verso l'orlo, non verso il tema. */
    const cx = px + Math.cos(verso) * raggio * 0.7;
    const cy = py + Math.sin(verso) * raggio * 0.7;

    elenco.forEach((figlio, k) => {
      const rnd = pseudoCasuale(hashChiave(dati[figlio].chiave));
      const angolo = (k / elenco.length) * DUE_PI + rnd() * 0.6;
      const distanza = Math.sqrt(0.25 + 0.75 * rnd()) * raggio;
      const x = cx + Math.cos(angolo) * distanza;
      const y = cy + Math.sin(angolo) * distanza;
      this.nodi[figlio].bx = x;
      this.nodi[figlio].by = y;
      this.disponiNuvola(figlio, x, y, angolo, g, dati, figli, profondita + 1);
    });
  }

  /** L'orlo: i due anelli perimetrali della figura del sito, tali e quali. */
  private componiAnelli(): void {
    const rnd = pseudoCasuale(20260731);
    const anelli: PuntoAnello[] = [];
    for (let anello = 0; anello < 2; anello++) {
      const rr = RAGGIO * (1 + anello * 0.07);
      const quanti = 190 + anello * 40;
      for (let i = 0; i < quanti; i++) {
        const a = (i / quanti) * DUE_PI + rnd() * 0.02;
        const scarto = (rnd() - 0.5) * RAGGIO * 0.03;
        anelli.push({ a, r: rr + scarto, o: anello === 0 ? 0.85 : 0.45, ph: rnd() * DUE_PI });
      }
    }
    this.anelli = anelli;
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

  // --- Inquadratura -------------------------------------------------------

  /** Inquadra il cerchio intero, orlo compreso: la figura è la composizione. */
  private inquadra(): void {
    if (!this.larghezza) return;
    this.zoom = Math.min(
      Math.max(
        (Math.min(this.larghezza, this.altezza) * 0.96) / (RAGGIO_INQUADRATURA * 2),
        ZOOM_MIN,
      ),
      ZOOM_MAX,
    );
    this.panX = 0;
    this.panY = 0;
    this.evidenza.set(undefined);
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
    this.evidenza.set(undefined);
    this.chiediFotogramma();
  }

  // --- Puntatore ----------------------------------------------------------

  private collegaPuntatore(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.mosso = false;
      this.inPanoramica = true;
      this.ultimoPuntatore = this.puntoLocale(canvas, e);
    });

    canvas.addEventListener('pointermove', (e) => {
      const punto = this.puntoLocale(canvas, e);
      if (this.inPanoramica) {
        const dx = punto.x - this.ultimoPuntatore.x;
        const dy = punto.y - this.ultimoPuntatore.y;
        /* Sotto i due pixel è un clic con la mano ferma, non una panoramica. */
        if (!this.mosso && Math.hypot(dx, dy) <= 2) return;
        this.mosso = true;
        this.panX += dx;
        this.panY += dy;
        this.ultimoPuntatore = punto;
        this.evidenza.set(undefined);
        this.chiediFotogramma();
        return;
      }
      const prima = this.inMira;
      this.inMira = this.colpisci(punto.x, punto.y);
      canvas.style.cursor = this.inMira >= 0 ? 'pointer' : 'grab';
      if (prima !== this.inMira) {
        this.mostraDettaglio(this.inMira);
        this.chiediFotogramma();
      }
    });

    const rilascia = (e: PointerEvent): void => {
      if (this.inPanoramica && !this.mosso) {
        const punto = this.puntoLocale(canvas, e);
        const colpito = this.colpisci(punto.x, punto.y);
        /* Un clic sul vuoto chiude la scheda: lo stesso gesto della chat. */
        this.selezionato.set(colpito >= 0 ? this.nodi[colpito].dato : undefined);
      }
      this.inPanoramica = false;
      canvas.releasePointerCapture(e.pointerId);
      this.chiediFotogramma();
    };
    canvas.addEventListener('pointerup', rilascia);
    canvas.addEventListener('pointercancel', rilascia);

    canvas.addEventListener('pointerleave', () => {
      this.inPanoramica = false;
      if (this.inMira >= 0) {
        this.inMira = -1;
        this.evidenza.set(undefined);
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

  /**
   * Il dettaglio in evidenza si àncora al posto fermo del nodo, non a quello
   * che oscilla: un riquadro che trema mentre lo si legge è illeggibile.
   */
  private mostraDettaglio(indice: number): void {
    if (indice < 0) {
      this.evidenza.set(undefined);
      return;
    }
    const nodo = this.nodi[indice];
    const x = this.larghezza / 2 + this.panX + nodo.bx * this.zoom;
    const y = this.altezza / 2 + this.panY + nodo.by * this.zoom;
    /* Il riquadro è centrato sul nodo: vicino ai bordi si tiene dentro la
       scena, anche a costo di non essere esattamente all'altezza del punto. */
    const margine = Math.min(110, this.altezza / 2);
    this.evidenza.set({
      ...nodo.scheda,
      x,
      y: Math.min(Math.max(y, margine), this.altezza - margine),
      aSinistra: x > this.larghezza - 300,
    });
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
      /* Senza movimento la figura resta, la deriva no: le interazioni
         ridisegnano fotogramma per fotogramma. */
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
    /* La deriva della memoria viva: la stessa formula della figura del sito,
       in coordinate di mondo perché lo zoom non la ingigantisca. */
    const deriva = this.senzaMovimento ? 0 : 1;

    for (const nodo of this.nodi) {
      const dx = deriva * Math.sin(t * nodo.sp + nodo.ph) * nodo.amp;
      const dy = deriva * Math.cos(t * nodo.sp * 0.85 + nodo.ph) * nodo.amp;
      nodo.sx = cx + this.panX + (nodo.bx + dx) * zoom;
      nodo.sy = cy + this.panY + (nodo.by + dy) * zoom;
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
        return nelFuoco ? 1 : filtroAttivo && !nodo.acceso ? 0.05 : 0.3;
      }
      return !filtroAttivo || nodo.acceso ? 1 : 0.1;
    };

    ctx.lineWidth = Math.max(0.45, 0.6 * Math.min(zoom, 1.3));

    /* I fili lunghi: i rami che tengono i prodotti, un passaggio citato che
       chiama un documento dall'altra parte del quadro. Sono la trama larga
       della figura, e a riposo si disegnano in una passata sola. */
    if (fuoco < 0 && !filtroAttivo) {
      ctx.strokeStyle = 'rgba(127, 151, 196, 0.10)';
      ctx.beginPath();
      for (const legame of this.legami) {
        if (legame.dentro) continue;
        ctx.moveTo(this.nodi[legame.a].sx, this.nodi[legame.a].sy);
        ctx.lineTo(this.nodi[legame.b].sx, this.nodi[legame.b].sy);
      }
      ctx.stroke();
    }

    // --- I legami: fili sottili, non geometrie: la trama, non la gabbia ---
    for (const legame of this.legami) {
      const na = this.nodi[legame.a];
      const nb = this.nodi[legame.b];
      let alfa = legame.dentro ? 0.13 + 0.05 * Math.min(legame.peso, 4) : 0;
      if (fuoco >= 0) {
        alfa = legame.a === fuoco || legame.b === fuoco ? 0.55 : legame.dentro ? 0.07 : 0.04;
      } else if (filtroAttivo) {
        alfa = na.acceso && nb.acceso ? Math.max(alfa, 0.18) : 0.03;
      }
      if (alfa <= 0) continue;
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
      } else if (alfa > 0.5 && nodo.r >= 5) {
        ctx.shadowColor = nodo.colore;
        ctx.shadowBlur = 7;
      }
      ctx.beginPath();
      ctx.arc(nodo.sx, nodo.sy, raggio, 0, DUE_PI);
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
        ctx.arc(nodo.sx, nodo.sy, raggio + 3.5, 0, DUE_PI);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // --- L'orlo: gli anelli perimetrali girano piano, come sul sito ---
    const rotazione = deriva * t * 0.012;
    const orlo = fuoco >= 0 || filtroAttivo ? 0.6 : 1;
    const raggioOrlo = Math.max(1, 1.6 * Math.min(zoom, 1.4));
    for (const punto of this.anelli) {
      const a = punto.a + rotazione;
      const rr = punto.r + deriva * Math.sin(t * 0.5 + punto.ph) * 1.6;
      ctx.fillStyle = `rgba(127, 151, 196, ${(punto.o * orlo).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(
        cx + this.panX + Math.cos(a) * rr * zoom,
        cy + this.panY + Math.sin(a) * rr * zoom,
        raggioOrlo,
        0,
        DUE_PI,
      );
      ctx.fill();
    }

    // --- Etichette: gli hub sempre, il resto quando conta ---
    ctx.font = `10.5px ${this.fontMono}`;
    ctx.textAlign = 'center';
    /* L'ombra scura stacca il testo dal fondale di puntini. */
    ctx.shadowColor = 'rgba(12, 11, 9, 0.9)';
    ctx.shadowBlur = 4;
    /* Un hub con trenta figli non si nomina tutto: sarebbe un muro di testo
       sopra la figura. Il nodo nel mirino non si nomina affatto, il suo nome
       sta già nel riquadro del dettaglio. */
    const vicinato = fuoco >= 0 && this.nodi[fuoco].vicini.size <= 12;
    for (let i = 0; i < this.nodi.length; i++) {
      if (i === fuoco) continue;
      const nodo = this.nodi[i];
      const nelFuoco = vicinato && this.nodi[fuoco].vicini.has(i);
      /* Con un filtro o una ricerca attivi i nodi accesi si nominano: sono la
         risposta alla domanda appena fatta. */
      const daFiltro = fuoco < 0 && filtroAttivo && nodo.acceso;
      /* A riposo la figura tace: i nomi emergono in dissolvenza con lo zoom,
         prima gli hub e poi tutto il resto. */
      const daZoom = rilievo(i) > 0.5 ? Math.min(1, Math.max(0, (nodo.r * zoom - 9) / 4)) : 0;
      if (!nelFuoco && !daFiltro && daZoom <= 0) continue;
      const alfa = nelFuoco || daFiltro ? 0.95 : daZoom * 0.8;
      ctx.fillStyle = `rgba(230, 227, 218, ${alfa.toFixed(3)})`;
      ctx.fillText(nodo.dato.etichetta, nodo.sx, nodo.sy + nodo.r * Math.min(zoom, 1.6) + 12);
    }
    ctx.shadowBlur = 0;
  }
}
