import { AbsoluteFill, Img, staticFile } from 'remotion';

/** Tavola di verifica del logo Blusail: le varianti su chiaro e su scuro. */

export const BOARD_W = 1400;
export const BOARD_H = 1000;

export const LogoBoard: React.FC = () => (
  <AbsoluteFill style={{ background: '#FAF9F7' }}>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: BOARD_W,
        height: 560,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
      }}
    >
      <Img src={staticFile('brand/blusail-logo.svg')} style={{ height: 130 }} />
      <Img src={staticFile('brand/blusail-logo-verticale.svg')} style={{ height: 230 }} />
      <Img src={staticFile('brand/blusail-marchio.svg')} style={{ height: 150 }} />
    </div>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 560,
        width: BOARD_W,
        height: BOARD_H - 560,
        background: '#1C1A15',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
      }}
    >
      <Img src={staticFile('brand/blusail-logo-scuro.svg')} style={{ height: 120 }} />
      <Img src={staticFile('brand/blusail-marchio-scuro.svg')} style={{ height: 140 }} />
    </div>
  </AbsoluteFill>
);
