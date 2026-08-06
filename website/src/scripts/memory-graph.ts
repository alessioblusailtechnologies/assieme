/**
 * Grafo della memoria — visualizzazione procedurale a cluster con deriva lenta.
 *
 * Portato dal design Assieme. Rispetto all'originale:
 *  · il seme è fisso, quindi la figura è identica a ogni caricamento;
 *  · con `prefers-reduced-motion` disegna un solo fotogramma e si ferma;
 *  · l'animazione parte solo quando il canvas entra nel viewport e si sospende
 *    quando ne esce, per non tenere occupato un rAF a fondo pagina.
 */

export interface GraphOptions {
  /** Moltiplicatore dei raggi: 1 corrisponde al canvas 1040×1000 del design. */
  scale?: number;
}

type Node = {
  bx: number;
  by: number;
  x: number;
  y: number;
  c: string;
  r: number;
  ph: number;
  sp: number;
  amp: number;
};

const PALETTE = [
  '#7F97C4',
  '#4E6C9E',
  '#8FA8B8',
  '#9BB39C',
  '#C08A6E',
  '#B4BCC6',
];

export function startGraph(
  cv: HTMLCanvasElement,
  opts: GraphOptions = {},
): () => void {
  const ctx = cv.getContext('2d');
  if (!ctx) return () => {};

  const W = cv.width;
  const H = cv.height;
  const cx = W / 2;
  const cy = H / 2;
  const scale = opts.scale ?? 1;

  // Congruenziale lineare con seme fisso: stessa figura a ogni visita.
  let seed = 20260731;
  const rnd = () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

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
      c: PALETTE[i % PALETTE.length]!,
      r: R * (0.1 + rnd() * 0.1),
    });
  }

  /* --- Nodi --- */
  const nodes: Node[] = [];
  const push = (x: number, y: number, c: string, r: number) =>
    nodes.push({
      bx: x,
      by: y,
      x,
      y,
      c,
      r,
      ph: rnd() * Math.PI * 2,
      sp: 0.25 + rnd() * 0.5,
      amp: (1.6 + rnd() * 3.4) * scale,
    });

  for (const cl of clusters) {
    const count = 26 + Math.floor(rnd() * 34);
    for (let j = 0; j < count; j++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * cl.r;
      const x = cl.x + Math.cos(a) * d;
      const y = cl.y + Math.sin(a) * d;
      if (Math.hypot(x - cx, y - cy) > R) continue;
      push(x, y, cl.c, (1.5 + rnd() * 2.2) * scale);
    }
  }

  // Nodi diffusi: il "rumore di fondo" dell'archivio.
  for (let i = 0; i < 380; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.95;
    push(cx + Math.cos(a) * d, cy + Math.sin(a) * d, '#6D7681', (1.1 + rnd() * 1.4) * scale);
  }

  /* --- Legami --- */
  const near: [number, number, number][] = [];
  const maxD = 46 * scale;
  for (let i = 0; i < nodes.length; i++) {
    for (let k = i + 1; k < i + 16 && k < nodes.length; k++) {
      const dist = Math.hypot(nodes[i]!.bx - nodes[k]!.bx, nodes[i]!.by - nodes[k]!.by);
      if (dist < maxD) near.push([i, k, 0.05 + 0.16 * (1 - dist / maxD)]);
    }
  }

  const far: [number, number][] = [];
  for (let i = 0; i < 240; i++) {
    far.push([
      Math.floor(rnd() * nodes.length),
      Math.floor(rnd() * nodes.length),
    ]);
  }

  /* --- Hub: i nodi con più connessioni --- */
  const hubs: { i: number; c: string; r: number }[] = [];
  for (let i = 0; i < 22; i++) {
    hubs.push({
      i: Math.floor(rnd() * nodes.length),
      c: i % 3 === 0 ? '#C08A6E' : '#9BB39C',
      r: (4 + rnd() * 3) * scale,
    });
  }

  /* --- Anelli perimetrali --- */
  const rings: { a: number; r: number; o: number; ph: number }[] = [];
  for (let ring = 0; ring < 2; ring++) {
    const rr = R * (1.1 + ring * 0.07);
    const count = 190 + ring * 40;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.02;
      const j = (rnd() - 0.5) * R * 0.03;
      rings.push({ a, r: rr + j, o: ring === 0 ? 0.85 : 0.45, ph: rnd() * Math.PI * 2 });
    }
  }

  /* --- Disegno --- */
  const draw = (t: number) => {
    for (const n of nodes) {
      n.x = n.bx + Math.sin(t * n.sp + n.ph) * n.amp;
      n.y = n.by + Math.cos(t * n.sp * 0.85 + n.ph) * n.amp;
    }

    /* L'inchiostro caldo della palette di piattaforma. */
    ctx.fillStyle = '#1C1A15';
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = 0.6 * scale;
    for (const [i, k, o] of near) {
      ctx.strokeStyle = `rgba(159,180,214,${o.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(nodes[i]!.x, nodes[i]!.y);
      ctx.lineTo(nodes[k]!.x, nodes[k]!.y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(127,151,196,0.10)';
    ctx.beginPath();
    for (const [i, k] of far) {
      ctx.moveTo(nodes[i]!.x, nodes[i]!.y);
      ctx.lineTo(nodes[k]!.x, nodes[k]!.y);
    }
    ctx.stroke();

    for (const n of nodes) {
      ctx.fillStyle = n.c;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const h of hubs) {
      const n = nodes[h.i]!;
      ctx.fillStyle = h.c;
      ctx.beginPath();
      ctx.arc(n.x, n.y, h.r, 0, Math.PI * 2);
      ctx.fill();
    }

    const spin = t * 0.012;
    for (const p of rings) {
      const a = p.a + spin;
      const rr = p.r + Math.sin(t * 0.5 + p.ph) * 1.6 * scale;
      ctx.fillStyle = `rgba(127,151,196,${p.o})`;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  /* --- Ciclo --- */
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (calm.matches) {
    // Un fotogramma solo: la figura resta, il movimento no.
    draw(0);
    return () => {};
  }

  let raf = 0;
  let last = 0;
  let running = false;

  const frame = (ts: number) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return; // ~30 fps: basta, e costa metà CPU
    last = ts;
    draw(ts / 1000);
  };

  const play = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };

  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  draw(0);

  // Il grafo sta a metà pagina: nessun motivo di animarlo prima che si veda.
  const io = new IntersectionObserver(
    ([entry]) => (entry?.isIntersecting ? play() : pause()),
    { rootMargin: '120px' },
  );
  io.observe(cv);

  const onVisibility = () => {
    if (document.hidden) pause();
    else if (cv.isConnected) play();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    pause();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
