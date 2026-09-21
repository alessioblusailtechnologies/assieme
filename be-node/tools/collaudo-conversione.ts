/**
 * Collaudo della conversione automatica, fuori dalla pipeline.
 *
 * Prende un PDF locale, un range di pagine, e lo converte con il
 * ConvertitoreModello VERO — le stesse regole, la stessa spezzatura in
 * blocchi del gestore — scrivendo il Markdown su file. Niente database,
 * niente Storage, niente coda: solo la conversione, per poterla giudicare
 * contro il campione manuale (`esperimento-motore/workspace/`).
 *
 *   npx tsx tools/collaudo-conversione.ts <pdf> <da> <a> [uscita.md] [--modello=<sdk>]
 *
 * Le pagine sono 1-based inclusive; le ancore [pag. N] escono assolute
 * rispetto al PDF complessivo, come in pipeline. L'header del documento
 * non c'è: quello lo scrive il gestore, qui si giudica il contenuto.
 *
 * `--modello` dice chi trascrive (`deepseek-flash` è il livello Avanzato,
 * con le pagine in PNG); senza, vale `MODELLO_LETTURA_VISIVA` se è forzato, o
 * il default di piattaforma. Così si confronta un candidato contro l'altro
 * sulle stesse pagine. In coda stampa i consumi, che sono la ragione per cui
 * si cambia trascrittore.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { contando, ContatoreConsumi } from '../src/worker/consumi.js';
import { ConvertitoreModello } from '../src/worker/ingestion/convertitore.js';
import { contaPagine, estraiPagine } from '../src/worker/ingestion/pdf.js';

const argomenti = process.argv.slice(2);
const modelloChiesto = argomenti.find((a) => a.startsWith('--modello='))?.split('=')[1];
const [percorsoPdf, daArg, aArg, percorsoUscita] = argomenti.filter((a) => !a.startsWith('--'));
if (!percorsoPdf || !daArg || !aArg) {
  console.error('Uso: npx tsx tools/collaudo-conversione.ts <pdf> <da> <a> [uscita.md] [--modello=<sdk>]');
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

const c = configurazione();
const modello = modelloChiesto ?? c.MODELLO_LETTURA_VISIVA ?? c.MODELLO_MOTORE;
const uscita = resolve(
  percorsoUscita ??
    `../local-ingestion/lavorazione/collaudo/${basename(percorsoPdf).replace(/\.pdf$/i, '')}-pagg-${da}-${a}.md`,
);

const convertitore = new ConvertitoreModello(modello);
const perBlocco = convertitore.pagineNelBlocco ?? 20;
console.log(
  `${basename(percorsoPdf)}: ${pagineTotali} pagine, converto ${da}–${a} con ${modello} a blocchi di ${perBlocco}.`,
);

const contatore = new ContatoreConsumi();
const parti: string[] = [];
const inizioMs = Date.now();
await contando(contatore, async () => {
  for (let inizio = da; inizio <= a; inizio += perBlocco) {
    const fine = Math.min(inizio + perBlocco - 1, a);
    console.log(`  blocco ${inizio}–${fine}…`);
    const blocco = await estraiPagine(pdf, inizio, fine);
    parti.push(await convertitore.convertiBlocco(blocco, { paginaIniziale: inizio, pagineTotali }));
  }
});

await mkdir(dirname(uscita), { recursive: true });
await writeFile(uscita, `${parti.join('\n\n').trim()}\n`, 'utf8');
console.log(`Scritto ${uscita}`);

const pagine = a - da + 1;
for (const { modello: sdk, uso, costoUsd } of contatore.voci()) {
  console.log(
    `${sdk}: ${uso.input} token letti (${uso.cacheLettura} dalla cache), ${uso.output} scritti, ` +
      `${costoUsd.toFixed(4)} $ — ${(costoUsd / pagine).toFixed(5)} $ a pagina, ` +
      `${((Date.now() - inizioMs) / 1000 / pagine).toFixed(1)} s a pagina.`,
  );
}
