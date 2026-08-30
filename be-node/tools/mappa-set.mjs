#!/usr/bin/env node
/**
 * Propone la mappa dei documenti logici di un set informativo leggendo i
 * piè di pagina: le pagine consecutive con lo stesso piè di pagina (cifre
 * mascherate: «DIP Ed. @/@ - … - @ di @») sono lo stesso documento. È un
 * suggerimento per la skill `/ingest-visivo`, che poi conferma i confini
 * guardando le pagine: la mappa la decide chi guarda, non il piè di pagina.
 *
 *   node tools/mappa-set.mjs <file.pdf>
 *   node tools/mappa-set.mjs <file.pdf> --manifesto <uscita.json> \
 *        --compagnia "Generali Italia S.p.A." --compagnia-slug generali --ramo auto \
 *        --prodotto "Contratto Base Autovetture" --prodotto-slug contratto-base-autovetture \
 *        [--edizione 01/07/2025] [--modello GP014S1725]
 *
 * Stampa: la copertina (per compagnia, prodotto, modello, edizione), i
 * gruppi di pagine col loro piè di pagina e la prima riga di testo, il
 * nome di file proposto per ciascun documento (dal piè di pagina: «DIP
 * Aggiuntivo» → dip-aggiuntivo.md, «DIP» → dip.md, «Condizioni» →
 * condizioni-di-assicurazione.md, «Glossario», «Privacy»…) e, se richiesto,
 * scrive lo scheletro del manifesto. Le pagine bianche fra due documenti
 * restano fuori; una pagina bianca dentro un documento (il «2 di 17»
 * vuoto) ci resta dentro.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('Uso: node tools/mappa-set.mjs <file.pdf> [--manifesto <uscita.json> --compagnia … --compagnia-slug … --ramo … --prodotto … --prodotto-slug … [--edizione gg/mm/aaaa] [--modello …]]');
  process.exit(1);
}
const opzione = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};

const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
const totale = pdf.numPages;

const pagine = [];
for (let n = 1; n <= totale; n++) {
  const righe = await righePagina(pdf, n);
  // «Pagina lasciata intenzionalmente bianca» è una pagina bianca a tutti gli effetti.
  const bianca = !righe.length || (righe.length <= 2 && /intenzionalmente\s+bianca|pagina\s+bianca/i.test(righe.join(' ')));
  pagine.push({ n, righe: bianca ? [] : righe });
}

// Firma di pagina: la riga di bordo (in coda, poi in testa) che porta «N di M»
// (solo «di»: «07/2025» è una data) o comunque l'ultima riga, cifre mascherate.
const DI_N = /\b(\d{1,3})\s+di\s+(\d{1,3})\b/i;
for (const p of pagine) {
  const bordo = [...p.righe.slice(-3).reverse(), ...p.righe.slice(0, 2)];
  const conDi = bordo.find((r) => DI_N.test(r));
  const riga = conDi ?? p.righe[p.righe.length - 1] ?? '';
  // Con «N di M» la firma è il totale M: il titolo corrente accanto cambia
  // lato fra pagine pari e dispari («GLOSSARIO 1 di 36» / «2 di 36 GLOSSARIO»)
  // e sezione dopo sezione, il totale no. Senza, resta l'ultima riga.
  p.diN = conDi?.match(DI_N);
  p.firma = p.righe.length ? (p.diN ? `di${p.diN[2]}` : modello(riga)) : '';
  p.pieDiPagina = riga;
}

// Gruppi di pagine consecutive con la stessa firma; con «N di M» il gruppo
// riparte anche quando N torna indietro (due documenti della stessa
// lunghezza uno dietro l'altro). Le bianche si attaccano al gruppo in corso
// solo se la pagina dopo ha ancora la stessa firma.
const gruppi = [];
for (let i = 0; i < pagine.length; i++) {
  const p = pagine[i];
  const ultimo = gruppi[gruppi.length - 1];
  if (!p.righe.length) {
    const prossima = pagine[i + 1];
    if (ultimo && prossima && prossima.firma === ultimo.firma && ultimo.firma) ultimo.a = p.n;
    else gruppi.push({ da: p.n, a: p.n, firma: '', bianca: true, esempio: '', titolo: '' });
    continue;
  }
  const riparte = p.diN && ultimo?.ultimoN !== undefined && Number(p.diN[1]) <= ultimo.ultimoN;
  if (ultimo && !ultimo.bianca && ultimo.firma === p.firma && p.firma && !riparte) {
    ultimo.a = p.n;
    if (p.diN) ultimo.ultimoN = Number(p.diN[1]);
    continue;
  }
  gruppi.push({
    da: p.n,
    a: p.n,
    firma: p.firma,
    esempio: p.pieDiPagina,
    titolo: primaRigaUtile(p.righe),
    testa: p.righe.slice(0, 4).join(' '),
    diN: p.diN,
    ultimoN: p.diN ? Number(p.diN[1]) : undefined,
  });
}

console.log(`# ${basename(file)} — ${totale} pagine\n`);
console.log('## Copertina (pag. 1)');
for (const r of pagine[0].righe.slice(0, 25)) console.log(`  ${r}`);
const indizi = pagine[0].righe.join(' ').match(/\b\d{2}\/\d{2}\/\d{4}\b|\bEd\.?\s*\S+|\bMod\.?\s*[A-Z0-9/.-]+|\bedizione\s+\S+/gi);
if (indizi) console.log(`  → indizi: ${[...new Set(indizi)].join(' · ')}`);

// La bianca in coda a un documento («17 di 17» vuota) gli appartiene: se il
// piè di pagina promette una pagina in più e subito dopo c'è una bianca sola,
// il documento si allunga fin lì.
for (let i = 0; i < gruppi.length - 1; i++) {
  const g = gruppi[i];
  const dopo = gruppi[i + 1];
  if (g.bianca || !g.diN || !dopo.bianca || dopo.a !== dopo.da) continue;
  if (Number(g.diN[2]) === g.a - g.da + 2) {
    g.a = dopo.a;
    gruppi.splice(i + 1, 1);
  }
}

// Nome di file per gruppo. Un set ha una sola «Condizioni»: se nessun piè di
// pagina la nomina (AXA: «Contratto Base Autovetture - edizione 05/2025 -
// pag. 1 di 23»), è il gruppo più lungo fra quelli senza nome.
// Col piè di pagina il nome viene da lì; senza, dalla testa della pagina
// (l'ultima riga è contenuto: a pag. 3 di un DIP Unipol dice «vedasi il DIP
// aggiuntivo» e ingannerebbe).
for (const g of gruppi) {
  if (g.bianca) continue;
  g.nome = g.diN ? nomeFile(g.esempio) : 'altro.md';
  if (g.nome === 'altro.md') g.nome = nomeFile(g.testa);
}
// Pagine consecutive senza «N di M» (il DIP Unipol non ha piè di pagina)
// sono un documento solo, col nome della prima che ne ha uno.
for (let i = 0; i < gruppi.length - 1; i++) {
  const g = gruppi[i];
  const dopo = gruppi[i + 1];
  if (g.bianca || dopo.bianca || g.diN || dopo.diN) continue;
  g.a = dopo.a;
  if (g.nome === 'altro.md') g.nome = dopo.nome;
  gruppi.splice(i + 1, 1);
  i--;
}
// Una pagina sola senza numero, subito dopo un DIP o DIP aggiuntivo numerato
// e prima di una bianca o di un altro documento, è la sua coda (la quarta
// pagina di un DIP aggiuntivo «di 3»).
for (let i = 1; i < gruppi.length; i++) {
  const g = gruppi[i];
  const prima = gruppi[i - 1];
  if (g.bianca || g.diN || g.a !== g.da || g.nome !== 'altro.md') continue;
  if (prima.bianca || !prima.diN || !['dip.md', 'dip-aggiuntivo.md'].includes(prima.nome)) continue;
  prima.a = g.a;
  gruppi.splice(i, 1);
  i--;
}
// Un set ha una sola «Condizioni», ed è il gruppo più lungo: se nessun piè
// di pagina la nomina, è il più lungo fra i senza nome o «glossario» (un
// glossario di trenta pagine non esiste); se la nominano in più d'uno
// (una scheda informativa AXA che parla di condizioni), resta al più lungo.
{
  const candidati = gruppi.filter(
    (g) => !g.bianca && (g.nome === 'condizioni-di-assicurazione.md' || (['altro.md', 'glossario.md'].includes(g.nome) && g.a - g.da + 1 >= 5)),
  );
  const piuLungo = [...candidati].sort((p, q) => q.a - q.da - (p.a - p.da))[0];
  for (const g of candidati) {
    if (g === piuLungo) g.nome = 'condizioni-di-assicurazione.md';
    else if (g.nome === 'condizioni-di-assicurazione.md') g.nome = 'altro.md';
  }
}
// Copertina interna e indice delle Condizioni stanno subito prima del corpo:
// una pagina sola, senza numero o col numero della prima, che parla di
// «condizioni» o «indice», si accoda alle Condizioni.
for (let i = gruppi.length - 1; i > 0; i--) {
  const g = gruppi[i];
  if (g.bianca || g.nome !== 'condizioni-di-assicurazione.md') continue;
  let j = i - 1;
  while (j >= 0 && !gruppi[j].bianca && gruppi[j].a === gruppi[j].da && /condizioni|indice|glossario/i.test(gruppi[j].testa)) {
    g.da = gruppi[j].da;
    g.esempio = gruppi[j].esempio || g.esempio;
    g.titolo = gruppi[j].titolo;
    gruppi.splice(j, 1);
    i--;
    j--;
  }
}

// Un gruppo di una pagina sola senza «N di M» (copertina, retro di copertina,
// foglio di cortesia) è dubbio e resta fuori dallo scheletro, ma si stampa
// perché sia chi guarda a decidere. Un fascicolo può anche partire col DIP.
const visti = new Map();
for (const g of gruppi) {
  if (g.bianca) continue;
  g.dubbio = g.a === g.da && !g.diN && g.nome === 'altro.md';
  if (g.dubbio) continue;
  const k = visti.get(g.nome) || 0;
  visti.set(g.nome, k + 1);
  if (k) g.nome = g.nome.replace(/\.md$/, `-${k + 1}.md`);
}

console.log('\n## Gruppi di pagine per piè di pagina');
const documenti = [];
for (const g of gruppi) {
  if (g.bianca) {
    console.log(`  ${String(g.da).padStart(4)}–${String(g.a).padEnd(4)} (bianca)`);
    continue;
  }
  const lunghezza = g.a - g.da + 1;
  const attese = g.diN ? Number(g.diN[2]) : undefined;
  const avviso = attese && attese !== lunghezza ? `  ATTENZIONE: il piè di pagina dice «di ${attese}», il gruppo è di ${lunghezza}` : '';
  const etichetta = g.dubbio ? (g.da === 1 ? '(copertina?)' : '(dubbio: fuori dallo scheletro)') : g.nome;
  console.log(`  ${String(g.da).padStart(4)}–${String(g.a).padEnd(4)} ${etichetta.padEnd(32)} «${g.esempio.slice(0, 90)}»${avviso}`);
  console.log(`            prima riga: ${g.titolo.slice(0, 100)}`);
  if (!g.dubbio) documenti.push({ file: g.nome, titolo: titoloDi(g.nome), da: g.da, a: g.a });
}

const uscita = opzione('--manifesto');
if (uscita) {
  const manifesto = {
    compagnia: opzione('--compagnia') ?? '',
    compagniaSlug: opzione('--compagnia-slug') ?? '',
    ramo: opzione('--ramo') ?? 'auto',
    prodotto: opzione('--prodotto') ?? '',
    prodottoSlug: opzione('--prodotto-slug') ?? '',
    modello: opzione('--modello') ?? '',
    edizione: opzione('--edizione') ?? '',
    pdf: basename(file),
    documenti,
  };
  writeFileSync(uscita, JSON.stringify(manifesto, null, 2) + '\n', 'utf8');
  console.log(`\nScheletro del manifesto scritto in ${uscita}: da verificare guardando le pagine di confine, e da completare dove è vuoto.`);
}

function nomeFile(testo) {
  const t = testo.toLowerCase();
  if (/dip\s*aggiuntivo|\bdipa\b|\bdpa\b|precontrattuale aggiuntivo/.test(t)) return 'dip-aggiuntivo.md';
  if (/\bdip\b|documento informativo precontrattuale/.test(t)) return 'dip.md';
  if (/condizioni|norme che regolano|\bcga\b/.test(t)) return 'condizioni-di-assicurazione.md';
  if (/glossario/.test(t)) return 'glossario.md';
  if (/privacy|trattamento dei dati/.test(t)) return 'informativa-privacy.md';
  if (/riferimenti utili|numeri utili|contatti/.test(t)) return 'riferimenti-utili.md';
  return 'altro.md';
}

function titoloDi(nome) {
  return {
    'altro-2.md': 'Altro',
    'dip.md': 'DIP Danni',
    'dip-aggiuntivo.md': 'DIP Aggiuntivo R.C. Auto',
    'condizioni-di-assicurazione.md': 'Condizioni di Assicurazione',
    'glossario.md': 'Glossario',
    'informativa-privacy.md': 'Informativa privacy',
    'riferimenti-utili.md': 'Riferimenti utili',
  }[nome] ?? 'Altro';
}

function primaRigaUtile(righe) {
  return righe.find((r) => r.length > 8 && !/\b\d+\s*di\s*\d+\b/.test(r)) ?? righe[0] ?? '';
}

/**
 * Cifre mascherate, e via spazi e punteggiatura: lo stesso piè di pagina
 * cambia crenatura («A uto»), punto («ED» / «ED.») e trattino da una pagina
 * all'altra, e non deve spezzare il documento.
 */
