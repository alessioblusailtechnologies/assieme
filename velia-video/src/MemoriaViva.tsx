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
export const DURATION = 570;

/* ---------------------------------------------------------------------------
 * Token del FE (fe-angular/src/styles/_tokens.scss), scalati ×1.5 per stare
 * bene in un quadro 1080: il video è l'applicativo, non una sua imitazione.
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
  provMemoria: '#7C5A2F',
  provMemoriaSoft: '#F6EFE3',
  warm: '#D8A87E',
  oninverse: '#F5F1E8',
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
  wait1: [60, 110] as const,
  stream1: [110, 205] as const,
  fonti: 210,
  user2: 250,
  wait2: [300, 340] as const,
  stream2: [340, 395] as const,
  prov: 405,
  pulse: 420,
  fadeChat: [430, 460] as const,
  graphIn: [452, 482] as const,
  fly: [480, 507] as const,
  land: 507,
  caption: 519,
};

/* Geometria. */
const THREAD = { x: 150, w: 780, top: 132 };
const GRAPH_BOX = { x: 200, y: 150, w: 680, h: 654 };
const TARGET = { nx: 0.55, ny: 0.42 };
const TARGET_PX = {
  x: GRAPH_BOX.x + TARGET.nx * GRAPH_BOX.w,
  y: GRAPH_BOX.y + TARGET.ny * GRAPH_BOX.h,
};
/** Punto di partenza del ricordo: il centro del badge MEMORIA (verificato
 *  sui fotogrammi renderizzati). */
const DOT_START = { x: 240, y: 799 };

const TESTI = {
  user1: 'Confronta il preventivo Unipol con la polizza auto del cliente Rossi.',
  riferimenti: ['preventivo_unipol.pdf', 'polizza_autopiu_cga.pdf'],
  attesa: 'Sto leggendo i documenti…',
  velia1:
    'Ho confrontato le 54 garanzie: 9 differenze rilevanti. Il preventivo Unipol non copre gli infortuni del conducente, che la polizza attuale include. La segnalo come carenza?',
  citazioni: [
    { titolo: 'CGA Active Veicoli AUTOPIÙ', pos: 'ART. 12 · P. 34' },
    { titolo: 'Preventivo Unipol', pos: 'SEZ. 3 · P. 2' },
  ],
  user2:
    'No: gli infortuni del conducente li copriamo sempre con una polizza dedicata. Non è una carenza.',
  velia2: 'Capito: per la tua agenzia non la segnalerò più come carenza.',
  provenienza: 'Infortuni del conducente coperti a parte con polizza dedicata',
  placeholder: 'Fai una domanda sui documenti — «@» per referenziarli',
};

