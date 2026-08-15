/**
 * Logo Blusail — generatore.
 *
 * Il concetto viene dalla storia del nome: le vele blu che piaceva no alla
 * figlia del fondatore. Due vele, una grande e una piccola, in navigazione
 * insieme: il genitore e la bambina. Il wordmark è in TWK Ghost Medium, la
 * voce di Velia, con le lettere convertite in tracciati: il file non dipende
 * dai font installati.
 *
 * Uso: node genera-logo.mjs   (rigenera tutti gli SVG nella cartella)
 */

import * as fontkit from 'fontkit';
import { writeFileSync } from 'node:fs';

const font = fontkit.openSync('../website/public/fonts/TWKGhost-Medium.woff2');

/* ---------------------------------------------------------------------------
 * Palette: gli stessi token di Velia (tokens.css).
 * ------------------------------------------------------------------------ */
const INK = '#1C1A15';
const CREMA = '#F5F1E8';
const BLU = '#2F4B7C'; // il blu del marchio
const BLU_CHIARO = '#7F97C4'; // accent-on-dark: la vela piccola
const BLU_SU_SCURO = '#7F97C4';
const BLU_CHIARO_SU_SCURO = '#9FB4D6';

/* ---------------------------------------------------------------------------
 * Il testo in tracciati: fontkit dà i glifi in unità del font (y verso
 * l'alto); il gruppo li capovolge e li porta al corpo richiesto.
 * ------------------------------------------------------------------------ */
function testoInTracciati(testo, x, baselineY, fontSize, colore, tracking = 0) {
  const run = font.layout(testo);
  const s = fontSize / font.unitsPerEm;
  const trackUnits = (tracking * font.unitsPerEm) / fontSize / s; // px → unità
  let anticipo = 0;
  const glifi = [];
  for (const g of run.glyphs) {
    glifi.push(`<path transform="translate(${anticipo.toFixed(1)} 0)" d="${g.path.toSVG()}"/>`);
    anticipo += g.advanceWidth + (tracking / s);
  }
  const larghezza = anticipo * s;
  const svg = `<g fill="${colore}" transform="translate(${x} ${baselineY}) scale(${s} ${-s})">${glifi.join('')}</g>`;
  return { svg, larghezza };
}

/* ---------------------------------------------------------------------------
 * Il marchio: due vele e l'acqua. Disegnato in un quadro 100×100.
 *  - vela grande: bordo d'entrata curvo, bordo d'uscita dritto sull'albero;
 *  - vela piccola, davanti: la bambina, per la quale il nome esiste;
 *  - sotto, l'acqua: un tratto curvo con le punte tonde.
 * ------------------------------------------------------------------------ */
function marchio(x, y, scala, blu, bluChiaro, acqua) {
  return `<g transform="translate(${x} ${y}) scale(${scala})">
    <path d="M 54 6 Q 24 42 19 78 L 54 78 Z" fill="${blu}"/>
    <path d="M 62 34 Q 82 52 86 78 L 62 78 Z" fill="${bluChiaro}"/>
    <path d="M 14 87 Q 52 95 90 87" fill="none" stroke="${acqua}" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

/* ---------------------------------------------------------------------------
 * Le composizioni.
 * ------------------------------------------------------------------------ */

/** Orizzontale: marchio + Blusail, la versione d'uso quotidiano. */
function orizzontale({ testoColore, blu, bluChiaro, acqua, nome }) {
  const FONT_SIZE = 58;
  const BASELINE = 72;
  const testo = testoInTracciati('Blusail', 108, BASELINE, FONT_SIZE, testoColore, -0.5);
  const W = Math.ceil(108 + testo.larghezza + 16);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" role="img" aria-label="Blusail">
  ${marchio(4, 2, 0.92, blu, bluChiaro, acqua)}
  ${testo.svg}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

/** Verticale: marchio sopra, nome sotto — per avatar e timbri. */
function verticale({ testoColore, blu, bluChiaro, acqua, nome }) {
  const FONT_SIZE = 40;
  const testo = testoInTracciati('Blusail', 0, 0, FONT_SIZE, testoColore, -0.3);
  const W = Math.max(120, Math.ceil(testo.larghezza + 24));
  const testoX = (W - testo.larghezza) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 168" role="img" aria-label="Blusail">
  ${marchio((W - 100) / 2, 0, 1, blu, bluChiaro, acqua)}
  ${testoInTracciati('Blusail', testoX, 148, FONT_SIZE, testoColore, -0.3).svg}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

/** Solo il marchio: favicon, avatar stretti. */
function soloMarchio({ blu, bluChiaro, acqua, nome }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Blusail">
  ${marchio(0, 0, 1, blu, bluChiaro, acqua)}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

const chiaro = { testoColore: INK, blu: BLU, bluChiaro: BLU_CHIARO, acqua: INK };
const scuro = {
  testoColore: CREMA,
  blu: BLU_SU_SCURO,
  bluChiaro: BLU_CHIARO_SU_SCURO,
  acqua: CREMA,
};

const generati = [
  orizzontale({ ...chiaro, nome: 'blusail-logo.svg' }),
  orizzontale({ ...scuro, nome: 'blusail-logo-scuro.svg' }),
  verticale({ ...chiaro, nome: 'blusail-logo-verticale.svg' }),
  soloMarchio({ ...chiaro, nome: 'blusail-marchio.svg' }),
  soloMarchio({ ...scuro, nome: 'blusail-marchio-scuro.svg' }),
];

console.log('Generati:', generati.join(', '));
