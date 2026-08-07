import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Easing,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { GRAPH_H, GRAPH_W, buildGraph, drawGraph } from './graph';

export const WIDTH = 1080;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION = 655;

/* ---------------------------------------------------------------------------
 * Token del FE (fe-angular/src/styles/_tokens.scss).
 * ------------------------------------------------------------------------ */
const C = {
  page: '#FAF9F7',
  pageAlt: '#EEEDEA',
  surface: '#FFFFFF',
  line: '#E4E2DD',
  lineSoft: '#EEEDEA',
  text: '#1C1A15',
  text2: '#45423A',
  text3: '#767268',
  textMute: '#9B978B',
  accent: '#2F4B7C',
  pos: '#2E6B4F',
  neg: '#A63D2F',
  provMemoria: '#7C5A2F',
  warm: '#B0733F',
};

const F = {
  interfaccia: "'TWKGhost', Georgia, serif",
  lettura: "'Geist', 'Helvetica Neue', sans-serif",
};

/* ---------------------------------------------------------------------------
 * Regia (fotogrammi a 30 fps).
 * ------------------------------------------------------------------------ */
const T = {
  user1: 20,
  wait1: [60, 105] as const,
  stream1: [105, 148] as const,
  tavola: 150,
  scorri: [204, 228] as const,
  sintesi: 240,
  fonti: 268,
  user2: 300,
  wait2: [335, 362] as const,
  stream2: [362, 420] as const,
  salva: 432,
  /* Il risucchio: l'interfaccia vola dentro il pallino, pezzo per pezzo. */
  suck: 478,
  chatVia: [496, 516] as const, // le superfici residue sfumano
  build: [515, 560] as const, // il grafo chiaro si assembla attorno
  fly: [566, 592] as const,
  land: 592,
};

/* Geometria del guscio applicativo: barra laterale compressa, solo icone. */
const SIDEBAR_W = 68;
const TOPBAR_H = 64;
const THREAD = { x: 128, w: 856, top: TOPBAR_H + 40 };
const GRAPH_BOX = { x: 130, y: 148, w: 820, h: 789 };
const TARGET = { nx: 0.55, ny: 0.42 };
const TARGET_PX = {
  x: GRAPH_BOX.x + TARGET.nx * GRAPH_BOX.w,
  y: GRAPH_BOX.y + TARGET.ny * GRAPH_BOX.h,
};
/** Il pallino nasce al centro del quadro: la camera è sui puntini. */
const SPAWN = { x: 540, y: 540 };

/* L'attrattore del risucchio: i puntini di «Sto salvando in memoria…».
 * In coordinate contenuto (filo) e, dopo lo scroll, in coordinate app. */
const ATTR_CONTENT = { x: 166, y: 1220 };
const SCROLL_FINALE = 480;
const ATTR_APP = { x: ATTR_CONTENT.x, y: ATTR_CONTENT.y + THREAD.top - SCROLL_FINALE };

const SCROLL_T = [0, T.scorri[0], T.scorri[1], 332, 352];
const SCROLL_Y = [0, 0, 410, 410, SCROLL_FINALE];

const CAM_T = [0, 20, 44, 62, 92, 148, 175, 204, 240, 265, 285, 305, 332, 365, 430, 445, 472];
const CAM_X = [540, 540, 680, 680, 440, 440, 540, 540, 540, 460, 460, 680, 680, 440, 440, 166, 166];
const CAM_Y = [540, 540, 180, 180, 380, 380, 540, 540, 540, 560, 560, 630, 630, 750, 820, 844, 844];
const CAM_Z = [1, 1, 1.35, 1.35, 1.25, 1.25, 1.02, 1.02, 1.02, 1.25, 1.25, 1.35, 1.35, 1.28, 1.5, 1.5, 1.5];

