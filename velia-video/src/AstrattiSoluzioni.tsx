import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from 'remotion';
import { AST_H, AST_W, C, gauss, rnd } from './Astratti';

/* ---------------------------------------------------------------------------
 * Astratti per la pagina Soluzioni: quattro loop 4:3, uno per mestiere,
 * nella stessa grammatica della Piattaforma — carta calda, filetti, blu
 * Velia. Ogni animazione è funzione periodica del fotogramma: il loop si
 * chiude senza giunzioni.
 * ------------------------------------------------------------------------ */

export const AGZ_DUR = 240; // 8 s  — il confronto scorre le righe
export const BRO_DUR = 300; // 10 s — la scansione scorre le colonne
export const INT_DUR = 300; // 10 s — la regola si propaga e torna quiete
export const CMP_DUR = 360; // 12 s — i testi scendono, un segnale risale

/** Distanza circolare fra due posizioni su un anello di lunghezza n. */
const circ = (a: number, b: number, n: number) => {
  const d = Math.abs(a - b) % n;
  return d > n / 2 ? n - d : d;
};

/* ---------------------------------------------------------------------------
 * Agenzie — due documenti fianco a fianco: le tue condizioni e il preventivo
 * arrivato stamattina. Il confronto percorre le righe una alla volta e le
 * collega con un filetto blu: si legge solo quello che cambia.
 * ------------------------------------------------------------------------ */

const AGZ = {
  card: { y: 140, h: 560, w: 280 },
  leftX: 200,
  rightX: 640,
  rows: 6,
  rowY: (i: number) => 226 + i * 72,
};

