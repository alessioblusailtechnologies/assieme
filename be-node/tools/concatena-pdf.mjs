#!/usr/bin/env node
/**
 * Concatena più PDF in uno, nell'ordine dato: serve quando la compagnia
 * pubblica DIP, DIP Aggiuntivo e Condizioni come file separati (AXA) e
 * l'archivio vuole un PDF unico con le ancore di pagina assolute.
 *
 *   node tools/concatena-pdf.mjs <uscita.pdf> <primo.pdf> <secondo.pdf> [...]
 *
 * Usa `pdfunite` di poppler se c'è nel PATH (regge anche i PDF che pdf-lib
 * non apre). Se un pezzo è cifrato pdfunite si rifiuta: allora passa a
 * mupdf, che decifra salvando. Con pdf-lib no: `ignoreEncryption` copia i
 * flussi ancora cifrati e il PDF che ne esce non si lascia più leggere
 * (Generali Sei in Viaggio, DIP aggiuntivo). pdf-lib resta l'ultima
 * spiaggia. Stampa le pagine di ogni pezzo e il totale, così la mappa dei
 * documenti logici è già scritta.
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

let via = null;
const haPdfunite = spawnSync('pdfunite', ['-v'], { encoding: 'utf8' }).status !== null;
if (haPdfunite) {
  const r = spawnSync('pdfunite', [...pezzi, uscita], { encoding: 'utf8' });
  if (r.status === 0) via = 'pdfunite';
  else console.warn(`pdfunite: ${(r.stderr || r.stdout).trim()}`);
}
if (!via) {
  try {
    const mupdf = await import('mupdf');
    // Il primo pezzo fa da contenitore: gli altri gli si innestano in coda.
    const unito = mupdf.PDFDocument.openDocument(readFileSync(pezzi[0]), 'application/pdf');
    for (const p of pezzi.slice(1)) {
      const doc = mupdf.PDFDocument.openDocument(readFileSync(p), 'application/pdf');
      for (let i = 0; i < doc.countPages(); i++) unito.graftPage(-1, doc, i);
    }
    writeFileSync(uscita, unito.saveToBuffer('compress').asUint8Array());
    via = 'mupdf';
  } catch (errore) {
    console.warn(`mupdf: ${errore.message}`);
    const { PDFDocument } = require('pdf-lib');
    const unito = await PDFDocument.create();
    for (const p of pezzi) {
      const doc = await PDFDocument.load(readFileSync(p), { ignoreEncryption: true });
      const copiate = await unito.copyPages(doc, doc.getPageIndices());
      for (const c of copiate) unito.addPage(c);
    }
    writeFileSync(uscita, await unito.save());
    via = 'pdf-lib';
  }
}

let da = 1;
for (let i = 0; i < pezzi.length; i++) {
  console.log(`  ${pezzi[i]}: pagine ${da}–${da + conteggi[i] - 1} (${conteggi[i]})`);
  da += conteggi[i];
}
const totale = await pagineDi(uscita);
console.log(`${uscita}: ${totale} pagine${totale === da - 1 ? '' : `  ATTENZIONE: attese ${da - 1}`} (${via})`);

async function pagineDi(percorso) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(percorso)), useSystemFonts: true }).promise;
  return pdf.numPages;
}