const TESTI = {
  user1: 'Confronta il preventivo Unipol con la polizza auto del cliente Rossi.',
  riferimenti: ['preventivo_unipol.pdf', 'polizza_autopiu_cga.pdf'],
  attesa: 'Sto leggendo i documenti…',
  intro: 'Ho confrontato le 54 garanzie del fascicolo. Ecco il quadro, garanzia per garanzia:',
  sintesi:
    '9 differenze rilevanti su 54 garanzie. Il preventivo non copre gli infortuni del conducente, che la polizza attuale include: la segnalo come carenza?',
  citazioni: [
    { titolo: 'CGA Active Veicoli AUTOPIÙ', pos: 'ART. 12 · P. 34' },
    { titolo: 'Preventivo Unipol', pos: 'SEZ. 3 · P. 2' },
  ],
  user2:
    'No: gli infortuni del conducente li copriamo sempre con una polizza dedicata. Non è una carenza.',
  velia2: 'Capito: per la tua agenzia non la segnalerò più come carenza.',
  salva: 'Sto salvando in memoria…',
  placeholder: 'Fai una domanda sui documenti — «@» per referenziarli',
};

type Tono = 'pos' | 'neg' | undefined;
const TABELLA: { label: string; a: string; b: string; tono?: Tono }[] = [
  { label: 'Massimale RCA', a: '€ 6.450.000', b: '€ 25.000.000', tono: 'pos' },
  { label: 'Franchigia kasko', a: '€ 500', b: '€ 750' },
  { label: 'Scoperto atti vandalici', a: '10%', b: '15%', tono: 'neg' },
  { label: 'Infortuni del conducente', a: 'Inclusa', b: 'Non prevista', tono: 'neg' },
  { label: 'Cristalli', a: '€ 1.000', b: '€ 800', tono: 'neg' },
  { label: 'Eventi naturali', a: 'Inclusa', b: 'Inclusa' },
  { label: 'Furto e incendio', a: 'Valore a nuovo', b: 'Valore commerciale', tono: 'neg' },
  { label: 'Assistenza stradale', a: 'Base', b: 'Estesa', tono: 'pos' },
  { label: 'Tutela legale', a: '€ 10.000', b: '€ 15.000', tono: 'pos' },
  { label: 'Rinuncia alla rivalsa', a: 'Inclusa', b: 'Non prevista', tono: 'neg' },
  { label: 'Veicolo sostitutivo', a: 'Non previsto', b: 'Incluso', tono: 'pos' },
  { label: 'Bonus protetto', a: 'Incluso', b: 'Incluso' },
];

/* La navigazione vera (layout/navigazione.ts). */
const NAV: { gruppo: string; voci: { nome: string; attiva?: boolean }[] }[] = [
  { gruppo: 'Lavoro', voci: [{ nome: 'Chat', attiva: true }, { nome: 'Tabelle di analisi' }] },
  { gruppo: 'Archivi', voci: [{ nome: 'Archivio pubblico' }, { nome: 'Archivio privato' }] },
  { gruppo: 'Automazione', voci: [{ nome: 'Agenti' }] },
  { gruppo: 'Agenzia', voci: [{ nome: 'Memoria' }, { nome: 'Impostazioni' }] },
];

const IconaDoc: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M4 1.5h5.2L13 5.3V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V1.5Z"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path d="M9 1.5V5.5H13" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const IconaAllega: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M20 11.5 12.6 19a5 5 0 0 1-7.1-7.1l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.2-7.2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const IconaInvia: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M4 12 20 4l-4.5 16-4-6.5L4 12Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

/* Glifo di navigazione minimale: un quadratino stondato al tratto basta a
 * suggerire l'icona senza pretendere di replicarla. */
const IconaNav: React.FC<{ tipo: string }> = ({ tipo }) => {
  const s = 17;
  const k = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' } as const;
  switch (tipo) {
    case 'Chat':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M2 3.5h12v7.5H6L3 13.5v-2.5H2z" {...k} strokeLinejoin="round" />
        </svg>
      );
    case 'Tabelle di analisi':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" {...k} />
          <path d="M2 6.5h12M6.5 3v10" {...k} />
        </svg>
      );
    case 'Agenti':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5.5" {...k} />
          <path d="M8 2.5V0.8M5.8 6.8h.01M10.2 6.8h.01M5.5 10a3.4 3.4 0 0 0 5 0" {...k} strokeLinecap="round" />
        </svg>
      );
    case 'Memoria':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="5" cy="5" r="1.6" fill="currentColor" />
          <circle cx="11.5" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="11.5" r="1.2" fill="currentColor" />
          <path d="M6 6l4.5 1M6 6l.8 4.3M11 8l-3.4 3" {...k} strokeWidth="0.9" />
        </svg>
      );
    case 'Impostazioni':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="2.2" {...k} />
          <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4" {...k} strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...k} />
          <path d="M5.5 6h5M5.5 9h5" {...k} strokeLinecap="round" />
        </svg>
      );
  }
};

