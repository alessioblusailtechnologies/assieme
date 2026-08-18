import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from 'remotion';

/* ---------------------------------------------------------------------------
 * Astratti per la pagina Piattaforma: tre loop 4:3 che abitano le
 * feature__figure al posto dei segnaposto tratteggiati.
 *
 * Nessuna parola, nessuna interfaccia: solo la grammatica grafica del sito
 * (carta calda, filetti, blu Velia) messa in movimento. Ogni animazione è
 * funzione periodica del fotogramma, così il loop si chiude senza salti.
 * ------------------------------------------------------------------------ */

export const AST_W = 1120;
export const AST_H = 840;
export const AST_FPS = 30;
export const BIB_DUR = 240; // 8 s   — la scansione attraversa gli scaffali
export const MET_DUR = 300; // 10 s  — la regola scende lungo il paragrafo
export const AGE_DUR = 360; // 12 s  — le orbite chiudono giri interi

const C = {
  ground: '#EEEDEA', // --c-page-alt: il pannello media si stacca appena dalla pagina
  hair: '#DAD7D0',
  barA: '#D8D5CE',
  barB: '#C9C6BE',
  mute: '#9B978B',
  ink: '#1C1A15',
  accent: '#2F4B7C',
};

/** Pseudo-caso deterministico: stessa scena a ogni render. */
const rnd = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

/* ---------------------------------------------------------------------------
 * Biblioteca — schiere di dorsi in filetto su tre scaffali; una scansione
 * blu attraversa l'archivio e per un attimo solleva e accende i dorsi che
 * tocca: il catalogo c'è già, la ricerca lo percorre.
 * ------------------------------------------------------------------------ */

type Spine = { x: number; w: number; h: number; base: string; shelf: number };

const SHELVES = [268, 512, 756];

const buildSpines = (): Spine[] => {
  const spines: Spine[] = [];
  let k = 0;
  SHELVES.forEach((baseline, shelf) => {
    let x = 96;
    while (x < 1016) {
      const w = 7 + rnd(k) * 9;
      const h = 118 + rnd(k + 50) * 74;
      const tone = rnd(k + 200);
      const base = tone < 0.55 ? C.barA : tone < 0.88 ? C.barB : C.mute;
      spines.push({ x, w, h, base, shelf });
      x += w + 15 + rnd(k + 99) * 9 + (rnd(k + 300) < 0.1 ? 26 : 0);
      k += 1;
    }
  });
  return spines;
};

const SPINES = buildSpines();

