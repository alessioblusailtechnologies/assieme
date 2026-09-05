#!/usr/bin/env node
/**
 * Costruisce la presentazione francese di Velia in un PDF solo.
 *
 *   node tools/presentazione.mjs
 *   node tools/presentazione.mjs out/velia-presentation-fr.pdf
 *
 * Remotion sa rendere una still in PDF vettoriale (`imageFormat: 'pdf'`), non
 * solo in PNG: il testo resta testo, quindi si seleziona, si cerca e il file
 * pesa una frazione. Ogni diapositiva è una still; qui si rendono tutte e poi
 * si cuciono con pdf-lib.
 *
 * Il progetto si impacchetta **una volta sola** e poi si rendono tutte le
 * pagine su quel pacchetto: invocare la CLI una volta per diapositiva
 * rifarebbe il bundle quattordici volte.
 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const RADICE = fileURLToPath(new URL('../', import.meta.url));
const uscita = resolve(RADICE, process.argv[2] ?? 'out/velia-presentation-fr.pdf');
const temporanea = resolve(RADICE, 'out/.presentazione');

/* L'ordine delle diapositive sta nei testi: qui non si duplica, si legge. */
const { diapositive } = await import(
  new URL('../src/presentazione/testi.ts', import.meta.url).href
).catch(async () => {
  /* Il file è TypeScript: se Node non lo sa leggere direttamente, il numero
     di pagine si ricava dal sorgente senza compilare nulla. */
  const sorgente = await readFile(
    new URL('../src/presentazione/testi.ts', import.meta.url),
    'utf8',
  );
  const blocco = /export const diapositive = \[([\s\S]*?)\] as const;/.exec(sorgente);
  if (!blocco) throw new Error('Non trovo l’elenco delle diapositive in testi.ts');
  return { diapositive: [...blocco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) };
});

console.log(`Diapositive da rendere: ${diapositive.length}`);

console.log('Impacchetto il progetto…');
const serveUrl = await bundle({
  entryPoint: resolve(RADICE, 'src/index.ts'),
  onProgress: (p) => {
    if (p === 100) console.log('  pacchetto pronto');
  },
});

await mkdir(temporanea, { recursive: true });

const fogli = [];
for (let i = 1; i <= diapositive.length; i++) {
  const id = `Presentazione${String(i).padStart(2, '0')}`;
  const file = resolve(temporanea, `${id}.pdf`);

  const composizione = await selectComposition({ serveUrl, id });
  await renderStill({
    composition: composizione,
    serveUrl,
    output: file,
    imageFormat: 'pdf',
    overwrite: true,
  });

  fogli.push(file);
  console.log(`  ${String(i).padStart(2, '0')}/${diapositive.length}  ${diapositive[i - 1]}`);
}

console.log('Cucio i fogli…');
const documento = await PDFDocument.create();
documento.setTitle('Velia — Présentation produit');
documento.setSubject('L’IA de la distribution d’assurance');
documento.setAuthor('Blusail Technologies S.r.l.s.');
documento.setCreator('Velia');
documento.setLanguage('fr-FR');

for (const foglio of fogli) {
  const sorgente = await PDFDocument.load(await readFile(foglio));
  const pagine = await documento.copyPages(sorgente, sorgente.getPageIndices());
  for (const p of pagine) documento.addPage(p);
}

await mkdir(dirname(uscita), { recursive: true });
await writeFile(uscita, await documento.save());
await rm(temporanea, { recursive: true, force: true });

const peso = (await readFile(uscita)).length;
console.log(
  `\n${uscita}\n${documento.getPageCount()} pagine · ${(peso / 1024 / 1024).toFixed(2)} MB`,
);
