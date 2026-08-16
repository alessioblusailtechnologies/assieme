import { AbsoluteFill, Img, staticFile } from 'remotion';

/** Tavola di confronto: le nuove vie del marchio Blusail. */

export const BOARD_W = 1400;
export const BOARD_H = 1240;

const VIE = [
  { via: 'tratto-punto', etichetta: 'D · tratto e punto' },
  { via: 'vento', etichetta: 'E · vento' },
  { via: 'archi', etichetta: 'F · archi' },
  { via: 'equilibrio', etichetta: 'G · equilibrio' },
];

export const LogoBoard: React.FC = () => (
  <AbsoluteFill style={{ background: '#FAF9F7', fontFamily: 'Georgia, serif' }}>
    {VIE.map((v, i) => (
      <div
        key={v.via}
        style={{
          position: 'absolute',
          left: 0,
          top: (BOARD_H / VIE.length) * i,
          width: BOARD_W,
          height: BOARD_H / VIE.length,
          display: 'flex',
          alignItems: 'center',
          gap: 80,
          padding: '0 70px',
          borderTop: i > 0 ? '1px solid #E4E2DD' : 'none',
        }}
      >
        <span style={{ width: 190, fontSize: 21, color: '#767268' }}>{v.etichetta}</span>
        <Img src={staticFile(`brand/blusail-${v.via}.svg`)} style={{ height: 105 }} />
        <Img src={staticFile(`brand/blusail-${v.via}-marchio.svg`)} style={{ height: 115 }} />
        <Img src={staticFile(`brand/blusail-${v.via}-app.svg`)} style={{ height: 125 }} />
      </div>
    ))}
  </AbsoluteFill>
);
