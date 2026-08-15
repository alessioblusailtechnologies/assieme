import { AbsoluteFill, Img, staticFile } from 'remotion';

/** Tavola di confronto: le tre vie del marchio Blusail. */

export const BOARD_W = 1400;
export const BOARD_H = 1000;

const VIE = [
  { via: 'tratti', etichetta: 'A · tratti' },
  { via: 'vele', etichetta: 'B · vele piene' },
  { via: 'quarti', etichetta: 'C · quarti' },
];

export const LogoBoard: React.FC = () => (
  <AbsoluteFill style={{ background: '#FAF9F7', fontFamily: 'Georgia, serif' }}>
    {VIE.map((v, i) => (
      <div
        key={v.via}
        style={{
          position: 'absolute',
          left: 0,
          top: (BOARD_H / 3) * i,
          width: BOARD_W,
          height: BOARD_H / 3,
          display: 'flex',
          alignItems: 'center',
          gap: 90,
          padding: '0 80px',
          borderTop: i > 0 ? '1px solid #E4E2DD' : 'none',
        }}
      >
        <span style={{ width: 150, fontSize: 21, color: '#767268' }}>{v.etichetta}</span>
        <Img src={staticFile(`brand/blusail-${v.via}.svg`)} style={{ height: 110 }} />
        <Img src={staticFile(`brand/blusail-${v.via}-marchio.svg`)} style={{ height: 120 }} />
        <Img src={staticFile(`brand/blusail-${v.via}-app.svg`)} style={{ height: 130 }} />
      </div>
    ))}
  </AbsoluteFill>
);
