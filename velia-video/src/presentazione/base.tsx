/**
 * La cornice della presentazione: token, caratteri e il telaio di ogni
 * diapositiva.
 *
 * Gli stessi token del sito e dell'applicativo, ripresi da MemoriaViva: una
 * presentazione che non somiglia al prodotto è una presentazione di un altro
 * prodotto.
 *
 * Il formato è 1920×1080. Remotion rende ogni diapositiva come PDF
 * vettoriale, quindi il testo resta testo: si seleziona, si cerca, e il file
 * pesa poco. Non è un'immagine di una slide, è una slide.
 */

import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile } from 'remotion';

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

export const C = {
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
  accentChiaro: '#7C93BE',
  pos: '#2E6B4F',
  neg: '#A63D2F',
  ink: '#1C1A15',
  inkRaise: '#24221C',
  lineOnInk: '#33302A',
  testoSuInk: '#F4F2EE',
  testoSuInk2: '#B9B5AB',
};

export const F = {
  /** TWK Ghost: la voce dei titoli, come nell'interfaccia. */
  interfaccia: "'TWKGhost', Georgia, serif",
  /** Geist: la voce di lettura. */
  lettura: "'Geist', 'Helvetica Neue', sans-serif",
};

export const mono: React.CSSProperties = {
  fontFamily: F.interfaccia,
  fontSize: 17,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: C.text3,
};

/**
 * I caratteri vanno caricati prima che Remotion fotografi la pagina, o la
 * diapositiva esce con il ripiego di sistema. `delayRender` tiene fermo lo
 * scatto finché non sono pronti.
 */
export const useFonts = () => {
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

/** Il marchio: lo stesso quadrato con la V dell'applicativo. */
export const Marchio: React.FC<{ size?: number; chiaro?: boolean }> = ({
  size = 44,
  chiaro = false,
}) => (
  <svg width={size} height={size} viewBox="0 0 28 28" style={{ borderRadius: size / 4 }}>
    <rect width="28" height="28" fill={chiaro ? C.testoSuInk : C.accent} />
    <text
      x="14"
      y="14"
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="Georgia, serif"
      fontSize="18"
      fill={chiaro ? C.accent : '#ffffff'}
    >
      V
    </text>
  </svg>
);

export type TonoDiapositiva = 'chiara' | 'alterna' | 'scura';

const fondi: Record<TonoDiapositiva, string> = {
  chiara: C.page,
  alterna: C.pageAlt,
  scura: C.ink,
};

/**
 * Il telaio comune: margini, occhiello, piè di pagina con marchio e numero.
 * La copertina e la chiusura passano `nuda` e si disegnano da sole.
 */
export const Diapositiva: React.FC<{
  tono?: TonoDiapositiva;
  occhiello?: string;
  numero?: number;
  totale?: number;
  nuda?: boolean;
  children: React.ReactNode;
}> = ({ tono = 'chiara', occhiello, numero, totale, nuda = false, children }) => {
  useFonts();
  const scura = tono === 'scura';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: fondi[tono],
        fontFamily: F.lettura,
        color: scura ? C.testoSuInk : C.text,
        padding: nuda ? 0 : '96px 120px 88px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {occhiello && (
        <p style={{ ...mono, color: scura ? C.testoSuInk2 : C.text3, margin: 0 }}>
          {occhiello}
        </p>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {children}
      </div>

      {!nuda && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 44,
            borderTop: `1px solid ${scura ? C.lineOnInk : C.line}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Marchio size={26} chiaro={scura} />
            <span
              style={{
                fontFamily: F.interfaccia,
                fontSize: 19,
                color: scura ? C.testoSuInk2 : C.text3,
              }}
            >
              Velia
            </span>
          </div>
          {numero && totale && (
            <span style={{ ...mono, fontSize: 15, color: scura ? C.testoSuInk2 : C.textMute }}>
              {String(numero).padStart(2, '0')} / {String(totale).padStart(2, '0')}
            </span>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Titolo grande, come i titoli di sezione del sito. */
export const Titolo: React.FC<{ children: React.ReactNode; scuro?: boolean; piccolo?: boolean }> = ({
  children,
  scuro = false,
  piccolo = false,
}) => (
  <h1
    style={{
      fontFamily: F.interfaccia,
      fontWeight: 400,
      fontSize: piccolo ? 54 : 68,
      lineHeight: 1.1,
      letterSpacing: '-0.015em',
      margin: '28px 0 0',
      maxWidth: '20ch',
      color: scuro ? C.testoSuInk : C.text,
    }}
  >
    {children}
  </h1>
);

/** Attacco sotto il titolo. */
export const Attacco: React.FC<{ children: React.ReactNode; scuro?: boolean }> = ({
  children,
  scuro = false,
}) => (
  <p
    style={{
      fontSize: 27,
      lineHeight: 1.5,
      margin: '26px 0 0',
      maxWidth: '62ch',
      color: scuro ? C.testoSuInk2 : C.text2,
    }}
  >
    {children}
  </p>
);
