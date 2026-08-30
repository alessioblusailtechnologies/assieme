#!/usr/bin/env node
/**
 * Assembla i `.md` di un'edizione dell'archivio partendo dalle pagine
 * trascritte a occhio dalla skill `/ingest-visivo`: un file per pagina
 * (`pag-NNNN.md`, senza ancora) diventa un documento logico per range,
 * con l'header delle ISTRUZIONI e l'ancora `[pag. N]` davanti a ogni
 * pagina. È colla, non lettura: non tocca il testo.
 *
 *   node tools/assembla-set.mjs <manifesto.json>
 *   node tools/assembla-set.mjs <manifesto.json> --pagine <cartella> --radice <albero>
 *
 * Il manifesto è quello di `prepara-set.mjs` (compagnia, slug, ramo,
 * prodotto, modello, edizione gg/mm/aaaa, pdf, documenti[{file, titolo, da, a}]).
 * Le pagine si cercano in `local-ingestion/lavorazione-visiva/pagine/<pdf senza .pdf>/`,
 * l'albero si scrive in `local-ingestion/lavorazione-visiva/archivio-pubblico/`.
 *
 * Si rifiuta di scrivere se manca anche una sola pagina: un file assente
 * è una pagina che nessuno ha guardato, un file vuoto è una pagina vista
 * e senza testo. Elenca le pagine con `[!ATTENZIONE]` per il report.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const QUI = dirname(fileURLToPath(import.meta.url));
const LOCALE = join(QUI, '..', '..', 'local-ingestion');
const VISIVA = join(LOCALE, 'lavorazione-visiva');

const args = process.argv.slice(2);
const manifesto = args[0];
if (!manifesto) {
  console.error('Uso: node tools/assembla-set.mjs <manifesto.json> [--pagine <cartella>] [--radice <albero>]');
  process.exit(1);
}
const opzione = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};

const set = JSON.parse(readFileSync(manifesto, 'utf8'));
const nomePdf = basename(set.pdf, '.pdf');
const PAGINE = opzione('--pagine') ?? join(VISIVA, 'pagine', nomePdf);
const RADICE = opzione('--radice') ?? join(VISIVA, 'archivio-pubblico');

const percorsoPdf = join(LOCALE, 'originali', set.pdf);
if (!existsSync(percorsoPdf)) {
  console.error(`PDF non trovato: ${percorsoPdf}`);
  process.exit(1);
}
if (!existsSync(PAGINE)) {
  console.error(`Cartella delle pagine trascritte non trovata: ${PAGINE}`);
  process.exit(1);
}
const pdf = await getDocument({ data: new Uint8Array(readFileSync(percorsoPdf)), useSystemFonts: true }).promise;
const totale = pdf.numPages;

const [anno, mese] = meseDiEdizione(set.edizione);
const cartella = join(RADICE, set.compagniaSlug, set.ramo, set.prodottoSlug, `ed-${anno}-${mese}`);

// Prima si controlla tutto, poi si scrive: un set mezzo assemblato è peggio di niente.
const mancanti = [];
const attenzioni = [];
const conAncora = [];
const pagineDiDoc = new Map();
for (const doc of set.documenti) {
  if (doc.da < 1 || doc.a > totale || doc.da > doc.a) {
    console.error(`${doc.file}: range ${doc.da}–${doc.a} fuori dal PDF (${totale} pagine)`);
    process.exit(1);
  }
  const pagine = [];
  for (let n = doc.da; n <= doc.a; n++) {
    const file = join(PAGINE, `pag-${String(n).padStart(4, '0')}.md`);
    if (!existsSync(file)) {
      mancanti.push(n);
      continue;
    }
    let corpo = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
    if (/^\[pag\. \d+\]\s*$/m.test(corpo)) {
      conAncora.push(n);
      corpo = corpo.replace(/^\[pag\. \d+\]\s*$/gm, '').trim();
    }
    if (/\[!ATTENZIONE\]/.test(corpo)) attenzioni.push(n);
    pagine.push({ n, corpo });
  }
  pagineDiDoc.set(doc.file, pagine);
}
for (let i = 0; i < set.documenti.length; i++)
  for (let j = i + 1; j < set.documenti.length; j++) {
    const p = set.documenti[i];
    const q = set.documenti[j];
    if (p.da <= q.a && q.da <= p.a) {
      console.error(`${p.file} (${p.da}–${p.a}) e ${q.file} (${q.da}–${q.a}) si sovrappongono`);
      process.exit(1);
    }
  }
if (mancanti.length) {
  console.error(`${mancanti.length} pagine senza trascrizione in ${PAGINE}: ${mancanti.join(', ')}`);
  console.error('Nessun file scritto: un file assente è una pagina che nessuno ha guardato.');
  process.exit(1);
}

// Si riscrivono i documenti dell'edizione da zero; l'INDICE.md, scritto a
// mano dopo l'assemblaggio, resta (rilanciare lo script non deve buttarlo via).
mkdirSync(cartella, { recursive: true });
for (const f of readdirSync(cartella)) if (f.endsWith('.md') && f !== 'INDICE.md') rmSync(join(cartella, f));

for (const doc of set.documenti) {
  const righe = [
    `# ${doc.titolo} — ${nomeCorto(set)}`,
    '',
    `> **Compagnia**: ${set.compagnia} · **Prodotto**: ${set.prodotto} · **Tipologia**: ${doc.titolo}` +
      `${set.modello ? ` · **Modello**: ${set.modello}` : ''} · **Edizione**: ${set.edizione}` +
      ` · **Pagine nel PDF**: ${doc.da}–${doc.a} di ${totale} (file \`${set.pdf}\`)`,
    '',
  ];
  let vuote = 0;
  for (const { n, corpo } of pagineDiDoc.get(doc.file)) {
    righe.push(`[pag. ${n}]`, '');
    if (corpo) righe.push(corpo, '');
    else vuote++;
  }
  writeFileSync(join(cartella, doc.file), righe.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', 'utf8');
  console.log(`  ${doc.file.padEnd(32)} pagine ${doc.da}–${doc.a}${vuote ? ` (${vuote} senza testo)` : ''}`);
}

console.log(`\n${cartella}`);
const fuoriRange = readdirSync(PAGINE)
  .map((f) => Number(f.match(/^pag-(\d{4})\.md$/)?.[1]))
  .filter((n) => n && !set.documenti.some((d) => n >= d.da && n <= d.a));
if (fuoriRange.length) console.log(`Pagine trascritte fuori da ogni documento logico (non entrano): ${fuoriRange.join(', ')}`);
if (conAncora.length) console.log(`Ancore [pag. N] trovate dentro i file-pagina e tolte: ${conAncora.join(', ')}`);
if (attenzioni.length) console.log(`Pagine con [!ATTENZIONE] da riferire: ${attenzioni.join(', ')}`);
else console.log('Nessuna porzione segnalata come illeggibile.');

function nomeCorto(set) {
  return `${set.compagnia.replace(/\s+(S\.p\.A\.|Assicurazioni S\.p\.A\.|Mutua).*$/i, '')} ${set.prodotto}`;
}

function meseDiEdizione(edizione) {
  const m = edizione.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Edizione «${edizione}»: serve gg/mm/aaaa`);
  return [m[3], m[2]];
}