export const SoluzioneAgenzie: React.FC = () => {
  const frame = useCurrentFrame();
  const p = (frame / AGZ_DUR) * AGZ.rows;

  const card = (x: number, seed: number) => (
    <g>
      <rect
        x={x}
        y={AGZ.card.y}
        width={AGZ.card.w}
        height={AGZ.card.h}
        fill={C.card}
        stroke={C.hair}
        strokeWidth={1.5}
      />
      <rect x={x + 28} y={AGZ.card.y + 32} width={104 + rnd(seed) * 48} height={12} rx={6} fill={C.barB} />
    </g>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {card(AGZ.leftX, 1)}
        {card(AGZ.rightX, 2)}
        {Array.from({ length: AGZ.rows }, (_, i) => {
          const y = AGZ.rowY(i);
          const inf = gauss(circ(p, i + 0.5, AGZ.rows), 0.38);
          const wl = 150 + rnd(i * 3 + 10) * 70;
          const wr = 130 + rnd(i * 5 + 40) * 90;
          const tintL = interpolateColors(inf, [0, 1], [C.barA, C.accent]);
          const tintR = interpolateColors(inf, [0, 1], [C.barA, C.accent]);
          return (
            <g key={i}>
              <rect x={AGZ.leftX + 28} y={y} width={wl} height={10} rx={5} fill={tintL} />
              <rect x={AGZ.rightX + 28} y={y} width={wr} height={10} rx={5} fill={tintR} />
              {/* Il filetto del confronto fra le due righe omologhe. */}
              <line
                x1={AGZ.leftX + AGZ.card.w}
                y1={y + 5}
                x2={AGZ.rightX}
                y2={y + 5}
                stroke={C.accent}
                strokeWidth={1.5}
                opacity={inf * 0.85}
              />
              <rect
                x={556}
                y={y + 1}
                width={8}
                height={8}
                fill={C.accent}
                opacity={inf}
                transform={`rotate(45 560 ${y + 5})`}
              />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------------
 * Broker — la tabella che gli altri non reggono: dieci prodotti in colonna,
 * sei criteri in riga. La lettura scorre le colonne; le celle vuote restano
 * dichiarate, in filetto, non indovinate.
 * ------------------------------------------------------------------------ */

const BRO = {
  cols: 10,
  rows: 6,
  cw: 72,
  ch: 34,
  gx: 16,
  gy: 22,
  x0: 128,
  y0: 282,
};

export const SoluzioneBroker: React.FC = () => {
  const frame = useCurrentFrame();
  const p = (frame / BRO_DUR) * BRO.cols;

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {Array.from({ length: BRO.cols }, (_, c) => {
          const x = BRO.x0 + c * (BRO.cw + BRO.gx);
          const inf = gauss(circ(p, c + 0.5, BRO.cols), 0.55);
          const lift = 4 * inf;
          return (
            <g key={c}>
              {/* L'intestazione di colonna: il prodotto. */}
              <rect
                x={x + 14}
                y={BRO.y0 - 36 - lift}
                width={44}
                height={8}
                rx={4}
                fill={interpolateColors(inf, [0, 1], [C.mute, C.accent])}
              />
              {Array.from({ length: BRO.rows }, (_, r) => {
                const y = BRO.y0 + r * (BRO.ch + BRO.gy);
                const empty = rnd(c * 17 + r * 31 + 7) < 0.09;
                const base = rnd(c * 7 + r * 13) < 0.5 ? C.barA : C.barB;
                return empty ? (
                  <rect
                    key={r}
                    x={x}
                    y={y - lift}
                    width={BRO.cw}
                    height={BRO.ch}
                    rx={4}
                    fill="none"
                    stroke={interpolateColors(inf, [0, 1], [C.hair, C.accent])}
                    strokeWidth={1.5}
                  />
                ) : (
                  <rect
                    key={r}
                    x={x}
                    y={y - lift}
                    width={BRO.cw}
                    height={BRO.ch}
                    rx={4}
                    fill={interpolateColors(inf, [0, 1], [base, C.accent])}
                  />
                );
              })}
            </g>
          );
        })}
        {/* Le etichette di riga: i criteri, fermi mentre le colonne scorrono. */}
        {Array.from({ length: BRO.rows }, (_, r) => (
          <rect
            key={r}
            x={BRO.x0 - 60}
            y={BRO.y0 + r * (BRO.ch + BRO.gy) + BRO.ch / 2 - 4}
            width={36}
            height={8}
            rx={4}
            fill={C.barB}
          />
        ))}
      </svg>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------------
 * Intermediari — una regola scritta una volta, in alto, e l'onda che la
 * porta a tutti i fascicoli dello studio: la struttura grande, senza il
 * reparto tecnico.
 * ------------------------------------------------------------------------ */

const INT = {
  ruleY: 268,
  trunkTop: 314,
  railY: 428,
  docTop: 484,
  docs: 9,
  docX: (i: number) => 138 + i * (786 / 8),
};

export const SoluzioneIntermediari: React.FC = () => {
  const frame = useCurrentFrame();
  /* Il fronte d'onda parte prima del centro e muore oltre i bordi: agli
   * estremi del loop tutto è in quiete, la giunzione non si vede. */
  const wave = interpolate(frame, [0, INT_DUR], [-280, 660]);
  const q = interpolate(frame, [34, 92], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {/* La regola: una riga blu e la sua postilla. */}
        <rect x={460} y={INT.ruleY} width={200} height={14} rx={7} fill={C.accent} />
        <rect x={492} y={INT.ruleY + 26} width={136} height={8} rx={4} fill={C.barB} />
        <line x1={560} y1={INT.trunkTop + 24} x2={560} y2={INT.railY} stroke={C.hair} strokeWidth={1.5} />
        <line x1={158} y1={INT.railY} x2={962} y2={INT.railY} stroke={C.hair} strokeWidth={1.5} />
        {/* L'impulso che scende dal tronco prima che l'onda si allarghi. */}
        <circle
          cx={560}
          cy={INT.trunkTop + 24 + q * (INT.railY - INT.trunkTop - 24)}
          r={4.5}
          fill={C.accent}
          opacity={Math.sin(Math.PI * q) * (frame < 100 ? 1 : 0)}
        />
        {Array.from({ length: INT.docs }, (_, i) => {
          const x = INT.docX(i);
          const inf = gauss(Math.abs(x + 22 - 560) - wave, 60);
          const border = interpolateColors(inf, [0, 1], [C.hair, C.accent]);
          return (
            <g key={i}>
              <line x1={x + 22} y1={INT.railY} x2={x + 22} y2={INT.docTop} stroke={border} strokeWidth={1.5} />
              <rect x={x} y={INT.docTop} width={44} height={58} fill={C.card} stroke={border} strokeWidth={1.5} />
              <rect x={x + 9} y={INT.docTop + 14} width={26} height={5} rx={2.5} fill={C.barB} />
              <rect
                x={x + 9}
                y={INT.docTop + 27}
                width={20}
                height={5}
                rx={2.5}
                fill={interpolateColors(inf, [0, 1], [C.barA, C.accent])}
              />
              {/* La spunta sopra il fascicolo raggiunto dalla regola. */}
              <rect x={x + 20} y={INT.docTop - 18} width={4} height={9} fill={C.accent} opacity={inf} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------------
 * Compagnie — il testo in alto, la rete in basso: le edizioni scendono lungo
 * i fili, e ogni tanto un segnale caldo risale — la clausola che genera
 * domande, vista prima del contenzioso.
 * ------------------------------------------------------------------------ */

const CMP = {
  srcX: 520,
  srcY: 110,
  srcW: 80,
  srcH: 104,
  docs: 8,
  docY: 600,
  docX: (i: number) => 150 + i * (764 / 7),
  upThread: 5,
};

/** Punto sulla quadratica: sorgente → controllo → fascicolo. */
const bez = (t: number, x1: number, y1: number, xc: number, yc: number, x2: number, y2: number) => {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * xc + t * t * x2,
    y: u * u * y1 + 2 * u * t * yc + t * t * y2,
  };
};

export const SoluzioneCompagnie: React.FC = () => {
  const frame = useCurrentFrame();
  const start = { x: CMP.srcX + CMP.srcW / 2, y: CMP.srcY + CMP.srcH };

  const thread = (i: number) => {
    const end = { x: CMP.docX(i) + 26, y: CMP.docY };
    const ctrl = { x: start.x + (end.x - start.x) * 0.22, y: 430 };
    return { end, ctrl };
  };

  return (
    <AbsoluteFill style={{ backgroundColor: C.ground }}>
      <svg width={AST_W} height={AST_H} viewBox={`0 0 ${AST_W} ${AST_H}`}>
        {/* Il testo della compagnia: un documento solo, a monte. */}
        <rect x={CMP.srcX} y={CMP.srcY} width={CMP.srcW} height={CMP.srcH} fill={C.card} stroke={C.hair} strokeWidth={1.5} />
        <rect x={CMP.srcX + 14} y={CMP.srcY + 20} width={52} height={7} rx={3.5} fill={C.accent} />
        <rect x={CMP.srcX + 14} y={CMP.srcY + 38} width={44} height={6} rx={3} fill={C.barB} />
        <rect x={CMP.srcX + 14} y={CMP.srcY + 54} width={48} height={6} rx={3} fill={C.barA} />

        {Array.from({ length: CMP.docs }, (_, i) => {
          const { end, ctrl } = thread(i);
          const phase = ((frame + i * 45) % CMP_DUR) / CMP_DUR;
          const going = phase < 0.55;
          const t = phase / 0.55;
          const dot = bez(Math.min(1, t), start.x, start.y, ctrl.x, ctrl.y, end.x, end.y);
          const arrivo = gauss(phase - 0.55, 0.05);

          /* Il segnale che risale: un filo solo, colore caldo. */
          const up = i === CMP.upThread ? ((frame + 210) % CMP_DUR) / CMP_DUR : null;
          const upT = up !== null && up < 0.4 ? 1 - up / 0.4 : null;
          const upDot = upT !== null ? bez(upT, start.x, start.y, ctrl.x, ctrl.y, end.x, end.y) : null;

          return (
            <g key={i}>
              <path
                d={`M ${start.x} ${start.y} Q ${ctrl.x} ${ctrl.y} ${end.x} ${end.y}`}
                fill="none"
                stroke={C.hair}
                strokeWidth={1.5}
              />
              {going && (
                <circle cx={dot.x} cy={dot.y} r={4} fill={C.accent} opacity={Math.sin(Math.PI * t) * 0.9} />
              )}
              {upDot && (
                <circle
                  cx={upDot.x}
                  cy={upDot.y}
                  r={4.5}
                  fill={C.warm}
                  opacity={Math.sin(Math.PI * (upT as number)) * 0.95}
                />
              )}
              {/* Il fascicolo della rete: l'edizione che arriva lo accende. */}
              <rect x={CMP.docX(i)} y={CMP.docY} width={52} height={68} fill={C.card} stroke={C.hair} strokeWidth={1.5} />
              <rect
                x={CMP.docX(i) + 10}
                y={CMP.docY + 16}
                width={32}
                height={6}
                rx={3}
                fill={interpolateColors(arrivo, [0, 1], [C.barB, C.accent])}
              />
              <rect x={CMP.docX(i) + 10} y={CMP.docY + 32} width={26} height={6} rx={3} fill={C.barA} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
