/**
 * Logo Blusail Technologies — generatore.
 *
 * Il nome viene dalle vele blu che piacevano alla figlia del fondatore; il
 * marchio le astrae in due tratti curvi che salgono, uno grande e uno
 * piccolo: vela, vento, crescita — senza diventare un'azienda marittima.
 * Il wordmark è in TWK Ghost (la voce di Velia), lettere in tracciati.
 *
 * Uso: node genera-logo.mjs   (rigenera tutti gli SVG nella cartella)
 */

import * as fontkit from 'fontkit';
import { writeFileSync } from 'node:fs';

const ghostMedium = fontkit.openSync('../website/public/fonts/TWKGhost-Medium.woff2');
const ghostRegular = fontkit.openSync('../website/public/fonts/TWKGhost-Regular.woff2');

/* ---------------------------------------------------------------------------
 * Palette: gli stessi token di Velia (tokens.css).
 * ------------------------------------------------------------------------ */
const INK = '#1C1A15';
const CREMA = '#F5F1E8';
const GRIGIO = '#767268'; // text-3: la riga TECHNOLOGIES
const GRIGIO_SU_SCURO = '#A5A196';
const BLU = '#2F4B7C';
const BLU_CHIARO = '#7F97C4';
const BLU_SU_SCURO = '#7F97C4';
const BLU_CHIARO_SU_SCURO = '#9FB4D6';

/* ---------------------------------------------------------------------------
 * Testo in tracciati (unità del font, y verso l'alto: il gruppo capovolge).
 * ------------------------------------------------------------------------ */
function testo(font, contenuto, x, baselineY, fontSize, colore, trackingPx = 0) {
  const run = font.layout(contenuto);
  const s = fontSize / font.unitsPerEm;
  let anticipo = 0;
  const glifi = [];
  for (const g of run.glyphs) {
    glifi.push(`<path transform="translate(${anticipo.toFixed(1)} 0)" d="${g.path.toSVG()}"/>`);
    anticipo += g.advanceWidth + trackingPx / s;
  }
  return {
    svg: `<g fill="${colore}" transform="translate(${x} ${baselineY}) scale(${s} ${-s})">${glifi.join('')}</g>`,
    larghezza: anticipo * s,
  };
}

/* ---------------------------------------------------------------------------
 * Il marchio astratto: due tratti curvi che salgono, il grande e il piccolo.
 * Quadro 100×100, tratti con le punte tonde.
 * ------------------------------------------------------------------------ */
function tratti(x, y, scala, blu, bluChiaro, spessore = 13) {
  return `<g transform="translate(${x} ${y}) scale(${scala})" fill="none" stroke-linecap="round" stroke-width="${spessore}">
    <path d="M 22 86 Q 28 36 64 12" stroke="${blu}"/>
    <path d="M 58 86 Q 62 62 80 46" stroke="${bluChiaro}"/>
  </g>`;
}

/** Il quadrato app: il linguaggio del quadratino blu di Velia. */
function quadrato(nome, { fondo, tratto1, tratto2 }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Blusail Technologies">
  <rect width="100" height="100" rx="22" fill="${fondo}"/>
  <g fill="none" stroke-linecap="round" stroke-width="11">
    <path d="M 28 76 Q 33 36 62 17" stroke="${tratto1}"/>
    <path d="M 57 76 Q 60 57 75 43" stroke="${tratto2}"/>
  </g>
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

/* ---------------------------------------------------------------------------
 * Le composizioni.
 * ------------------------------------------------------------------------ */

/** Orizzontale: tratti + Blusail, con TECHNOLOGIES in maiuscoletto sotto. */
function orizzontale({ nome, testoColore, sottoColore, blu, bluChiaro }) {
  const NOME_SIZE = 54;
  const NOME_BASE = 56;
  const SOTTO_SIZE = 14.5;
  const SOTTO_BASE = 82;
  const TX = 96;
  const nomeT = testo(ghostMedium, 'Blusail', TX, NOME_BASE, NOME_SIZE, testoColore, -0.5);
  const sottoT = testo(ghostRegular, 'TECHNOLOGIES', TX + 2, SOTTO_BASE, SOTTO_SIZE, sottoColore, 4.4);
  const W = Math.ceil(TX + Math.max(nomeT.larghezza, sottoT.larghezza) + 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" role="img" aria-label="Blusail Technologies">
  ${tratti(0, 2, 0.86, blu, bluChiaro)}
  ${nomeT.svg}
  ${sottoT.svg}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

/** Solo il nome, senza marchio: per contesti dove il segno c'è già. */
function soloNome({ nome, testoColore, sottoColore }) {
  const nomeT = testo(ghostMedium, 'Blusail', 2, 44, 54, testoColore, -0.5);
  const sottoT = testo(ghostRegular, 'TECHNOLOGIES', 4, 70, 14.5, sottoColore, 4.4);
  const W = Math.ceil(Math.max(nomeT.larghezza, sottoT.larghezza) + 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 84" role="img" aria-label="Blusail Technologies">
  ${nomeT.svg}
  ${sottoT.svg}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

/** I soli tratti: avatar, favicon su fondo libero. */
function soloTratti({ nome, blu, bluChiaro }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Blusail Technologies">
  ${tratti(0, 0, 1, blu, bluChiaro)}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

const chiaro = { testoColore: INK, sottoColore: GRIGIO, blu: BLU, bluChiaro: BLU_CHIARO };
const scuro = {
  testoColore: CREMA,
  sottoColore: GRIGIO_SU_SCURO,
  blu: BLU_SU_SCURO,
  bluChiaro: BLU_CHIARO_SU_SCURO,
};

const generati = [
  orizzontale({ ...chiaro, nome: 'blusail-logo.svg' }),
  orizzontale({ ...scuro, nome: 'blusail-logo-scuro.svg' }),
  soloNome({ ...chiaro, nome: 'blusail-nome.svg' }),
  soloTratti({ ...chiaro, nome: 'blusail-marchio.svg' }),
  soloTratti({ ...scuro, nome: 'blusail-marchio-scuro.svg' }),
  quadrato('blusail-app.svg', { fondo: BLU, tratto1: '#FFFFFF', tratto2: BLU_CHIARO_SU_SCURO }),
];

console.log('Generati:', generati.join(', '));
