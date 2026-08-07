/**
 * Grafo della memoria — porting fedele di website/src/scripts/memory-graph.ts.
 *
 * Stesso seme e stessa costruzione: la figura del video coincide con quella
 * che il sito disegna nella sezione «Memoria viva». In più, qui il grafo sa
 * accogliere un ricordo nuovo: nodo che nasce, legami verso i vicini e un
 * lampo che si espande.
 */

export const GRAPH_W = 1040;
export const GRAPH_H = 1000;

type Node = {
  bx: number;
  by: number;
  c: string;
  r: number;
  ph: number;
  sp: number;
  amp: number;
};

export type GraphModel = {
  nodes: Node[];
  near: [number, number, number][];
  far: [number, number][];
  hubs: { i: number; c: string; r: number }[];
  rings: { a: number; r: number; o: number; ph: number }[];
  cx: number;
  cy: number;
  R: number;
};

const PALETTE = [
  '#7F97C4',
  '#4E6C9E',
  '#8FA8B8',
  '#9BB39C',
  '#C08A6E',
  '#B4BCC6',
];

export function buildGraph(): GraphModel {
  const W = GRAPH_W;
  const H = GRAPH_H;
  const cx = W / 2;
  const cy = H / 2;

  // Congruenziale lineare con seme fisso: stessa figura del sito.
  let seed = 20260731;
  const rnd = () =>
    (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const R = Math.min(W, H) * 0.4;

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

  const nodes: Node[] = [];
  const push = (x: number, y: number, c: string, r: number) =>
    nodes.push({
      bx: x,
      by: y,
      c,
      r,
      ph: rnd() * Math.PI * 2,
      sp: 0.25 + rnd() * 0.5,
      amp: 1.6 + rnd() * 3.4,
    });

  for (const cl of clusters) {
    const count = 26 + Math.floor(rnd() * 34);
    for (let j = 0; j < count; j++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * cl.r;
      const x = cl.x + Math.cos(a) * d;
      const y = cl.y + Math.sin(a) * d;
      if (Math.hypot(x - cx, y - cy) > R) continue;
      push(x, y, cl.c, 1.5 + rnd() * 2.2);
    }
  }

  for (let i = 0; i < 380; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * R * 0.95;
    push(cx + Math.cos(a) * d, cy + Math.sin(a) * d, '#6D7681', 1.1 + rnd() * 1.4);
  }

  const near: [number, number, number][] = [];
  const maxD = 46;
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

  const hubs: { i: number; c: string; r: number }[] = [];
  for (let i = 0; i < 22; i++) {
    hubs.push({
      i: Math.floor(rnd() * nodes.length),
      c: i % 3 === 0 ? '#C08A6E' : '#9BB39C',
      r: 4 + rnd() * 3,
    });
  }

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

  return { nodes, near, far, hubs, rings, cx, cy, R };
}

/** Il ricordo nuovo, con il suo stato di avanzamento. */
export type MemoryEvent = {
  /** Posizione in coordinate del grafo (1040×1000). */
  x: number;
  y: number;
  /** Crescita del nodo, 0–1. */
  progress: number;
  /** Età del lampo in secondi (negativa = non ancora scattato). */
  flashAge: number;
};

/** Molla con rimbalzo: il nodo nasce e supera un attimo la sua misura. */
const easeOutBack = (p: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  m: GraphModel,
  t: number,
  memory: MemoryEvent | null,
) {
  const { nodes, near, far, hubs, rings, cx, cy } = m;

  const px = (n: Node) => n.bx + Math.sin(t * n.sp + n.ph) * n.amp;
  const py = (n: Node) => n.by + Math.cos(t * n.sp * 0.85 + n.ph) * n.amp;

  ctx.fillStyle = '#1C1A15';
  ctx.fillRect(0, 0, GRAPH_W, GRAPH_H);

  ctx.lineWidth = 0.6;
  for (const [i, k, o] of near) {
    ctx.strokeStyle = `rgba(159,180,214,${o.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(px(nodes[i]!), py(nodes[i]!));
    ctx.lineTo(px(nodes[k]!), py(nodes[k]!));
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(127,151,196,0.10)';
  ctx.beginPath();
  for (const [i, k] of far) {
    ctx.moveTo(px(nodes[i]!), py(nodes[i]!));
    ctx.lineTo(px(nodes[k]!), py(nodes[k]!));
  }
  ctx.stroke();

  for (const n of nodes) {
    ctx.fillStyle = n.c;
    ctx.beginPath();
    ctx.arc(px(n), py(n), n.r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const h of hubs) {
    const n = nodes[h.i]!;
    ctx.fillStyle = h.c;
    ctx.beginPath();
    ctx.arc(px(n), py(n), h.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const spin = t * 0.012;
  for (const p of rings) {
    const a = p.a + spin;
    const rr = p.r + Math.sin(t * 0.5 + p.ph) * 1.6;
    ctx.fillStyle = `rgba(127,151,196,${p.o})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- Il ricordo nuovo --- */
  if (memory && memory.progress > 0) {
    const g = Math.min(1, memory.progress);

    // Legami verso i vicini: si accendono con la crescita del nodo.
    const dists = nodes
      .map((n, i) => ({ i, d: Math.hypot(n.bx - memory.x, n.by - memory.y) }))
      .filter((e) => e.d > 1 && e.d < 120)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    ctx.lineWidth = 1.1;
    for (const e of dists) {
      const n = nodes[e.i]!;
      ctx.strokeStyle = `rgba(214,178,138,${(0.7 * g).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(memory.x, memory.y);
      ctx.lineTo(px(n), py(n));
      ctx.stroke();
    }

    // Alone permanente: il ricordo appena nato resta il punto caldo del grafo.
    const halo = ctx.createRadialGradient(
      memory.x,
      memory.y,
      0,
      memory.x,
      memory.y,
      30,
    );
    halo.addColorStop(0, `rgba(232,196,148,${(0.3 * g).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(232,196,148,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(memory.x, memory.y, 30, 0, Math.PI * 2);
    ctx.fill();

    // Il nodo: nasce con un piccolo rimbalzo e resta il più caldo del grafo.
    const r = 9.5 * easeOutBack(g);
    ctx.fillStyle = '#D8A87E';
    ctx.beginPath();
    ctx.arc(memory.x, memory.y, Math.max(0, r), 0, Math.PI * 2);
    ctx.fill();
  }

  /* --- Il lampo: doppio anello che si espande e un bagliore che sfuma --- */
  if (memory && memory.flashAge >= 0 && memory.flashAge < 1.2) {
    for (const [delay, speed] of [
      [0, 1],
      [0.15, 0.8],
    ] as const) {
      const age = memory.flashAge - delay;
      if (age < 0) continue;
      const p = Math.min(1, age / (1.05 * speed));
      const rr = 14 + p * 150;
      const alpha = (1 - p) * 0.6;
      ctx.strokeStyle = `rgba(216,168,126,${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.4 * (1 - p) + 0.4;
      ctx.beginPath();
      ctx.arc(memory.x, memory.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    const p = Math.min(1, memory.flashAge / 1.2);
    const glowR = 30 + p * 130;
    const grad = ctx.createRadialGradient(
      memory.x,
      memory.y,
      0,
      memory.x,
      memory.y,
      glowR,
    );
    grad.addColorStop(0, `rgba(232,196,148,${(0.4 * (1 - p)).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(232,196,148,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(memory.x, memory.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }
}