export const AstrattoBiblioteca: React.FC = () => {
  const frame = useCurrentFrame();
  const sx = interpolate(frame, [0, BIB_DUR], [-170, AST_W + 170]);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {SHELVES.map((y) => (
          <rect key={y} x={80} y={y + 1} width={AST_W - 160} height={1.5} fill={C.hair} />
        ))}
        {SPINES.map((s, i) => {
          const cx = s.x + s.w / 2;
          const inf = gauss(cx - sx, 95);
          const lift = 12 * inf;
          const fill = interpolateColors(inf, [0, 1], [s.base, C.accent]);
          const baseline = SHELVES[s.shelf];
          return (
            <g key={i}>
              <rect
                x={s.x}
                y={baseline - s.h - lift}
                width={s.w}
                height={s.h}
                rx={s.w / 2 > 3 ? 3 : s.w / 2}
                fill={fill}
              />
              {/* Il segno di lettura sopra il dorso toccato dalla scansione. */}
              <rect
                x={cx - 1}
                y={baseline - s.h - lift - 16}
                width={2}
                height={9}
                fill={C.accent}
                opacity={inf}
              />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------------
 * Metodo — un paragrafo astratto di barre; una regola blu scende lungo il
 * testo e, dove passa, pesa: accende un segmento, ne sottolinea un altro.
 * Il giudizio che si adatta al criterio, riga per riga.
 * ------------------------------------------------------------------------ */

type Seg = { x: number; w: number; base: string };
type Row = { y: number; segs: Seg[]; activeSeg: number; underSeg: number };

const buildRows = (): Row[] => {
  const rows: Row[] = [];
  for (let i = 0; i < 8; i++) {
    const y = 140 + i * 76;
    const nseg = 2 + Math.floor(rnd(i * 7 + 1) * 2);
    const ragged = 40 + rnd(i * 11 + 3) * 150;
    const total = 860 - ragged;
    const segs: Seg[] = [];
    let x = 130;
    let remaining = total;
    for (let sIdx = 0; sIdx < nseg; sIdx++) {
      const last = sIdx === nseg - 1;
      const w = last
        ? remaining
        : Math.max(90, (remaining / (nseg - sIdx)) * (0.7 + rnd(i * 17 + sIdx) * 0.6));
      segs.push({ x, w, base: rnd(i * 23 + sIdx * 5) < 0.5 ? C.barA : C.barB });
      x += w + 20;
      remaining -= w + 20;
    }
    const activeSeg = Math.floor(rnd(i * 13 + 5) * nseg);
    rows.push({ y, segs, activeSeg, underSeg: (activeSeg + 1) % nseg });
  }
  return rows;
};

const ROWS = buildRows();

export const AstrattoMetodo: React.FC = () => {
  const frame = useCurrentFrame();
  /* La regola entra dall'alto ed esce dal basso fuori quadro: il loop si
   * riavvia senza che il salto si veda. */
  const ruleY = interpolate(frame, [0, MET_DUR], [-40, AST_H + 40]);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {ROWS.map((row, i) => {
          const inf = gauss(row.y - ruleY, 64);
          return (
            <g key={i}>
              {/* La tacca d'indice a margine, come il filo di un elenco. */}
              <rect x={102} y={row.y + 6} width={12} height={2} fill={C.hair} />
              {row.segs.map((seg, sIdx) => {
                const active = sIdx === row.activeSeg;
                const fill = active
                  ? interpolateColors(inf, [0, 1], [seg.base, C.accent])
                  : seg.base;
                return (
                  <g key={sIdx}>
                    <rect x={seg.x} y={row.y} width={seg.w} height={14} rx={7} fill={fill} />
                    {sIdx === row.underSeg && (
                      <rect
                        x={seg.x}
                        y={row.y + 22}
                        width={seg.w * Easing.ease(Math.min(1, inf * 1.3))}
                        height={2}
                        fill={C.accent}
                        opacity={Math.min(1, inf * 1.4)}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* La regola: un filetto blu con il suo segno a margine. */}
        <rect x={80} y={ruleY} width={AST_W - 160} height={1.5} fill={C.accent} opacity={0.4} />
        <rect x={80} y={ruleY - 3.5} width={8} height={8} fill={C.accent} />
      </svg>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------------
 * Agenti — un sistema orbitale silenzioso: tre anelli in filetto, nodi che
 * girano con periodi interi, un impulso che parte dal centro a cadenza
 * regolare. Il lavoro che gira da solo, anche quando nessuno guarda.
 * ------------------------------------------------------------------------ */

const CXA = AST_W / 2;
const CYA = AST_H / 2;
const RINGS = [128, 216, 304];

type Node = { ring: number; phase: number; revs: number; r: number; color: string };

const NODES: Node[] = [
  { ring: 0, phase: 0, revs: 2, r: 6, color: C.ink },
  { ring: 1, phase: 0, revs: -1, r: 7.5, color: C.accent },
  { ring: 1, phase: Math.PI, revs: -1, r: 5.5, color: C.ink },
  { ring: 2, phase: 0, revs: 1, r: 5, color: C.ink },
  { ring: 2, phase: (2 * Math.PI) / 3, revs: 1, r: 5, color: C.mute },
  { ring: 2, phase: (4 * Math.PI) / 3, revs: 1, r: 5, color: C.ink },
];

const angDist = (a: number, b: number) => {
  let d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

export const AstrattoAgenti: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / AGE_DUR;

  const nodeAngle = (n: Node) => n.phase + n.revs * 2 * Math.PI * t;

  /* L'impulso: due onde sfalsate di mezzo periodo, sempre in viaggio. */
  const pulses = [0, 90].map((off) => {
    const p = ((frame + off) % 180) / 180;
    return { r: 22 + p * 300, o: (1 - p) * 0.3 * Easing.ease(Math.min(1, p * 4)) };
  });

  const ring2Angles = NODES.filter((n) => n.ring === 2).map(nodeAngle);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {RINGS.map((r) => (
          <circle key={r} cx={CXA} cy={CYA} r={r} fill="none" stroke={C.hair} strokeWidth={1.5} />
        ))}
        {pulses.map((p, i) => (
          <circle
            key={i}
            cx={CXA}
            cy={CYA}
            r={p.r}
            fill="none"
            stroke={C.accent}
            strokeWidth={1.5}
            opacity={p.o}
          />
        ))}
        {/* Le dodici tacche dell'anello esterno: si accendono al passaggio. */}
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k * Math.PI) / 6;
          const glow = Math.max(...ring2Angles.map((na) => gauss(angDist(a, na), 0.14)));
          const r0 = RINGS[2] + 12;
          const r1 = RINGS[2] + 22;
          return (
            <line
              key={k}
              x1={CXA + r0 * Math.cos(a)}
              y1={CYA + r0 * Math.sin(a)}
              x2={CXA + r1 * Math.cos(a)}
              y2={CYA + r1 * Math.sin(a)}
              stroke={interpolateColors(glow, [0, 1], [C.hair, C.accent])}
              strokeWidth={2}
            />
          );
        })}
        {/* La scia del nodo blu: sei fantasmi che sbiadiscono. */}
        {Array.from({ length: 6 }, (_, k) => {
          const n = NODES[1];
          const a = nodeAngle(n) - Math.sign(n.revs) * (k + 1) * 0.055;
          return (
            <circle
              key={k}
              cx={CXA + RINGS[n.ring] * Math.cos(a)}
              cy={CYA + RINGS[n.ring] * Math.sin(a)}
              r={n.r * (1 - k * 0.13)}
              fill={C.accent}
              opacity={0.28 - k * 0.045}
            />
          );
        })}
        {NODES.map((n, i) => {
          const a = nodeAngle(n);
          return (
            <circle
              key={i}
              cx={CXA + RINGS[n.ring] * Math.cos(a)}
              cy={CYA + RINGS[n.ring] * Math.sin(a)}
              r={n.r}
              fill={n.color}
            />
          );
        })}
        <circle cx={CXA} cy={CYA} r={20} fill="none" stroke={C.accent} strokeWidth={1.5} opacity={0.6} />
        <circle cx={CXA} cy={CYA} r={6} fill={C.ink} />
      </svg>
    </AbsoluteFill>
  );
};
