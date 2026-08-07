import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

/**
 * Il grafo della memoria viva — la stessa figura del sito (portata da
 * `website/src/scripts/memory-graph.ts`): cluster di nodi con deriva lenta.
 * A differenza del sito il fondo è **trasparente**: la figura prende il
 * colore di chi la ospita — la carta chiara del pannello memoria,
 * l'inchiostro della schermata di accesso. Vive in `shared/ui` perché più
 * feature la usano, e la regola del progetto vieta gli import fra feature.
 * Le tre proprietà che contano sono le stesse:
 *
 *  · il seme è fisso, quindi la figura è identica a ogni apertura;
 *  · con `prefers-reduced-motion` disegna un solo fotogramma e si ferma;
 *  · l'animazione corre solo con il canvas nel viewport e la scheda visibile.
 *
 * Se il disegno cambia sul sito, va riportato qui: sono la stessa figura e
 * devono restare tali — è il riconoscimento visivo della «memoria viva».
 */

interface Nodo {
  bx: number;
  by: number;
  x: number;
  y: number;
  c: string;
  r: number;
  ph: number;
  sp: number;
  amp: number;
}

/** Per il canvas senza contesto 2D e per il modo «senza movimento». */
const NIENTE_DA_FERMARE = (): void => undefined;

const PALETTE = ['#7F97C4', '#4E6C9E', '#8FA8B8', '#9BB39C', '#C08A6E', '#B4BCC6'];