/* Piccole icone di interfaccia, ridisegnate al tratto. */
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

  /* --- Font dell'applicativo --- */
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

  /* --- Streaming del testo, con cursore finché scorre --- */
  const stream = (full: string, range: readonly [number, number]) => {
    const p = interpolate(frame, [range[0], range[1]], [0, 1], clamp);
    return { shown: full.slice(0, Math.floor(full.length * p)), inCorso: frame >= range[0] && frame < range[1] };
  };

  const s1 = stream(TESTI.velia1, T.stream1);
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

  /* --- Il badge MEMORIA pulsa prima di cedere il ricordo --- */
  const badgePulse = interpolate(frame, [T.pulse - 2, T.pulse + 8, T.pulse + 18], [1, 1.14, 1], clamp);

  /* --- La schermata chiara sfuma nel buio --- */
  const chatOpacity = interpolate(frame, [T.fadeChat[0], T.fadeChat[1]], [1, 0], clamp);
  const chatVisible = frame < T.fadeChat[1];

  /* --- Il grafo compare solo adesso --- */
  const graphOpacity = interpolate(frame, [T.graphIn[0], T.graphIn[1]], [0, 1], clamp);
  const graphInScale = interpolate(frame, [T.graphIn[0], T.graphIn[1]], [0.94, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const graphVisible = frame >= T.graphIn[0];

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
    drawGraph(ctx, model, frame / FPS, {
      x: TARGET.nx * GRAPH_W,
      y: TARGET.ny * GRAPH_H,
      progress: nodeProgress,
      flashAge: (frame - T.land) / FPS,
    });
  }, [frame, model, nodeProgress]);

  const graphGlow = interpolate(frame, [T.land - 4, T.land + 8, T.land + 45], [1, 1.2, 1], clamp);
  const graphScale = interpolate(frame, [T.land - 4, T.land + 10, T.land + 50], [1, 1.018, 1], clamp);

  /* --- Il pallino: nasce sul badge, aspetta nel buio, vola nel grafo --- */
  const dotVisible = frame >= T.pulse + 6 && frame < T.land + 3;
  const flyP = interpolate(frame, [T.fly[0], T.fly[1]], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const bob = frame < T.fly[0] ? Math.sin((frame - T.pulse) * 0.18) * 3 : 0;
  const dotX = DOT_START.x + (TARGET_PX.x - DOT_START.x) * flyP;
  const dotY =
    DOT_START.y + (TARGET_PX.y - DOT_START.y) * flyP - Math.sin(flyP * Math.PI) * 110 + bob;
  const dotColor = interpolateColors(frame, [T.fadeChat[0], T.graphIn[1]], [C.provMemoria, C.warm]);
  const dotSize = interpolate(frame, [T.pulse + 6, T.graphIn[1]], [13, 17], clamp);
  const dotOpacity = interpolate(frame, [T.land - 1, T.land + 3], [1, 0], clamp);

  const captionIn = spring({ frame: frame - T.caption, fps: FPS, config: { damping: 200 } });

  /* --- Stili ricorrenti, presi pari pari dal FE --- */
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

  const bollaAssistente: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxWidth: '85%',
    marginRight: 'auto',
    borderRadius: 12,
    padding: '24px 30px',
    background: C.surface,
    border: `1.5px solid ${C.lineSoft}`,
  };

  const mono: React.CSSProperties = {
    fontFamily: F.interfaccia,
    fontSize: 16,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.text3,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      {/* ================= Fase finale: il grafo, da solo nel buio ========= */}
      {graphVisible && (
        <>
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
              transform: `scale(${graphInScale * graphScale})`,
            }}
          />
          {frame >= T.caption && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 872,
                textAlign: 'center',
                fontFamily: F.interfaccia,
                fontWeight: 500,
                fontSize: 44,
                lineHeight: 1.22,
                letterSpacing: '-0.01em',
                color: C.oninverse,
                opacity: captionIn,
                transform: `translateY(${(1 - captionIn) * 16}px)`,
              }}
            >
              Spiegale come lavori.
              <br />
              Una volta sola.
            </div>
          )}
        </>
      )}

      {/* ================= Fase 1: la chat di Velia, a tutto schermo ======= */}
      {chatVisible && (
        <AbsoluteFill style={{ background: C.page, opacity: chatOpacity }}>
          {/* Testata della conversazione */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 92,
              padding: `0 ${THREAD.x}px`,
              borderBottom: `1.5px solid ${C.line}`,
            }}
          >
            <span
              style={{
                fontFamily: F.interfaccia,
                fontWeight: 500,
                fontSize: 33,
                letterSpacing: '-0.012em',
                color: C.text,
              }}
            >
              Rinnovo auto · cliente Rossi
            </span>
          </div>

          {/* Filo dei messaggi */}
          <div
            style={{
              position: 'absolute',
              left: THREAD.x,
              top: THREAD.top,
              width: THREAD.w,
              display: 'flex',
              flexDirection: 'column',
              gap: 26,
            }}
          >
            {/* Domanda 1, con i documenti referenziati */}
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
                      }}
                    >
                      <IconaDoc size={15} />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Risposta 1: attesa, streaming, fonti */}
            {frame >= T.wait1[0] && (
              <div style={{ ...bollaAssistente, ...appear(T.wait1[0]) }}>
                {attesa1 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        style={{
                          width: 7,
                          height: 7,
                          background: C.textMute,
                          opacity: 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(frame * 0.35 - d * 0.9)),
                        }}
                      />
                    ))}
                    <span style={{ marginLeft: 10, fontFamily: F.lettura, fontSize: 19, color: C.text3 }}>
                      {TESTI.attesa}
                    </span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontFamily: F.lettura, fontSize: 22, lineHeight: 1.6, color: C.text }}>
                      {s1.shown}
                      {s1.inCorso && (
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
                      )}
                    </div>
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
                            <span style={{ ...mono, fontSize: 14, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{c.pos}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Domanda 2: la preferenza dell'agenzia */}
            {frame >= T.user2 && <div style={{ ...bollaUtente, ...appear(T.user2) }}>{TESTI.user2}</div>}

            {/* Risposta 2: la conferma, con la provenienza MEMORIA */}
            {frame >= T.wait2[0] && (
              <div style={{ ...bollaAssistente, ...appear(T.wait2[0]) }}>
                {attesa2 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        style={{
                          width: 7,
                          height: 7,
                          background: C.textMute,
                          opacity: 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(frame * 0.35 - d * 0.9)),
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ fontFamily: F.lettura, fontSize: 22, lineHeight: 1.6, color: C.text }}>
                      {s2.shown}
                      {s2.inCorso && (
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
                      )}
                    </div>
                    {frame >= T.prov && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 12,
                          ...appear(T.prov),
                        }}
                      >
                        <span
                          style={{
                            ...mono,
                            fontSize: 15,
                            letterSpacing: '0.08em',
                            padding: '2px 10px',
                            background: C.provMemoriaSoft,
                            color: C.provMemoria,
                            transform: `scale(${badgePulse})`,
                            transformOrigin: 'left center',
                          }}
                        >
                          Memoria
                        </span>
                        <span style={{ fontFamily: F.lettura, fontSize: 18, color: C.text3 }}>
                          {TESTI.provenienza}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Composer, in fondo alla pagina come nel FE */}
          <div style={{ position: 'absolute', left: THREAD.x, width: THREAD.w, bottom: 56 }}>
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
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  fontFamily: F.lettura,
                  fontSize: 21,
                  color: C.textMute,
                }}
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
      )}

      {/* ================= Il ricordo: dal badge al grafo =================== */}
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
            boxShadow: `0 0 24px 7px rgba(216,168,126,${frame >= T.fadeChat[0] ? 0.5 : 0.25})`,
            opacity: dotOpacity,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
