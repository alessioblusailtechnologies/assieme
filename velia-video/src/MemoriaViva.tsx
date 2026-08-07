import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Easing,
  continueRender,
  delayRender,
  interpolate,
  interpolateColors,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import { GRAPH_H, GRAPH_W, buildGraph, drawGraph } from './graph';

export const WIDTH = 1080;
export const HEIGHT = 1080;
export const FPS = 30;
export const DURATION = 680;

/* ---------------------------------------------------------------------------
 * Token del FE (fe-angular/src/styles/_tokens.scss), scalati ×1.5.
 * ------------------------------------------------------------------------ */
const C = {
  ink: '#1C1A15',
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
  warm: '#D8A87E',
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
  stream1: [105, 148] as const, // l'introduzione della risposta
  tavola: 150, // le righe della tabella entrano in rapida successione
  scorri: [204, 228] as const, // lo scroll rapidissimo verso il fondo
  sintesi: 240,
  fonti: 268,
  user2: 300,
  wait2: [335, 362] as const,
  stream2: [362, 420] as const,
  salva: 432,
  iperzoom: [496, 524] as const, // la camera si tuffa nei puntini
  bloom: [502, 540] as const, // il bagliore caldo che inghiotte la chat
  fadeChat: [505, 522] as const,
  build: [515, 565] as const, // il grafo si assembla dal buio
  fly: [570, 600] as const,
  land: 600,
};

const THREAD = { x: 150, w: 780, top: 90 };
const GRAPH_BOX = { x: 200, y: 213, w: 680, h: 654 };
const TARGET = { nx: 0.55, ny: 0.42 };
const TARGET_PX = {
  x: GRAPH_BOX.x + TARGET.nx * GRAPH_BOX.w,
  y: GRAPH_BOX.y + TARGET.ny * GRAPH_BOX.h,
};
/** Il pallino nasce al centro del quadro: l'iperzoom ha portato lì i puntini. */
const SPAWN = { x: 540, y: 540 };

/* Lo scorrimento del filo: fermo, poi la corsa verso il fondo della tabella,
 * poi un altro passo quando la conversazione prosegue. */
const SCROLL_T = [0, T.scorri[0], T.scorri[1], 332, 352];
const SCROLL_Y = [0, 0, 620, 620, 760];