function modello(riga) {
  return riga
    .toLowerCase()
    .replace(/\d+/g, '@')
    .replace(/[^a-z@àèéìòù]/g, '');
}

async function righePagina(pdf, n) {
  const pagina = await pdf.getPage(n);
  const fr = (await pagina.getTextContent()).items
    .filter((i) => typeof i.str === 'string' && i.str.trim())
    // le linguette ruotate non sono piè di pagina
    .filter((i) => Math.abs(i.transform[1]) < 0.01 && Math.abs(i.transform[2]) < 0.01)
    .map((i) => ({ testo: i.str, x: i.transform[4], y: i.transform[5], larghezza: i.width || 0 }));
  if (!fr.length) return [];
  fr.sort((p, q) => q.y - p.y || p.x - q.x);
  const gruppi = [];
  let corrente = [];
  let yC = fr[0].y;
  for (const f of fr) {
    if (Math.abs(f.y - yC) > 2) {
      gruppi.push(corrente);
      corrente = [];
      yC = f.y;
    }
    corrente.push(f);
  }
  gruppi.push(corrente);
  return gruppi
    .map((r) => {
      r.sort((p, q) => p.x - q.x);
      let s = '';
      let fine;
      for (const f of r) {
        if (fine !== undefined && f.x - fine > 1 && !s.endsWith(' ')) s += ' ';
        s += f.testo;
        fine = f.x + f.larghezza;
      }
      return s.replace(/[ \t]+/g, ' ').trim();
    })
    .filter(Boolean);
}
