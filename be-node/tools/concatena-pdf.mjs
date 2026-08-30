#!/usr/bin/env node
/**
 * Concatena più PDF in uno, nell'ordine dato: serve quando la compagnia
 * pubblica DIP, DIP Aggiuntivo e Condizioni come file separati (AXA) e
 * l'archivio vuole un PDF unico con le ancore di pagina assolute.
 *
 *   node tools/concatena-pdf.mjs <uscita.pdf> <primo.pdf> <secondo.pdf> [...]
 *
 * Usa `pdfunite` di poppler se c'è nel PATH (regge anche i PDF che pdf-lib
 * non apre), altrimenti pdf-lib. Stampa le pagine di ogni pezzo e il
 * totale, così la mappa dei documenti logici è già scritta.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const [uscita, ...pezzi] = process.argv.slice(2);
if (!uscita || pezzi.length < 2) {
  console.error('Uso: node tools/concatena-pdf.mjs <uscita.pdf> <primo.pdf> <secondo.pdf> [...]');
  process.exit(1);
}

const conteggi = [];
for (const p of pezzi) conteggi.push(await pagineDi(p));

const haPdfunite = spawnSync('pdfunite', ['-v'], { encoding: 'utf8' }).status !== null;
if (haPdfunite) {
  const r = spawnSync('pdfunite', [...pezzi, uscita], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`pdfunite: ${r.stderr || r.stdout}`);
    process.exit(2);
  }
} else {
  const { PDFDocument } = require('pdf-lib');
  const unito = await PDFDocument.create();
  for (const p of pezzi) {
    const doc = await PDFDocument.load(readFileSync(p), { ignoreEncryption: true });
    const copiate = await unito.copyPages(doc, doc.getPageIndices());
    for (const c of copiate) unito.addPage(c);
  }
  writeFileSync(uscita, await unito.save());
}

let da = 1;
for (let i = 0; i < pezzi.length; i++) {
  console.log(`  ${pezzi[i]}: pagine ${da}–${da + conteggi[i] - 1} (${conteggi[i]})`);
  da += conteggi[i];
}
const totale = await pagineDi(uscita);
console.log(`${uscita}: ${totale} pagine${totale === da - 1 ? '' : `  ATTENZIONE: attese ${da - 1}`} (${haPdfunite ? 'pdfunite' : 'pdf-lib'})`);

async function pagineDi(percorso) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(percorso)), useSystemFonts: true }).promise;
  return pdf.numPages;
}
