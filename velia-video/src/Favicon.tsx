import { AbsoluteFill } from 'remotion';

/**
 * Il marchio di Velia per favicon e icone del sito: la V serif bianca sul
 * quadrato d'inchiostro, come i loghi dei profili social. Si renderizza a
 * 1024 e si ridimensiona con ffmpeg nelle misure che servono.
 */

export const FAV_SIZE = 1024;

export const Favicon: React.FC = () => (
  <AbsoluteFill
    style={{
      background: '#14181D',
      display: 'grid',
      placeItems: 'center',
      fontFamily: "Georgia, 'Times New Roman', serif",
    }}
  >
    <span
      style={{
        color: '#FFFFFF',
        fontSize: 760,
        lineHeight: 1,
        /* La V ha un baricentro ottico più alto del suo box: si abbassa un soffio. */
        transform: 'translateY(-4%)',
      }}
    >
      V
    </span>
  </AbsoluteFill>
);
