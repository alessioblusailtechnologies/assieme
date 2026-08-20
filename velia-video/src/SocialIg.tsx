import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

/**
 * Post social «La fonte, sempre». Stessa lingua del FE (token di
 * fe-angular/src/styles/_tokens.scss) e della chat di MemoriaViva: una
 * domanda vera, la risposta che scorre, la fonte che arriva alla fine.
 * Due tagli dallo stesso sorgente: 4:5 per il feed Instagram, 1:1 per
 * Facebook e LinkedIn (il quadrato delle card già in social/contenuti).
 */

export const IG_W = 1080;
export const IG_H = 1350;
export const QUAD_W = 1080;
export const QUAD_H = 1080;
export const IG_FPS = 30;
export const IG_FONTE_DUR = 480;

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
  accentSoft: '#E9EEF6',
};

const F = {
  interfaccia: "'TWKGhost', Georgia, serif",
  lettura: "'Geist', 'Helvetica Neue', sans-serif",
};

const TESTI = {
  kicker: 'La fonte, sempre',
  firma: 'sono Velia.',
  titolo: ['Ogni risposta', 'arriva con la fonte.'],
  domanda: 'La kasko del cliente copre gli atti vandalici?',
  risposta: 'Sì, con scoperto del 10% e un minimo di 500 euro per sinistro.',
  citazione: { titolo: 'CGA Active Veicoli AUTOPIÙ', pos: 'ART. 12 · P. 34' },
  placeholder: 'Fai una domanda sui documenti, «@» per referenziarli',
  sito: 'sonovelia.it',
};

/* Regia (fotogrammi a 30 fps). */
const T = {
  titolo: 8,
  domanda: 28,
  attesa: [72, 104] as const,
  stream: [104, 178] as const,
  fonte: 196,
  pulsa: 224,
  /* La coda: la scena si ritira e la V arriva da sola, al centro. Un
   * guizzo, poi plana verso sinistra distribuendo «sono Velia.» in
   * cascata, come se le lettere uscissero da lei. */
  via: [300, 318] as const,
  logo: 314,
  gioca: 342,
  scivola: 358,
  cascata: 362,
};

/** Fotogrammi tra una lettera e la successiva della cascata. */
const CASC_PASSO = 2.5;

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
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
      continueRender(handle);
    });
  }, [handle]);
};

const LogoV: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" style={{ borderRadius: size * 0.21 }}>
    <rect width="28" height="28" fill={C.accent} />
    <text
      x="14"
      y="14"
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="Georgia, serif"
      fontSize="18"
      fill="#fff"
    >
      V
    </text>
  </svg>
);

