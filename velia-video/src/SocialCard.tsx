import { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  staticFile,
  useVideoConfig,
} from 'remotion';

/**
 * Card statica «La memoria resta» (rubrica Sotto il cofano): la chat del
 * FE con una risposta che nasce dalla casistica dell'agenzia, cartellino
 * Memoria in evidenza. Stessa lingua di SocialIg.tsx; due tagli, 4:5 per
 * il feed Instagram e 1:1 per Facebook e LinkedIn.
 */

export const CARD_IG_W = 1080;
export const CARD_IG_H = 1350;
export const CARD_QUAD_W = 1080;
export const CARD_QUAD_H = 1080;

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
  memoria: '#7C5A2F',
  memoriaFondo: '#F6EFE3',
};

const F = {
  interfaccia: "'TWKGhost', Georgia, serif",
  lettura: "'Geist', 'Helvetica Neue', sans-serif",
};

const TESTI = {
  kicker: 'Sotto il cofano',
  titolo: ['Quello che risolvete oggi,', 'domani lo sa già.'],
  domanda: 'Il cliente ha disdetto oltre i termini, come procedo?',
  risposta:
    'La compagnia accetta la disdetta tardiva se la nuova polizza si emette contestualmente: è la prassi concordata dall’agenzia a giugno.',
  provenienza: { chip: 'Memoria', testo: 'Caso risolto dall’agenzia il 12 giugno' },
  placeholder: 'Fai una domanda sui documenti, «@» per referenziarli',
  sito: 'sonovelia.it',
};

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

export const CardMemoria: React.FC = () => {
  useFonts();
  const { height } = useVideoConfig();

  /* Il taglio quadrato compatta testata, finestra e piede. */
  const quadrato = height <= 1080;
  const L = quadrato
    ? { testataTop: 64, kickerGap: 18, titolo: 56, cardTop: 318, piede: 58, corpo: 24, gap: 24, padV: 30 }
    : { testataTop: 100, kickerGap: 26, titolo: 66, cardTop: 442, piede: 92, corpo: 26, gap: 30, padV: 38 };

  const mono: React.CSSProperties = {
    fontFamily: F.interfaccia,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.text3,
  };

  return (
    <AbsoluteFill style={{ background: C.pageAlt, fontFamily: F.lettura }}>
      {/* Testata */}
      <div style={{ position: 'absolute', left: 84, top: L.testataTop, right: 84 }}>
        <div style={{ ...mono, fontSize: 22, letterSpacing: '0.2em', marginBottom: L.kickerGap }}>
          {TESTI.kicker}
        </div>
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

      {/* La scheda: un pezzo vero dell'applicativo */}
      <div
        style={{
          position: 'absolute',
          left: 84,
          top: L.cardTop,
          width: CARD_IG_W - 168,
          borderRadius: 16,
          background: C.surface,
          border: `1.5px solid ${C.line}`,
          boxShadow: '0 30px 70px rgba(28, 26, 21, 0.10)',
          overflow: 'hidden',
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

        {/* Il filo della conversazione */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: L.gap,
            padding: `${L.padV}px 36px ${L.padV + 6}px`,
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
              fontSize: L.corpo - 1,
              lineHeight: 1.5,
            }}
          >
            {TESTI.domanda}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              maxWidth: '92%',
              marginRight: 'auto',
              borderRadius: 12,
              padding: '24px 28px',
              background: C.surface,
              border: `1.5px solid ${C.line}`,
            }}
          >
            <div style={{ fontSize: L.corpo, lineHeight: 1.5, color: C.text }}>
              {TESTI.risposta}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                paddingTop: 18,
                borderTop: `1.5px solid ${C.lineSoft}`,
              }}
            >
              <span
                style={{
                  ...mono,
                  fontSize: 17,
                  letterSpacing: '0.08em',
                  padding: '4px 12px',
                  borderRadius: 6,
                  background: C.memoriaFondo,
                  color: C.memoria,
                  whiteSpace: 'nowrap',
                }}
              >
                {TESTI.provenienza.chip}
              </span>
              <span style={{ fontSize: L.corpo - 5, color: C.text3 }}>
                {TESTI.provenienza.testo}
              </span>
            </div>
          </div>

          {/* La barra di composizione */}
          <div
            style={{
              marginTop: 6,
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
    </AbsoluteFill>
  );
};