function avviaGrafo(cv: HTMLCanvasElement): () => void {
  const ctx = cv.getContext('2d');
  if (!ctx) return NIENTE_DA_FERMARE;

  const W = cv.width;
  const H = cv.height;
  const cx = W / 2;
  const cy = H / 2;

  // Congruenziale lineare con seme fisso: stessa figura a ogni visita.
  let seme = 20260731;
  const rnd = () => (seme = (seme * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const R = Math.min(W, H) * 0.4;

  /* --- Cluster: i "temi" attorno a cui la memoria si addensa --- */
  const clusters: { x: number; y: number; c: string; r: number }[] = [];
  const nClusters = 14;
  for (let i = 0; i < nClusters; i++) {
    const a = (i / nClusters) * Math.PI * 2 + rnd() * 0.4;
    const d = R * (0.25 + rnd() * 0.62);
    clusters.push({
      x: cx + Math.cos(a) * d,
      y: cy + Math.sin(a) * d,
      c: PALETTE[i % PALETTE.length],
      r: R * (0.1 + rnd() * 0.1),
    });
  }

  /* --- Nodi --- */
  const nodi: Nodo[] = [];
  const aggiungi = (x: number, y: number, c: string, r: number) =>
    nodi.push({
      bx: x,
      by: y,
      x,
      y,
      c,
      r,
      ph: rnd() * Math.PI * 2,
      sp: 0.25 + rnd() * 0.5,
      amp: 1.6 + rnd() * 3.4,
    });

  for (const cl of clusters) {
    const quanti = 26 + Math.floor(rnd() * 34);
    for (let j = 0; j < quanti; j++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * cl.r;
      const x = cl.x + Math.cos(a) * d;
      const y = cl.y + Math.sin(a) * d;
      if (Math.hypot(x - cx, y - cy) > R) continue;
      aggiungi(x, y, cl.c, 1.5 + rnd() * 2.2);
    }
  }

  // Nodi diffusi: il "rumore di fondo" dell'archivio.
  for (let i = 0; i < 380; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.95;
    aggiungi(cx + Math.cos(a) * d, cy + Math.sin(a) * d, '#6D7681', 1.1 + rnd() * 1.4);
  }

  /* --- Legami --- */
  const vicini: [number, number, number][] = [];
  const maxD = 46;
  for (let i = 0; i < nodi.length; i++) {
    for (let k = i + 1; k < i + 16 && k < nodi.length; k++) {
      const dist = Math.hypot(nodi[i].bx - nodi[k].bx, nodi[i].by - nodi[k].by);
      if (dist < maxD) vicini.push([i, k, 0.05 + 0.16 * (1 - dist / maxD)]);
    }
  }

  const lontani: [number, number][] = [];
  for (let i = 0; i < 240; i++) {
    lontani.push([Math.floor(rnd() * nodi.length), Math.floor(rnd() * nodi.length)]);
  }

  /* --- Hub: i nodi con più connessioni --- */
  const hub: { i: number; c: string; r: number }[] = [];
  for (let i = 0; i < 22; i++) {
    hub.push({
      i: Math.floor(rnd() * nodi.length),
      c: i % 3 === 0 ? '#C08A6E' : '#9BB39C',
      r: 4 + rnd() * 3,
    });
  }

  /* --- Anelli perimetrali --- */
  const anelli: { a: number; r: number; o: number; ph: number }[] = [];
  for (let anello = 0; anello < 2; anello++) {
    const rr = R * (1.1 + anello * 0.07);
    const quanti = 190 + anello * 40;
    for (let i = 0; i < quanti; i++) {
      const a = (i / quanti) * Math.PI * 2 + rnd() * 0.02;
      const j = (rnd() - 0.5) * R * 0.03;
      anelli.push({ a, r: rr + j, o: anello === 0 ? 0.85 : 0.45, ph: rnd() * Math.PI * 2 });
    }
  }

  /* --- Disegno --- */
  const disegna = (t: number) => {
    for (const n of nodi) {
      n.x = n.bx + Math.sin(t * n.sp + n.ph) * n.amp;
      n.y = n.by + Math.cos(t * n.sp * 0.85 + n.ph) * n.amp;
    }

    /* Fondo trasparente: sul sito qui c'è l'inchiostro (#14181D), nel
       pannello la figura prende il fondo della carta che la ospita. */
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 0.6;
    for (const [i, k, o] of vicini) {
      ctx.strokeStyle = `rgba(159,180,214,${o.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(nodi[i].x, nodi[i].y);
      ctx.lineTo(nodi[k].x, nodi[k].y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(127,151,196,0.10)';
    ctx.beginPath();
    for (const [i, k] of lontani) {
      ctx.moveTo(nodi[i].x, nodi[i].y);
      ctx.lineTo(nodi[k].x, nodi[k].y);
    }
    ctx.stroke();

    for (const n of nodi) {
      ctx.fillStyle = n.c;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const h of hub) {
      const n = nodi[h.i];
      ctx.fillStyle = h.c;
      ctx.beginPath();
      ctx.arc(n.x, n.y, h.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const rotazione = t * 0.012;
    for (const p of anelli) {
      const a = p.a + rotazione;
      const rr = p.r + Math.sin(t * 0.5 + p.ph) * 1.6;
      ctx.fillStyle = `rgba(127,151,196,${p.o})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* --- Ciclo --- */
  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (calmo.matches) {
    // Un fotogramma solo: la figura resta, il movimento no.
    disegna(0);
    return NIENTE_DA_FERMARE;
  }

  let raf = 0;
  let ultimo = 0;
  let inCorsa = false;

  const fotogramma = (ts: number) => {
    if (!inCorsa) return;
    raf = requestAnimationFrame(fotogramma);
    if (ts - ultimo < 33) return; // ~30 fps: basta, e costa metà CPU
    ultimo = ts;
    disegna(ts / 1000);
  };

  const avvia = () => {
    if (inCorsa) return;
    inCorsa = true;
    raf = requestAnimationFrame(fotogramma);
  };

  const ferma = () => {
    inCorsa = false;
    cancelAnimationFrame(raf);
  };

  disegna(0);

  // Nessun motivo di animare un canvas che non si vede.
  const osservatore = new IntersectionObserver(
    ([voce]) => (voce?.isIntersecting ? avvia() : ferma()),
    { rootMargin: '120px' },
  );
  osservatore.observe(cv);

  const suVisibilita = () => {
    if (document.hidden) ferma();
    else if (cv.isConnected) avvia();
  };
  document.addEventListener('visibilitychange', suVisibilita);

  return () => {
    ferma();
    osservatore.disconnect();
    document.removeEventListener('visibilitychange', suVisibilita);
  };
}

@Component({
  selector: 'app-grafo-memoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas
      #tela
      width="1040"
      height="1000"
      role="img"
      aria-label="Rappresentazione della memoria viva dell'agenzia: centinaia di nodi — documenti, regole e casistica risolta — raggruppati in temi e collegati fra loro."
    ></canvas>
  `,
  styles: `
    :host {
      display: block;
    }

    /* Risoluzione doppia rispetto alla resa: nitido su schermi ad alta
       densità senza dover ridisegnare al variare del DPR. */
    canvas {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 1040 / 1000;
    }
  `,
})
export class GrafoMemoria {
  private readonly tela = viewChild.required<ElementRef<HTMLCanvasElement>>('tela');

  constructor() {
    const distruzione = inject(DestroyRef);
    afterNextRender(() => {
      const ferma = avviaGrafo(this.tela().nativeElement);
      distruzione.onDestroy(ferma);
    });
  }
}
