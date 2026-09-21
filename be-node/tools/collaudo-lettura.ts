/**
 * Il giro completo della lettura visiva su un PDF locale, senza database né
 * coda: chi trascrive è il modello di `--modello` (quello di un livello:
 * `claude-sonnet-5` Medio, `deepseek-flash` Avanzato, `claude-opus-5` Boost),
 * i due testimoni sono quelli del prodotto (pdfjs e Mistral OCR) e il
 * secondo sguardo è `MODELLO_INGESTION`.
 *
 *   npx tsx tools/collaudo-lettura.ts <pdf> <da> <a> [--modello=<sdk>]
 *
 * È il collaudo che serve quando si cambia trascrittore: dice quante pagine
 * i testimoni segnalano, che cosa il secondo sguardo corregge, e quanto è
 * costato il tutto, modello per modello.
 */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { configurazione } from '../src/config.js';
import { contando, ContatoreConsumi } from '../src/worker/consumi.js';
import { ConvertitoreModello } from '../src/worker/ingestion/convertitore.js';
import { leggiDocumento } from '../src/worker/ingestion/lettura-visiva.js';
import { estraiPagine } from '../src/worker/ingestion/pdf.js';
import { SecondoSguardoModello } from '../src/worker/ingestion/secondo-sguardo.js';

const argomenti = process.argv.slice(2);
const modelloChiesto = argomenti.find((a) => a.startsWith('--modello='))?.split('=')[1];
const [percorsoPdf, daArg, aArg] = argomenti.filter((a) => !a.startsWith('--'));
if (!percorsoPdf || !daArg || !aArg) {
  console.error('Uso: npx tsx tools/collaudo-lettura.ts <pdf> <da> <a> [--modello=<sdk>]');
  process.exit(1);
}

const c = configurazione();
const intero = await readFile(resolve(percorsoPdf));
const pdf = await estraiPagine(intero, Number(daArg), Number(aArg));
const totale = Number(aArg) - Number(daArg) + 1;

const modello = modelloChiesto ?? c.MODELLO_LETTURA_VISIVA ?? c.MODELLO_MOTORE;
const convertitore = new ConvertitoreModello(modello);
console.log(
  `${basename(percorsoPdf)} pagg. ${daArg}–${aArg} (${totale}): trascrive ${modello}, ` +
    `ricontrolla ${c.MODELLO_INGESTION}.`,
);

const contatore = new ContatoreConsumi();
const inizio = Date.now();
const esito = await contando(contatore, () =>
  leggiDocumento(pdf, totale, {
    convertitore,
    secondoSguardo: new SecondoSguardoModello(),
    pagineNelBlocco: convertitore.pagineNelBlocco ?? 10,
    avanzamento: async (a) => {
      if (a.fatte === a.totali) console.log(`  ${a.fase}: ${a.fatte}/${a.totali}`);
    },
  }),
);

console.log(`\nGiudizi dei testimoni (OCR ${esito.senzaOcr ? 'ASSENTE' : 'presente'}):`);
for (const g of esito.giudizi) {
  console.log(`  pag. ${g.pagina}: ${g.esito}${g.note.length ? ` — ${g.note.join('; ')}` : ''}`);
}
console.log(`\nCorrezioni del secondo sguardo: ${esito.correzioni.length || 'nessuna'}`);
for (const c of esito.correzioni) console.log(`  ${c}`);

console.log('\nConsumi:');
for (const { modello: sdk, uso, costoUsd } of contatore.voci()) {
  console.log(`  ${sdk}: ${uso.input} letti, ${uso.output} scritti, ${costoUsd.toFixed(4)} $`);
}
const tutto = contatore.voci().reduce((s, v) => s + v.costoUsd, 0);
console.log(
  `  totale ${tutto.toFixed(4)} $ — ${(tutto / totale).toFixed(5)} $ a pagina, ` +
    `${((Date.now() - inizio) / 1000).toFixed(0)} s in tutto.`,
);
