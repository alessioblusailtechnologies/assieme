/**
 * Collaudo della conversione automatica, fuori dalla pipeline.
 *
 * Prende un PDF locale, un range di pagine, e lo converte con il
 * ConvertitoreModello VERO — le stesse regole, la stessa spezzatura in
 * blocchi del gestore — scrivendo il Markdown su file. Niente database,
 * niente Storage, niente coda: solo la conversione, per poterla giudicare
 * contro il campione manuale (`esperimento-motore/workspace/`).
 *
 *   npx tsx tools/collaudo-conversione.ts <pdf> <da> <a> [uscita.md]
 *
 * Le pagine sono 1-based inclusive; le ancore [pag. N] escono assolute
 * rispetto al PDF complessivo, come in pipeline. L'header del documento
 * non c'è: quello lo scrive il gestore, qui si giudica il contenuto.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { ConvertitoreModello } from '../src/worker/ingestion/convertitore.js';
import { contaPagine, estraiPagine } from '../src/worker/ingestion/pdf.js';

const PAGINE_PER_BLOCCO = 20;

const [percorsoPdf, daArg, aArg, percorsoUscita] = process.argv.slice(2);
if (!percorsoPdf || !daArg || !aArg) {
  console.error('Uso: npx tsx tools/collaudo-conversione.ts <pdf> <da> <a> [uscita.md]');
  process.exit(1);
}

const da = Number(daArg);
const a = Number(aArg);
const pdf = await readFile(resolve(percorsoPdf));
const pagineTotali = await contaPagine(pdf);
if (!Number.isInteger(da) || !Number.isInteger(a) || da < 1 || a > pagineTotali || da > a) {
  console.error(`Range non valido: il PDF ha ${pagineTotali} pagine.`);
  process.exit(1);
}

const uscita = resolve(
  percorsoUscita ??
    `../local-ingestion/lavorazione/collaudo/${basename(percorsoPdf).replace(/\.pdf$/i, '')}-pagg-${da}-${a}.md`,
);

console.log(`${basename(percorsoPdf)}: ${pagineTotali} pagine, converto ${da}–${a} a blocchi di ${PAGINE_PER_BLOCCO}.`);

const convertitore = new ConvertitoreModello();
const parti: string[] = [];
for (let inizio = da; inizio <= a; inizio += PAGINE_PER_BLOCCO) {
  const fine = Math.min(inizio + PAGINE_PER_BLOCCO - 1, a);
  console.log(`  blocco ${inizio}–${fine}…`);
  const blocco = await estraiPagine(pdf, inizio, fine);
  parti.push(await convertitore.convertiBlocco(blocco, { paginaIniziale: inizio, pagineTotali }));
}

await mkdir(dirname(uscita), { recursive: true });
await writeFile(uscita, `${parti.join('\n\n').trim()}\n`, 'utf8');
console.log(`Scritto ${uscita}`);