/* La camera: fuoco (x, y) nel quadro e zoom, per fotogrammi chiave. */
const CAM_T = [0, 20, 44, 62, 92, 148, 175, 204, 240, 265, 285, 305, 332, 365, 430, 445, 488, 496, 524];
const CAM_X = [540, 540, 655, 655, 470, 470, 540, 540, 540, 470, 470, 650, 650, 470, 470, 325, 325, 201, 201];
const CAM_Y = [430, 430, 150, 150, 350, 350, 540, 540, 540, 600, 600, 708, 708, 780, 800, 856, 856, 856, 856];
const CAM_Z = [1, 1, 1.35, 1.35, 1.25, 1.25, 1.05, 1.05, 1.05, 1.3, 1.3, 1.35, 1.35, 1.3, 1.3, 2.25, 2.25, 6, 6];

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

  /* --- Camera e scorrimento --- */
  const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) };
  const camX = interpolate(frame, CAM_T, CAM_X, ease);
  const camY = interpolate(frame, CAM_T, CAM_Y, ease);
  const camZ = interpolate(frame, CAM_T, CAM_Z, ease);
  const camTransform = `translate(${540 - camZ * camX}px, ${540 - camZ * camY}px) scale(${camZ})`;
  const scrollY = interpolate(frame, SCROLL_T, SCROLL_Y, ease);

  /* --- Streaming del testo --- */
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

  /* --- La transizione: bagliore, buio, e il grafo che si assembla --- */
  const chatOpacity = interpolate(frame, [T.fadeChat[0], T.fadeChat[1]], [1, 0], clamp);
  const chatVisible = frame < T.fadeChat[1];
  const bloomIn = interpolate(frame, [T.bloom[0], T.bloom[0] + 10], [0, 1], clamp);
  const bloomOut = interpolate(frame, [T.bloom[0] + 14, T.bloom[1]], [1, 0], clamp);
  const bloomOpacity = bloomIn * bloomOut;
  const bloomVisible = frame >= T.bloom[0] && frame < T.bloom[1];

  const build = interpolate(frame, [T.build[0], T.build[1]], [0, 1], clamp);
  const graphVisible = frame >= T.build[0];
  const graphOpacity = interpolate(frame, [T.build[0], T.build[0] + 12], [0, 1], clamp);
  const graphRot = interpolate(frame, [T.build[0], T.build[1]], [-5, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

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
      frame / FPS,
      {
        x: TARGET.nx * GRAPH_W,
        y: TARGET.ny * GRAPH_H,
        progress: nodeProgress,
        flashAge: (frame - T.land) / FPS,
      },
      build,
    );
  }, [frame, model, nodeProgress, build]);

  const graphGlow = interpolate(frame, [T.land - 4, T.land + 8, T.land + 45], [1, 1.2, 1], clamp);
  const graphScale =
    interpolate(frame, [T.build[0], T.build[1]], [1.06, 1], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    }) * interpolate(frame, [T.land - 4, T.land + 10, T.land + 50], [1, 1.018, 1], clamp);

  /* --- Il pallino: resta al centro dopo il tuffo, poi vola nel grafo --- */
  const dotVisible = frame >= T.fadeChat[0] && frame < T.land + 3;
  const flyP = interpolate(frame, [T.fly[0], T.fly[1]], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const bob = frame < T.fly[0] ? Math.sin((frame - T.fadeChat[0]) * 0.16) * 3 : 0;
  const dotX = SPAWN.x + (TARGET_PX.x - SPAWN.x) * flyP;
  const dotY = SPAWN.y + (TARGET_PX.y - SPAWN.y) * flyP - Math.sin(flyP * Math.PI) * 70 + bob;
  const dotColor = interpolateColors(frame, [T.fadeChat[0], T.build[0] + 10], [C.provMemoria, C.warm]);
  const dotSize = interpolate(frame, [T.fadeChat[0], T.build[0] + 10], [13, 17], clamp);
  const dotOpacity =
    interpolate(frame, [T.fadeChat[0], T.fadeChat[0] + 8], [0, 1], clamp) *
    interpolate(frame, [T.land - 1, T.land + 3], [1, 0], clamp);

  /* --- Stili dal FE --- */
  const bollaUtente: React.CSSProperties = {
    alignSelf: 'flex-end',
    maxWidth: '72%',
    borderRadius: 12,
    padding: '18px 24px',
    background: C.pageAlt,
    color: C.text,
    fontFamily: F.lettura,
    fontSize: 21,
    lineHeight: 1.5,
  };

  /* Il bordo è quello vero dell'app (.assistente usa la superficie bianca
     bordata); qui serve il token line pieno perché la compressione video
     mangerebbe il line-soft, quasi invisibile già in origine. */
  const bollaAssistente: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxWidth: '85%',
    marginRight: 'auto',
    borderRadius: 12,
    padding: '24px 30px',
    background: C.surface,
    border: `1.5px solid ${C.line}`,
  };

  const mono: React.CSSProperties = {
    fontFamily: F.interfaccia,
    fontSize: 16,
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
          width: 10,
          height: 22,
          marginLeft: 3,
          verticalAlign: 'text-bottom',
          background: C.accent,
          opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
        }}
      />
    );

  const tonoColore = (t: Tono) => (t === 'pos' ? C.pos : t === 'neg' ? C.neg : C.text);

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      {/* ============ Il grafo: si assembla dal buio, poi accoglie ========= */}
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
            filter: `brightness(${graphGlow})`,
            transform: `scale(${graphScale}) rotate(${graphRot}deg)`,
          }}
        />
      )}

      {/* ============ La chat, ripresa dalla camera ======================== */}
      {chatVisible && (
        <AbsoluteFill style={{ background: C.page, opacity: chatOpacity, overflow: 'hidden' }}>
          <AbsoluteFill style={{ transform: camTransform, transformOrigin: '0 0' }}>
            {/* Filo dei messaggi, con lo scorrimento del thread */}
            <div
              style={{
                position: 'absolute',
                left: THREAD.x,
                top: THREAD.top,
                width: THREAD.w,
                display: 'flex',
                flexDirection: 'column',
                gap: 26,
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
                          padding: '4px 14px',
                          borderRadius: 999,
                          border: `1.5px solid ${C.line}`,
                          background: C.surface,
                          fontFamily: F.lettura,
                          fontSize: 17,
                          color: C.text3,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <IconaDoc size={15} />
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {frame >= T.wait1[0] && (
                <div style={{ ...bollaAssistente, ...appear(T.wait1[0]) }}>
                  {attesa1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {puntini(C.textMute)}
                      <span style={{ marginLeft: 10, fontFamily: F.lettura, fontSize: 19, color: C.text3 }}>
                        {TESTI.attesa}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: F.lettura, fontSize: 22, lineHeight: 1.6, color: C.text }}>
                        {s1.shown}
                        {cursore(s1.inCorso)}
                      </div>

                      {/* La tabella di confronto: le righe entrano in rapida
                          successione, come un risultato che si impagina. */}
                      {frame >= T.tavola && (
                        <div style={{ border: `1.5px solid ${C.lineSoft}`, borderRadius: 8 }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.5fr 1fr 1fr',
                              gap: '0 18px',
                              padding: '12px 18px',
                              borderBottom: `1.5px solid ${C.line}`,
                              background: C.pageAlt,
                              borderRadius: '8px 8px 0 0',
                            }}
                          >
                            <span style={{ ...mono, fontSize: 14 }}>Garanzia</span>
                            <span style={{ ...mono, fontSize: 14 }}>Polizza attuale</span>
                            <span style={{ ...mono, fontSize: 14 }}>Preventivo</span>
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
                                  gap: '0 18px',
                                  padding: '13px 18px',
                                  borderTop: i > 0 ? `1px solid ${C.lineSoft}` : 'none',
                                  fontFamily: F.lettura,
                                  fontSize: 19,
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
                            fontSize: 22,
                            lineHeight: 1.6,
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
                            paddingTop: 14,
                            borderTop: `1.5px solid ${C.lineSoft}`,
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
                                padding: '5px 14px',
                                border: `1.5px solid ${C.line}`,
                                borderRadius: 999,
                                background: C.surface,
                                fontFamily: F.lettura,
                                fontSize: 17,
                                color: C.text2,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.titolo}
                              <span
                                style={{ ...mono, fontSize: 14, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}
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

              {frame >= T.user2 && <div style={{ ...bollaUtente, ...appear(T.user2) }}>{TESTI.user2}</div>}

              {frame >= T.wait2[0] && (
                <div style={{ ...bollaAssistente, ...appear(T.wait2[0]) }}>
                  {attesa2 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{puntini(C.textMute)}</div>
                  ) : (
                    <>
                      <div style={{ fontFamily: F.lettura, fontSize: 22, lineHeight: 1.6, color: C.text }}>
                        {s2.shown}
                        {cursore(s2.inCorso)}
                      </div>
                      {frame >= T.salva && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...appear(T.salva) }}>
                          {puntini(C.provMemoria)}
                          <span
                            style={{ marginLeft: 10, fontFamily: F.lettura, fontSize: 19, color: C.provMemoria }}
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

            {/* Composer fisso in fondo; si ritira quando la camera stringe. */}
            <div
              style={{
                position: 'absolute',
                left: THREAD.x,
                width: THREAD.w,
                top: 952,
                opacity: interpolate(frame, [T.salva + 10, T.salva + 40], [1, 0], clamp),
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 12,
                  padding: 12,
                  background: C.surface,
                  border: `1.5px solid ${C.line}`,
                }}
              >
                <span style={{ display: 'inline-flex', padding: 10, color: C.text3 }}>
                  <IconaAllega size={24} />
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    padding: 10,
                    color: C.text3,
                    fontFamily: F.lettura,
                    fontSize: 24,
                  }}
                >
                  @
                </span>
                <span
                  style={{ flex: 1, padding: '10px 4px', fontFamily: F.lettura, fontSize: 21, color: C.textMute }}
                >
                  {TESTI.placeholder}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 54,
                    height: 54,
                    borderRadius: 9,
                    background: C.accent,
                    color: '#fff',
                  }}
                >
                  <IconaInvia size={24} />
                </span>
              </div>
            </div>
          </AbsoluteFill>
        </AbsoluteFill>
      )}

      {/* ============ Il bagliore del tuffo nella memoria ================== */}
      {bloomVisible && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 50%, rgba(216,168,126,0.95) 0%, rgba(124,90,47,0.55) 34%, rgba(28,26,21,0) 68%)`,
            opacity: bloomOpacity,
          }}
        />
      )}

      {/* ============ Il ricordo: dal tuffo al grafo ======================= */}
      {dotVisible && (
        <div
          style={{
            position: 'absolute',
            left: dotX - dotSize / 2,
            top: dotY - dotSize / 2,
            width: dotSize,
            height: dotSize,
            borderRadius: 999,
            background: dotColor,
            boxShadow: `0 0 24px 7px rgba(216,168,126,0.5)`,
            opacity: dotOpacity,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