export const MemoriaViva: React.FC = () => {
  const frame = useCurrentFrame();

  const [fontHandle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all([
      new FontFace('Geist', `url(${staticFile('fonts/GeistVF.woff2')})`, {
        weight: '100 900',
      }).load(),
      new FontFace('TWKGhost', `url(${staticFile('fonts/TWKGhost-Regular.woff2')})`, {
        weight: '400',
      }).load(),
      new FontFace('TWKGhost', `url(${staticFile('fonts/TWKGhost-Medium.woff2')})`, {
        weight: '500',
      }).load(),
    ]).then((fonts) => {
      for (const f of fonts) document.fonts.add(f);
      continueRender(fontHandle);
    });
  }, [fontHandle]);

  const clamp = {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  } as const;

  const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) };
  const camX = interpolate(frame, CAM_T, CAM_X, ease);
  const camY = interpolate(frame, CAM_T, CAM_Y, ease);
  const camZ = interpolate(frame, CAM_T, CAM_Z, ease);
  const camTransform = `translate(${540 - camZ * camX}px, ${540 - camZ * camY}px) scale(${camZ})`;
  const scrollY = interpolate(frame, SCROLL_T, SCROLL_Y, ease);

  const stream = (full: string, range: readonly [number, number]) => {
    const p = interpolate(frame, [range[0], range[1]], [0, 1], clamp);
    return {
      shown: full.slice(0, Math.floor(full.length * p)),
      inCorso: frame >= range[0] && frame < range[1],
    };
  };

  const s1 = stream(TESTI.intro, T.stream1);
  const s2 = stream(TESTI.velia2, T.stream2);
  const attesa1 = frame >= T.wait1[0] && frame < T.wait1[1];
  const attesa2 = frame >= T.wait2[0] && frame < T.wait2[1];

  const appear = (at: number) => {
    const s = spring({ frame: frame - at, fps: FPS, config: { damping: 200 } });
    return {
      opacity: frame < at ? 0 : s,
      transform: `translateY(${(1 - s) * 12}px)`,
    };
  };

  /* --- Il risucchio: ogni pezzo dell'interfaccia vola nell'attrattore ---
   * `centro` è il baricentro stimato dell'elemento, `attr` l'attrattore,
   * entrambi nello stesso sistema di coordinate dell'elemento. */
  const succhia = (
    centro: { x: number; y: number },
    attr: { x: number; y: number },
    ritardo: number,
  ): React.CSSProperties => {
    const f0 = T.suck + ritardo;
    if (frame < f0) return {};
    const p = interpolate(frame, [f0, f0 + 20], [0, 1], {
      ...clamp,
      easing: Easing.in(Easing.cubic),
    });
    return {
      transform: `translate(${(attr.x - centro.x) * p}px, ${(attr.y - centro.y) * p}px) scale(${Math.max(0.02, 1 - p * 0.98)}) rotate(${p * -6}deg)`,
      opacity: 1 - Math.pow(p, 4) * 0.55,
    };
  };

  const chatOpacity = interpolate(frame, [T.chatVia[0], T.chatVia[1]], [1, 0], clamp);
  const chatVisible = frame < T.chatVia[1];

  const build = interpolate(frame, [T.build[0], T.build[1]], [0, 1], clamp);
  const graphVisible = frame >= T.build[0];
  const graphOpacity = interpolate(frame, [T.build[0], T.build[0] + 12], [0, 1], clamp);
  const graphRot =
    interpolate(frame, [T.build[0], T.build[1]], [-5, 0], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    }) +
    /* Assemblato, continua a girare piano: un grado e mezzo al secondo. */
    Math.max(0, frame - T.build[1]) * 0.05;

  const model = useMemo(buildGraph, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const nodeProgress =
    frame < T.land
      ? 0
      : spring({
          frame: frame - T.land,
          fps: FPS,
          config: { damping: 11, stiffness: 130, mass: 0.7 },
        });

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawGraph(
      ctx,
      model,
      (frame / FPS) * 1.7, // deriva più viva: il grafo respira, non dorme
      {
        x: TARGET.nx * GRAPH_W,
        y: TARGET.ny * GRAPH_H,
        progress: nodeProgress,
        flashAge: (frame - T.land) / FPS,
      },
      build,
    );
  }, [frame, model, nodeProgress, build]);

  const graphScale =
    interpolate(frame, [T.build[0], T.build[1]], [1.06, 1], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    }) * interpolate(frame, [T.land - 4, T.land + 10, T.land + 50], [1, 1.015, 1], clamp);

  /* --- Il pallino: assorbe l'interfaccia, poi vola nel grafo --- */
  const dotVisible = frame >= T.suck && frame < T.land + 3;
  const flyP = interpolate(frame, [T.fly[0], T.fly[1]], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const bob = frame < T.fly[0] ? Math.sin((frame - T.suck) * 0.16) * 3 : 0;
  const dotX = SPAWN.x + (TARGET_PX.x - SPAWN.x) * flyP;
  const dotY = SPAWN.y + (TARGET_PX.y - SPAWN.y) * flyP - Math.sin(flyP * Math.PI) * 70 + bob;
  /* Cresce a ogni boccone: da 12 a 22 px lungo il risucchio. */
  const dotSize = interpolate(frame, [T.suck, T.suck + 40], [12, 22], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const dotPulse = 1 + 0.08 * Math.sin((frame - T.suck) * 0.55) * (frame < T.fly[0] ? 1 : 0);
  const dotOpacity =
    interpolate(frame, [T.suck, T.suck + 6], [0, 1], clamp) *
    interpolate(frame, [T.land - 1, T.land + 3], [1, 0], clamp);

  /* --- Stili dal FE --- */
  const bollaUtente: React.CSSProperties = {
    alignSelf: 'flex-end',
    maxWidth: '76%',
    borderRadius: 12,
    padding: '16px 22px',
    background: C.pageAlt,
    color: C.text,
    fontFamily: F.lettura,
    fontSize: 20,
    lineHeight: 1.5,
  };

  const bollaAssistente: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: '88%',
    marginRight: 'auto',
    borderRadius: 12,
    padding: '22px 26px',
    background: C.surface,
    border: `1.5px solid ${C.line}`,
  };

  const mono: React.CSSProperties = {
    fontFamily: F.interfaccia,
    fontSize: 15,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.text3,
  };

  const puntini = (tinta: string) =>
    [0, 1, 2].map((d) => (
      <span
        key={d}
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: tinta,
          opacity: 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(frame * 0.35 - d * 0.9)),
        }}
      />
    ));

  const cursore = (attivo: boolean) =>
    attivo && (
      <span
        style={{
          display: 'inline-block',
          width: 9,
          height: 21,
          marginLeft: 3,
          verticalAlign: 'text-bottom',
          background: C.accent,
          opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
        }}
      />
    );

  const tonoColore = (t: Tono) => (t === 'pos' ? C.pos : t === 'neg' ? C.neg : C.text);

  return (
    <AbsoluteFill style={{ backgroundColor: C.page }}>
      {/* ============ Il grafo chiaro: si assembla attorno al ricordo ====== */}
      {graphVisible && (
        <canvas
          ref={canvasRef}
          width={GRAPH_W}
          height={GRAPH_H}
          style={{
            position: 'absolute',
            left: GRAPH_BOX.x,
            top: GRAPH_BOX.y,
            width: GRAPH_BOX.w,
            height: GRAPH_BOX.h,
            opacity: graphOpacity,
            transform: `scale(${graphScale}) rotate(${graphRot}deg)`,
          }}
        />
      )}

      {/* ============ La piattaforma, ripresa dalla camera ================= */}
      {chatVisible && (
        <AbsoluteFill style={{ background: C.page, opacity: chatOpacity, overflow: 'hidden' }}>
          <AbsoluteFill style={{ transform: camTransform, transformOrigin: '0 0' }}>
            {/* Area di lavoro bianca, come nel FE (il contorno è avorio). */}
            <div
              style={{
                position: 'absolute',
                left: SIDEBAR_W,
                top: TOPBAR_H,
                right: 0,
                bottom: 0,
                background: C.surface,
              }}
            />

            {/* ---- Barra laterale compressa: il marchio e le sole icone ---- */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: SIDEBAR_W,
                height: HEIGHT,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: C.page,
                borderRight: `1.5px solid ${C.lineSoft}`,
                ...succhia({ x: 34, y: 540 }, ATTR_APP, 4),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: TOPBAR_H }}>
                <svg width={34} height={34} viewBox="0 0 28 28" style={{ borderRadius: 7 }}>
                  <rect width="28" height="28" fill={C.accent} />
                  <text
                    x="14"
                    y="14"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="Georgia, serif"
                    fontSize="18"
                    fill="#ffffff"
                  >
                    V
                  </text>
                </svg>
              </div>

              <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {NAV.flatMap((g) => g.voci).map((v) => (
                  <div
                    key={v.nome}
                    title={v.nome}
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 44,
                      height: 44,
                      borderRadius: 9,
                      background: v.attiva ? C.pageAlt : 'transparent',
                      color: v.attiva ? C.text : C.text3,
                    }}
                  >
                    <IconaNav tipo={v.nome} />
                  </div>
                ))}
              </div>
            </div>

            {/* ---- Barra superiore ---- */}
            <div
              style={{
                position: 'absolute',
                left: SIDEBAR_W,
                top: 0,
                right: 0,
                height: TOPBAR_H,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 22px',
                background: C.surface,
                borderBottom: `1.5px solid ${C.line}`,
                ...succhia({ x: 574, y: 32 }, ATTR_APP, 0),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: F.interfaccia, fontSize: 18, color: C.text }}>Ciao, sono Velia.</span>
                <span style={{ width: 1.5, height: 22, background: C.line }} />
                <span style={{ fontFamily: F.lettura, fontSize: 17, color: C.text2 }}>Agenzia Ferrero</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ ...mono, fontSize: 14, letterSpacing: '0.08em', textTransform: 'none' }}>
                  07/08/2026 18:12
                </span>
                <span style={{ width: 1.5, height: 22, background: C.line }} />
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: C.pageAlt,
                    color: C.text2,
                    fontFamily: F.lettura,
                    fontSize: 15,
                  }}
                >
                  M
                </span>
                <span style={{ fontFamily: F.lettura, fontSize: 15.5, color: C.text }}>m.ferrero</span>
                <span style={{ ...mono, fontSize: 12.5, letterSpacing: '0.12em' }}>Titolare</span>
              </div>
            </div>

            {/* ---- Filo dei messaggi ---- */}
            <div
              style={{
                position: 'absolute',
                left: THREAD.x,
                top: THREAD.top,
                width: THREAD.w,
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
                transform: `translateY(${-scrollY}px)`,
              }}
            >
              {frame >= T.user1 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: 10,
                    ...appear(T.user1),
                    ...succhia({ x: 620, y: 60 }, ATTR_CONTENT, 8),
                  }}
                >
                  <div style={bollaUtente}>{TESTI.user1}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {TESTI.riferimenti.map((r) => (
                      <span
                        key={r}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          padding: '4px 13px',
                          borderRadius: 999,
                          border: `1.5px solid ${C.line}`,
                          background: C.surface,
                          fontFamily: F.lettura,
                          fontSize: 15.5,
                          color: C.text3,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <IconaDoc size={14} />
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {frame >= T.wait1[0] && (
                <div
                  style={{
                    ...bollaAssistente,
                    ...appear(T.wait1[0]),
                    ...succhia({ x: 420, y: 520 }, ATTR_CONTENT, 12),
                  }}
                >
                  {attesa1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {puntini(C.textMute)}
                      <span style={{ marginLeft: 10, fontFamily: F.lettura, fontSize: 18, color: C.text3 }}>
                        {TESTI.attesa}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: F.lettura, fontSize: 20, lineHeight: 1.55, color: C.text }}>
                        {s1.shown}
                        {cursore(s1.inCorso)}
                      </div>

                      {frame >= T.tavola && (
                        <div style={{ border: `1.5px solid ${C.lineSoft}`, borderRadius: 8 }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.5fr 1fr 1fr',
                              gap: '0 16px',
                              padding: '11px 16px',
                              borderBottom: `1.5px solid ${C.line}`,
                              background: C.pageAlt,
                              borderRadius: '8px 8px 0 0',
                            }}
                          >
                            <span style={{ ...mono, fontSize: 13 }}>Garanzia</span>
                            <span style={{ ...mono, fontSize: 13 }}>Polizza attuale</span>
                            <span style={{ ...mono, fontSize: 13 }}>Preventivo</span>
                          </div>
                          {TABELLA.map((r, i) => {
                            const at = T.tavola + i * 3.5;
                            if (frame < at) return null;
                            const s = spring({ frame: frame - at, fps: FPS, config: { damping: 200 } });
                            return (
                              <div
                                key={r.label}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: '1.5fr 1fr 1fr',
                                  gap: '0 16px',
                                  padding: '12px 16px',
                                  borderTop: i > 0 ? `1px solid ${C.lineSoft}` : 'none',
                                  fontFamily: F.lettura,
                                  fontSize: 17,
                                  opacity: s,
                                  transform: `translateY(${(1 - s) * 8}px)`,
                                }}
                              >
                                <span style={{ color: C.text2 }}>{r.label}</span>
                                <span style={{ color: C.text }}>{r.a}</span>
                                <span style={{ color: tonoColore(r.tono) }}>{r.b}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {frame >= T.sintesi && (
                        <div
                          style={{
                            fontFamily: F.lettura,
                            fontSize: 20,
                            lineHeight: 1.55,
                            color: C.text,
                            ...appear(T.sintesi),
                          }}
                        >
                          {TESTI.sintesi}
                        </div>
                      )}

                      {frame >= T.fonti && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            paddingTop: 13,
                            borderTop: `1.5px solid ${C.lineSoft}`,
                            flexWrap: 'wrap',
                            ...appear(T.fonti),
                          }}
                        >
                          <span style={mono}>Fonti</span>
                          {TESTI.citazioni.map((c) => (
                            <span
                              key={c.titolo}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '4px 13px',
                                border: `1.5px solid ${C.line}`,
                                borderRadius: 999,
                                background: C.surface,
                                fontFamily: F.lettura,
                                fontSize: 15.5,
                                color: C.text2,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.titolo}
                              <span
                                style={{ ...mono, fontSize: 13, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}
                              >
                                {c.pos}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {frame >= T.user2 && (
                <div style={{ ...bollaUtente, ...appear(T.user2), ...succhia({ x: 700, y: 1006 }, ATTR_CONTENT, 16) }}>
                  {TESTI.user2}
                </div>
              )}

              {frame >= T.wait2[0] && (
                <div
                  style={{
                    ...bollaAssistente,
                    ...appear(T.wait2[0]),
                    ...succhia({ x: 400, y: 1130 }, ATTR_CONTENT, 22),
                  }}
                >
                  {attesa2 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{puntini(C.textMute)}</div>
                  ) : (
                    <>
                      <div style={{ fontFamily: F.lettura, fontSize: 20, lineHeight: 1.55, color: C.text }}>
                        {s2.shown}
                        {cursore(s2.inCorso)}
                      </div>
                      {frame >= T.salva && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...appear(T.salva) }}>
                          {puntini(C.provMemoria)}
                          <span
                            style={{ marginLeft: 10, fontFamily: F.lettura, fontSize: 18, color: C.provMemoria }}
                          >
                            {TESTI.salva}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ---- Composer ---- */}
            <div
              style={{
                position: 'absolute',
                left: THREAD.x,
                width: THREAD.w,
                top: 966,
                ...succhia({ x: 556, y: 994 }, ATTR_APP, 10),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderRadius: 12,
                  padding: 10,
                  background: C.surface,
                  border: `1.5px solid ${C.line}`,
                }}
              >
                <span style={{ display: 'inline-flex', padding: 8, color: C.text3 }}>
                  <IconaAllega size={22} />
                </span>
                <span
                  style={{ display: 'inline-flex', padding: 8, color: C.text3, fontFamily: F.lettura, fontSize: 22 }}
                >
                  @
                </span>
                <span style={{ flex: 1, padding: '8px 4px', fontFamily: F.lettura, fontSize: 19, color: C.textMute }}>
                  {TESTI.placeholder}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: 9,
                    background: C.accent,
                    color: '#fff',
                  }}
                >
                  <IconaInvia size={22} />
                </span>
              </div>
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      )}

      {/* ============ Il ricordo: assorbe tutto, poi trova il suo posto ==== */}
      {dotVisible && (
        <div
          style={{
            position: 'absolute',
            left: dotX - (dotSize * dotPulse) / 2,
            top: dotY - (dotSize * dotPulse) / 2,
            width: dotSize * dotPulse,
            height: dotSize * dotPulse,
            borderRadius: 999,
            background: C.warm,
            boxShadow: `0 0 26px 8px rgba(176,115,63,0.35)`,
            opacity: dotOpacity,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