export const IgFonte: React.FC<{ musica?: string }> = ({ musica = 'audio/musica.mp3' }) => {
  useFonts();
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  /* Il taglio quadrato compatta testata, finestra e piede; la regia
   * resta identica. */
  const quadrato = height <= 1080;
  const L = quadrato
    ? { testataTop: 60, kickerGap: 18, titolo: 58, cardTop: 300, chatH: 500, piede: 56 }
    : { testataTop: 92, kickerGap: 26, titolo: 68, cardTop: 380, chatH: 580, piede: 88 };

  const mono: React.CSSProperties = {
    fontFamily: F.interfaccia,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.text3,
  };

  const appear = (at: number) => {
    const s = spring({ frame: frame - at, fps: IG_FPS, config: { damping: 200 } });
    return {
      opacity: frame < at ? 0 : s,
      transform: `translateY(${(1 - s) * 14}px)`,
    };
  };

  const streamP = interpolate(frame, [T.stream[0], T.stream[1]], [0, 1], clamp);
  const shown = TESTI.risposta.slice(0, Math.floor(TESTI.risposta.length * streamP));
  const inAttesa = frame >= T.attesa[0] && frame < T.attesa[1];
  const inStream = frame >= T.stream[0] && frame < T.stream[1];

  const puntini = [0, 1, 2].map((d) => (
    <span
      key={d}
      style={{
        width: 9,
        height: 9,
        borderRadius: 999,
        background: C.textMute,
        opacity: 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(frame * 0.35 - d * 0.9)),
      }}
    />
  ));

  const cursore = inStream && (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 26,
        marginLeft: 4,
        verticalAlign: 'text-bottom',
        background: C.accent,
        opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
      }}
    />
  );

  /* Il riferimento di pagina si accende un attimo dopo il cartellino:
   * è lui la promessa del post. */
  const pulsa = interpolate(frame, [T.pulsa, T.pulsa + 9, T.pulsa + 22], [0, 1, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });

  /* Respiro: la scheda cresce di un soffio lungo tutto il video. */
  const respiro = interpolate(frame, [0, T.via[0]], [1, 1.022], clamp);

  /* La coda: la scena si ritira con un velo, la firma prende il quadro. */
  const scenaOpacity = interpolate(frame, [T.via[0], T.via[1]], [1, 0], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const scenaScale = interpolate(frame, [T.via[0], T.via[1]], [1, 0.985], {
    ...clamp,
    easing: Easing.inOut(Easing.quad),
  });
  const logoS = spring({ frame: frame - T.logo, fps: IG_FPS, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  /* Il guizzo: un'oscillazione che si spegne, come un cenno. */
  const g = frame - T.gioca;
  const giocaRot = g >= 0 ? Math.sin(g * 0.5) * 8 * Math.exp(-g * 0.11) : 0;
  const giocaScala = g >= 0 ? 1 + Math.sin(Math.min(g * 0.35, Math.PI)) * 0.07 : 1;
  /* La planata: prima la V sta al centro del quadro (il blocco è spostato
   * a destra di metà firma), poi scivola al suo posto nel lockup. */
  const scivolaS = spring({ frame: frame - T.scivola, fps: IG_FPS, config: { damping: 19, stiffness: 75 } });
  const scivolaX = 218 * (1 - scivolaS);

  return (
    <AbsoluteFill style={{ background: C.pageAlt, fontFamily: F.lettura }}>
      {/* Il suono: un letto musicale presente ma discreto, gli eventi
       * dell'app, il jingle sulla firma. Tutto ElevenLabs, in
       * public/audio/. La musica si abbassa quando entra il jingle. */}
      <Audio
        src={staticFile(musica)}
        loop
        volume={(f) =>
          interpolate(
            f,
            [0, 18, T.via[0] - 8, T.logo + 16, IG_FONTE_DUR - 40, IG_FONTE_DUR - 6],
            [0, 0.38, 0.38, 0.1, 0.1, 0],
            clamp,
          )
        }
      />
      <Sequence from={T.domanda - 2}>
        <Audio src={staticFile('audio/pop.mp3')} volume={0.55} />
      </Sequence>
      <Sequence from={T.stream[0]} durationInFrames={84}>
        <Audio
          src={staticFile('audio/battitura.mp3')}
          volume={(f) => interpolate(f, [0, 6, 66, 80], [0, 0.3, 0.3, 0], clamp)}
        />
      </Sequence>
      <Sequence from={T.fonte}>
        <Audio src={staticFile('audio/tocco.mp3')} volume={0.5} />
      </Sequence>
      {/* Il jingle vero e proprio (7s, fornito): entra sottovoce sulla
       * transizione, in dissolvenza incrociata con la musica, e cresce
       * fino al pieno verso il finale. */}
      <Sequence from={T.via[0] - 4}>
        <Audio
          src={staticFile('audio/jingle.mp3')}
          volume={(f) => interpolate(f, [0, 14, 100, 165, 182], [0, 0.22, 0.55, 0.95, 0], clamp)}
        />
      </Sequence>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: scenaOpacity,
          transform: `scale(${scenaScale})`,
          transformOrigin: '50% 46%',
        }}
      >
      {/* Testata */}
      <div style={{ position: 'absolute', left: 84, top: L.testataTop, right: 84 }}>
        <div style={{ ...mono, fontSize: 22, letterSpacing: '0.2em', marginBottom: L.kickerGap }}>
          {TESTI.kicker}
        </div>
        <div style={{ ...appear(T.titolo) }}>
          {TESTI.titolo.map((r) => (
            <div
              key={r}
              style={{
                fontFamily: F.interfaccia,
                fontWeight: 500,
                fontSize: L.titolo,
                lineHeight: 1.14,
                letterSpacing: '-0.012em',
                color: C.text,
              }}
            >
              {r}
            </div>
          ))}
        </div>
      </div>

      {/* La scheda: un pezzo vero dell'applicativo */}
      <div
        style={{
          position: 'absolute',
          left: 84,
          top: L.cardTop,
          width: IG_W - 168,
          borderRadius: 16,
          background: C.surface,
          border: `1.5px solid ${C.line}`,
          boxShadow: '0 30px 70px rgba(28, 26, 21, 0.10)',
          overflow: 'hidden',
          transform: `scale(${respiro})`,
          transformOrigin: '50% 40%',
        }}
      >
        {/* Barra della finestra */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            height: 68,
            padding: '0 28px',
            borderBottom: `1px solid ${C.lineSoft}`,
          }}
        >
          <LogoV size={28} />
          <span style={{ fontFamily: F.interfaccia, fontSize: 22, color: C.text }}>
            Ciao, sono Velia.
          </span>
          <span style={{ width: 1, height: 24, background: C.line }} />
          <span style={{ fontSize: 20, color: C.text2 }}>Agenzia Ferrero</span>
        </div>

        {/* Il filo della conversazione. Altezza ferma: la finestra non
         * cresce col contenuto, come una finestra vera. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 30,
            padding: '38px 36px 44px',
            height: L.chatH,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              alignSelf: 'flex-end',
              maxWidth: '74%',
              borderRadius: 12,
              padding: '18px 24px',
              background: C.pageAlt,
              color: C.text,
              fontSize: 25,
              lineHeight: 1.5,
              ...appear(T.domanda),
            }}
          >
            {TESTI.domanda}
          </div>

          {frame >= T.attesa[0] && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                maxWidth: '88%',
                marginRight: 'auto',
                borderRadius: 12,
                padding: '24px 28px',
                background: C.surface,
                border: `1.5px solid ${C.line}`,
                minHeight: 96,
                ...appear(T.attesa[0]),
              }}
            >
              {inAttesa ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 40 }}>
                  {puntini}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 26, lineHeight: 1.5, color: C.text }}>
                    {shown}
                    {cursore}
                  </div>
                  {frame >= T.fonte && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        paddingTop: 18,
                        borderTop: `1.5px solid ${C.lineSoft}`,
                        flexWrap: 'wrap',
                        ...appear(T.fonte),
                      }}
                    >
                      <span style={{ ...mono, fontSize: 16, letterSpacing: '0.14em' }}>Fonti</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '7px 18px',
                          border: `1.5px solid ${C.line}`,
                          borderRadius: 999,
                          background: C.surface,
                          fontSize: 20,
                          color: C.text2,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {TESTI.citazione.titolo}
                        <span
                          style={{
                            ...mono,
                            fontSize: 17,
                            letterSpacing: '0.08em',
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: `rgba(233, 238, 246, ${pulsa})`,
                            color: pulsa > 0.4 ? C.accent : C.text3,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {TESTI.citazione.pos}
                        </span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* La barra di composizione, ancorata in fondo alla finestra */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 24px',
              borderRadius: 12,
              border: `1.5px solid ${C.line}`,
              background: C.page,
            }}
          >
            <span style={{ flex: 1, fontSize: 22, color: C.textMute }}>{TESTI.placeholder}</span>
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 44,
                height: 44,
                borderRadius: 10,
                background: C.accent,
                flex: 'none',
              }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <path d="M12 19V5M5 12l7-7 7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Piede */}
      <div
        style={{
          position: 'absolute',
          left: 84,
          right: 84,
          bottom: L.piede,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LogoV size={34} />
          <span style={{ fontFamily: F.interfaccia, fontSize: 24, color: C.text }}>Velia</span>
        </div>
        <span style={{ ...mono, fontSize: 19, letterSpacing: '0.12em', textTransform: 'none' }}>
          {TESTI.sito}
        </span>
      </div>
      </div>

      {/* La firma: il quadrato blu si posa, il nome lo raggiunge */}
      {frame >= T.logo && (
        <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `translateX(${scivolaX}px)` }}>
              <div
                style={{
                  transform: `scale(${logoS * giocaScala}) rotate(${giocaRot}deg)`,
                  opacity: Math.min(1, logoS * 1.4),
                }}
              >
                <svg width={108} height={108} viewBox="0 0 28 28" style={{ borderRadius: 14, display: 'block' }}>
                  <rect width="28" height="28" fill={C.accent} />
                  <text
                    x="14"
                    y="14"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontFamily="Georgia, serif"
                    fontSize="18"
                    fill="#fff"
                  >
                    V
                  </text>
                </svg>
              </div>
              <span
                style={{
                  fontFamily: F.interfaccia,
                  fontWeight: 500,
                  fontSize: 84,
                  letterSpacing: '-0.012em',
                  color: C.text,
                  whiteSpace: 'pre',
                }}
              >
                {/* La cascata: le lettere escono dalla V, una dopo l'altra,
                 * mentre lei plana verso sinistra. */}
                {TESTI.firma.split('').map((ch, i) => {
                  const via = T.cascata + i * CASC_PASSO;
                  const s = spring({
                    frame: frame - via,
                    fps: IG_FPS,
                    config: { damping: 15, stiffness: 90, mass: 0.9 },
                  });
                  return (
                    <span
                      key={i}
                      style={{
                        display: 'inline-block',
                        whiteSpace: 'pre',
                        opacity: frame < via ? 0 : Math.min(1, s * 1.3),
                        transform: `translate(${(1 - s) * -74}px, ${(1 - s) * -20}px)`,
                        filter: `blur(${Math.max(0, (1 - s) * 5)}px)`,
                      }}
                    >
                      {ch}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
