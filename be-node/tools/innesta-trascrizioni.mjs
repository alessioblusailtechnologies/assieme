#!/usr/bin/env node
/**
 * Innesta le pagine trascritte a mano nei `.md` preparati da
 * `prepara-set.mjs`, al posto dei segnaposto `<!-- DA TRASCRIVERE -->`.
 *
 *   node tools/innesta-trascrizioni.mjs <frammenti.md> <cartella-edizione>
 *
 * Il file dei frammenti è una sequenza di blocchi, uno per pagina:
 *
 *   @@ dip.md 3
 *   ...testo della pagina 3...
 *   @@ dip.md 4
 *   ...testo della pagina 4...
 *
 * Rifiuta di scrivere se un segnaposto non c'è: vuol dire che la pagina non
 * era da trascrivere, o che il numero è sbagliato.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [frammenti, cartella] = process.argv.slice(2);
if (!frammenti || !cartella) {
  console.error('Uso: node tools/innesta-trascrizioni.mjs <frammenti.md> <cartella-edizione>');
  process.exit(1);
}

const pezzi = readFileSync(frammenti, 'utf8').split(/^@@\s+(\S+)\s+(\d+)\s*$/m).slice(1);
const perFile = new Map();
for (let i = 0; i < pezzi.length; i += 3) {
  const file = pezzi[i];
  const pagina = Number(pezzi[i + 1]);
  const corpo = (pezzi[i + 2] || '').trim();
  if (!perFile.has(file)) perFile.set(file, new Map());
  perFile.get(file).set(pagina, corpo);
}

let innestate = 0;
for (const [file, pagine] of perFile) {
  const percorso = join(cartella, file);
  if (!existsSync(percorso)) {
    console.error(`manca ${percorso}`);
    process.exit(1);
  }
  let testo = readFileSync(percorso, 'utf8');
  for (const [n, corpo] of pagine) {
    const segnaposto = new RegExp(`(\\[pag\\. ${n}\\]\\s*\\n\\s*)<!-- DA TRASCRIVERE[\\s\\S]*?-->`);
    if (!segnaposto.test(testo)) {
      console.error(`${file}: nessun segnaposto a pag. ${n}`);
      process.exit(1);
    }
    testo = testo.replace(segnaposto, (_, ancora) => ancora + corpo);
    innestate++;
  }
  writeFileSync(percorso, testo, 'utf8');
  console.log(`  ${file}: ${pagine.size} pagine`);
}
console.log(`${innestate} pagine innestate`);
