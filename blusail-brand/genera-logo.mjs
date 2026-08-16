/**
 * Logo Blusail Technologies — generatore, tre vie.
 *
 * Il nome viene dalle vele blu che piacevano alla figlia del fondatore; il
 * marchio le astrae in due elementi, uno grande e uno piccolo. Tre
 * interpretazioni dello stesso concetto:
 *   A · tratti — due tratti curvi che salgono, punte tonde (la via attuale)
 *   B · vele  — due lame piene e curve, più corpo, meglio da lontano
 *   C · quarti — due quarti geometrici a base piatta, la via più costruita
 *
 * Wordmark: «blusail» minuscolo in TWK Ghost Medium, TECHNOLOGIES in
 * maiuscolo spaziato sotto. Lettere in tracciati: nessuna dipendenza dai
 * font installati.
 *
 * Uso: node genera-logo.mjs
 */

import * as fontkit from 'fontkit';
import { writeFileSync } from 'node:fs';

const ghostMedium = fontkit.openSync('../website/public/fonts/TWKGhost-Medium.woff2');
const ghostRegular = fontkit.openSync('../website/public/fonts/TWKGhost-Regular.woff2');

const INK = '#1C1A15';
const CREMA = '#F5F1E8';
const GRIGIO = '#767268';
const GRIGIO_SU_SCURO = '#A5A196';
const BLU = '#2F4B7C';
const BLU_CHIARO = '#7F97C4';
const BLU_SU_SCURO = '#7F97C4';
const BLU_CHIARO_SU_SCURO = '#9FB4D6';

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
 * I tre segni, tutti in un quadro 100×100 con la base a y=84.
 * ------------------------------------------------------------------------ */

const SEGNI = {
  /** A · tratti: due tratti curvi con le punte tonde. */
  tratti: (blu, bluChiaro) => `<g fill="none" stroke-linecap="round" stroke-width="13">
    <path d="M 22 84 Q 28 36 64 12" stroke="${blu}"/>
    <path d="M 58 84 Q 62 60 80 44" stroke="${bluChiaro}"/>
  </g>`,

  /** B · vele: due lame piene, curve su entrambi i fianchi. */
  vele: (blu, bluChiaro) => `<g>
    <path d="M 24 84 Q 28 34 66 10 Q 52 44 48 84 Z" fill="${blu}"/>
    <path d="M 58 84 Q 63 58 84 42 Q 74 62 72 84 Z" fill="${bluChiaro}"/>
  </g>`,

  /** C · quarti: geometria piatta, un fianco dritto e uno curvo. */
  quarti: (blu, bluChiaro) => `<g>
    <path d="M 20 84 L 20 18 Q 64 26 64 84 Z" fill="${blu}"/>
    <path d="M 72 84 L 72 46 Q 94 52 94 84 Z" fill="${bluChiaro}"/>
  </g>`,

  /** D · tratto e punto: il tratto grande che sale, la bambina è il punto. */
  'tratto-punto': (blu, bluChiaro) => `<g>
    <path d="M 32 84 Q 38 34 72 12" fill="none" stroke="${blu}" stroke-linecap="round" stroke-width="14"/>
    <circle cx="70" cy="60" r="9.5" fill="${bluChiaro}"/>
  </g>`,

  /** E · vento: due tratti orizzontali che spazzano verso destra. */
  vento: (blu, bluChiaro) => `<g fill="none" stroke-linecap="round" stroke-width="13">
    <path d="M 14 40 Q 50 22 86 34" stroke="${blu}"/>
    <path d="M 28 64 Q 56 52 80 60" stroke="${bluChiaro}"/>
  </g>`,

  /** F · archi: la stessa curva che si propaga, il piccolo dentro il grande. */
  archi: (blu, bluChiaro) => `<g fill="none" stroke-linecap="round" stroke-width="13">
    <path d="M 24 30 A 54 54 0 0 1 78 84" stroke="${blu}"/>
    <path d="M 24 58 A 26 26 0 0 1 50 84" stroke="${bluChiaro}"/>
  </g>`,

  /** G · equilibrio: due quarti pieni, opposti sulla diagonale. */
  equilibrio: (blu, bluChiaro) => `<g>
    <path d="M 20 84 L 20 32 A 52 52 0 0 1 72 84 Z" fill="${blu}"/>
    <path d="M 98 8 L 72 8 A 26 26 0 0 0 98 34 Z" fill="${bluChiaro}"/>
  </g>`,

  /* ---- Le vie premium: segni più fini, palette trattenuta ---- */

  /** D1 · filo: il tratto si fa sottile, le punte tagliate di netto. */
  filo: (c1, c2) => `<g>
    <path d="M 30 84 Q 34 34 70 12" fill="none" stroke="${c1}" stroke-width="7.5"/>
    <circle cx="67" cy="62" r="6.5" fill="${c2}"/>
  </g>`,

  /** D2 · punto blu: il tratto nel colore del testo, il blu solo al punto. */
  punto: (c1, c2) => `<g>
    <path d="M 31 84 Q 36 34 71 13" fill="none" stroke="${c1}" stroke-linecap="round" stroke-width="10"/>
    <circle cx="68" cy="61" r="7.5" fill="${c2}"/>
  </g>`,

  /** G1/G2 · quarti raffinati: più aria, il piccolo più discreto. */
  quartiP: (c1, c2) => `<g>
    <path d="M 24 84 L 24 38 A 46 46 0 0 1 70 84 Z" fill="${c1}"/>
    <path d="M 98 12 L 76 12 A 22 22 0 0 0 98 34 Z" fill="${c2}"/>
  </g>`,
};

/* ---------------------------------------------------------------------------
 * Varianti premium: ogni via porta i suoi colori, su chiaro, scuro e app.
 * ------------------------------------------------------------------------ */
const PREMIUM = {
  filo: {
    segno: 'filo',
    chiaro: [BLU, BLU_CHIARO],
    scuro: [BLU_SU_SCURO, BLU_CHIARO_SU_SCURO],
    app: { fondo: BLU, colori: ['#FFFFFF', BLU_CHIARO_SU_SCURO] },
  },
  'punto-blu': {
    segno: 'punto',
    chiaro: [INK, BLU],
    scuro: [CREMA, BLU_CHIARO_SU_SCURO],
    app: { fondo: INK, colori: [CREMA, BLU_CHIARO] },
  },
  'quarti-tono': {
    segno: 'quartiP',
    chiaro: [BLU, 'rgba(47,75,124,0.42)'],
    scuro: [BLU_SU_SCURO, 'rgba(127,151,196,0.45)'],
    app: { fondo: BLU, colori: ['#FFFFFF', 'rgba(255,255,255,0.45)'] },
  },
  'quarti-notte': {
    segno: 'quartiP',
    chiaro: [INK, BLU],
    scuro: [CREMA, BLU_CHIARO_SU_SCURO],
    app: { fondo: INK, colori: [CREMA, BLU_CHIARO] },
  },
};

const segno = (via, x, y, scala, blu, bluChiaro) =>
  `<g transform="translate(${x} ${y}) scale(${scala})">${SEGNI[via](blu, bluChiaro)}</g>`;

/* ---------------------------------------------------------------------------
 * Le composizioni.
 * ------------------------------------------------------------------------ */

function orizzontale(via, { nome, testoColore, sottoColore, blu, bluChiaro }) {
  const TX = 96;
  const nomeT = testo(ghostMedium, 'blusail', TX, 56, 56, testoColore, -0.5);
  const sottoT = testo(ghostRegular, 'TECHNOLOGIES', TX + 2, 82, 14.5, sottoColore, 4.4);
  const W = Math.ceil(TX + Math.max(nomeT.larghezza, sottoT.larghezza) + 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" role="img" aria-label="Blusail Technologies">
  ${segno(via, 0, 2, 0.86, blu, bluChiaro)}
  ${nomeT.svg}
  ${sottoT.svg}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

function quadratoApp(via, nome) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Blusail Technologies">
  <rect width="100" height="100" rx="22" fill="${BLU}"/>
  ${segno(via, 6, 4, 0.88, '#FFFFFF', BLU_CHIARO_SU_SCURO)}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

function soloSegno(via, nome, blu, bluChiaro) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Blusail Technologies">
  ${segno(via, 0, 0, 1, blu, bluChiaro)}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

function soloNome({ nome, testoColore, sottoColore }) {
  const nomeT = testo(ghostMedium, 'blusail', 2, 44, 56, testoColore, -0.5);
  const sottoT = testo(ghostRegular, 'TECHNOLOGIES', 4, 70, 14.5, sottoColore, 4.4);
  const W = Math.ceil(Math.max(nomeT.larghezza, sottoT.larghezza) + 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 84" role="img" aria-label="Blusail Technologies">
  ${nomeT.svg}
  ${sottoT.svg}
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

/** Lockup premium: marchio più piccolo, riga TECHNOLOGIES più ariosa. */
function orizzontalePremium(spec, { nome, testoColore, sottoColore }, tono) {
  const TX = 84;
  const nomeT = testo(ghostMedium, 'blusail', TX, 54, 52, testoColore, -0.5);
  const sottoT = testo(ghostRegular, 'TECHNOLOGIES', TX + 2, 79, 12.5, sottoColore, 5.2);
  const W = Math.ceil(TX + Math.max(nomeT.larghezza, sottoT.larghezza) + 14);
  const [c1, c2] = spec[tono];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" role="img" aria-label="Blusail Technologies">
  <g transform="translate(0 8) scale(0.78)">${SEGNI[spec.segno](c1, c2)}</g>
  ${nomeT.svg}
  ${sottoT.svg}
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

function quadratoAppPremium(spec, nome) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Blusail Technologies">
  <rect width="100" height="100" rx="22" fill="${spec.app.fondo}"/>
  <g transform="translate(6 4) scale(0.88)">${SEGNI[spec.segno](...spec.app.colori)}</g>
</svg>`;
  writeFileSync(nome, svg);
  return nome;
}

const generati = [];
for (const [via, spec] of Object.entries(PREMIUM)) {
  generati.push(
    orizzontalePremium(spec, { ...chiaro, nome: `blusail-${via}.svg` }, 'chiaro'),
    orizzontalePremium(spec, { ...scuro, nome: `blusail-${via}-scuro.svg` }, 'scuro'),
    soloSegno(spec.segno, `blusail-${via}-marchio.svg`, ...spec.chiaro),
    quadratoAppPremium(spec, `blusail-${via}-app.svg`),
  );
}
generati.push(soloNome({ ...chiaro, nome: 'blusail-nome.svg' }));

console.log('Generati:', generati.length, 'file');
