#!/usr/bin/env node
/**
 * Il secondo testimone dell'ingestion visiva: Mistral OCR legge il PDF
 * (una chiamata sola per l'intero file, $4 ogni 1.000 pagine) e la sua
 * lettura si confronta, pagina per pagina, con la trascrizione fatta a
 * occhio da Claude (`/ingest-visivo`, un file per pagina) e col layer di
 * testo pdfjs. Due lettori indipendenti sbagliano su parole diverse: dove
 * concordano contro la trascrizione c'è un buco certo; dove pdfjs è cieco
 * (testo dentro immagini) l'OCR è l'unico testimone possibile.
 *
 *   node tools/testimone-ocr.mjs <manifesto.json>              # OCR (una volta) + confronto
 *   node tools/testimone-ocr.mjs <manifesto.json> --rifai      # richiama l'OCR anche se c'è già
 *   node tools/testimone-ocr.mjs <manifesto.json> --dettaglio  # elenca anche le parole
 *
 * Il manifesto è quello di `assembla-set.mjs`. La lettura OCR si salva in
 * `local-ingestion/lavorazione-visiva/ocr/<pdf>/pag-NNNN.md` (+ .json grezzo)
 * e non si richiede due volte. Serve MISTRAL_API_KEY in be-node/.env.
 *
 * Esito per pagina:
 *   ok        nessuno scarto che conti
 *   CERTO     numero presente in OCR e in pdfjs, assente nella trascrizione
 *             (o comparso nella trascrizione e assente in entrambi)
 *   guarda    scarto visto da un solo testimone, o parole perse oltre la
 *             tolleranza: la pagina va al secondo sguardo
 * Le pagine senza testo pdfjs sono giudicate dal solo OCR (con tolleranza).
 * Esce con 1 se c'è almeno una pagina da guardare.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const QUI = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(QUI, '..', '.env'));
} catch {
  /* variabili già nell'ambiente */
}
const LOCALE = join(QUI, '..', '..', 'local-ingestion');
const VISIVA = join(LOCALE, 'lavorazione-visiva');

/** Una riga di bordo che torna su tante pagine è cornice, non contenuto. */
const PAGINE_DECORAZIONE = 3;
/** Qualche parola di scarto è rumore (sillabazioni, simboli); oltre, è un buco. */
const PAROLE_TOLLERATE = 5;
/** Sotto questa soglia pdfjs non ha visto abbastanza per fare da testimone. */
const CARATTERI_MINIMI = 40;

const args = process.argv.slice(2);
const manifesto = args[0];
if (!manifesto) {
  console.error('Uso: node tools/testimone-ocr.mjs <manifesto.json> [--rifai] [--dettaglio]');
  process.exit(1);
}
const rifai = args.includes('--rifai');
const dettaglio = args.includes('--dettaglio');

const set = JSON.parse(readFileSync(manifesto, 'utf8'));
const nomePdf = basename(set.pdf, '.pdf');
const percorsoPdf = join(LOCALE, 'originali', set.pdf);
const PAGINE = join(VISIVA, 'pagine', nomePdf);
const OCR = join(VISIVA, 'ocr', nomePdf);
if (!existsSync(percorsoPdf)) {
  console.error(`PDF non trovato: ${percorsoPdf}`);
  process.exit(1);
}
const pdf = await getDocument({ data: new Uint8Array(readFileSync(percorsoPdf)), useSystemFonts: true }).promise;
const totale = pdf.numPages;

/* ------------------------------------------------------------------ OCR */

const fileOcr = (n) => join(OCR, `pag-${String(n).padStart(4, '0')}.json`);
const ocrCompleto = () => {
  for (let n = 1; n <= totale; n++) if (!existsSync(fileOcr(n))) return false;
  return true;
};

if (rifai || !ocrCompleto()) {
  const chiave = process.env.MISTRAL_API_KEY;
  if (!chiave) {
    console.error('MISTRAL_API_KEY mancante in be-node/.env: senza OCR il testimone non può lavorare.');
    process.exit(1);
  }
  mkdirSync(OCR, { recursive: true });
  const b64 = readFileSync(percorsoPdf).toString('base64');
  const t0 = Date.now();
  const risposta = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'mistral-ocr-latest',
      document: { type: 'document_url', document_url: `data:application/pdf;base64,${b64}` },
      table_format: 'markdown',
      extract_header: true,
      extract_footer: true,
      confidence_scores_granularity: 'page',
    }),
  });
  const testo = await risposta.text();
  if (!risposta.ok) {
    console.error(`Mistral OCR: HTTP ${risposta.status}: ${testo.slice(0, 500)}`);
    process.exit(1);
  }
  const esito = JSON.parse(testo);
  for (const pagina of esito.pages) {
    const n = pagina.index + 1;
    writeFileSync(fileOcr(n), JSON.stringify(pagina, null, 1), 'utf8');
    writeFileSync(join(OCR, `pag-${String(n).padStart(4, '0')}.md`), testoOcr(pagina).corpo + '\n', 'utf8');
  }
  console.log(
    `Mistral OCR (${esito.model}): ${esito.pages.length} pagine in ${Date.now() - t0} ms → ${OCR}` +
      (esito.pages.length !== totale ? `  ATTENZIONE: il PDF ha ${totale} pagine` : ''),
  );
} else {
  console.log(`Lettura OCR già presente in ${OCR} (usa --rifai per richiederla di nuovo)`);
}

/**
 * Il testo di una pagina OCR: markdown con le tabelle innestate al posto
 * dei rimandi `[tbl-N.md](tbl-N.md)`, senza i rimandi alle immagini.
 * Header e footer si restituiscono a parte: sono contenuto (il blocco di
 * testa di un DIP) o cornice (il titolo corrente) a seconda che tornino
 * uguali su più pagine, e lo decide chi confronta.
 */
function testoOcr(pagina) {
  let md = pagina.markdown ?? '';
  (pagina.tables ?? []).forEach((t, i) => {
    const id = (t.id ?? `tbl-${i}`).replace(/\.md$/, '');
    const contenuto = t.content ?? t.markdown ?? t.html ?? t.text ?? '';
    const rimando = new RegExp(`\\[${id}\\.md\\]\\(${id}\\.md\\)`, 'g');
    if (rimando.test(md)) md = md.replace(rimando, contenuto);
    else md += `\n\n${contenuto}`;
  });
  md = md.replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, '');
  return {
    corpo: md.trim(),
    header: (pagina.header ?? '').trim(),
    footer: (pagina.footer ?? '').trim(),
    confidenza: pagina.confidence_scores?.average_page_confidence_score,
  };
}

/* ------------------------------------------------------------ confronto */

// Le tre letture di ogni pagina del PDF (servono tutte: la cornice si
// riconosce da ciò che torna uguale su più pagine).
const pagine = new Map();
for (let n = 1; n <= totale; n++) {
  const ocr = testoOcr(JSON.parse(readFileSync(fileOcr(n), 'utf8')));
  const pdfjs = await testoPdfjs(pdf, n);
  const fileClaude = join(PAGINE, `pag-${String(n).padStart(4, '0')}.md`);
  const claude = existsSync(fileClaude) ? readFileSync(fileClaude, 'utf8').replace(/\r\n/g, '\n') : null;
  pagine.set(n, { ocr, pdfjs, claude });
}

// Cornice: righe di bordo (pdfjs), header e footer (OCR) che tornano su più
// pagine, con le cifre mascherate. Si toglie da tutte le letture.
const quante = new Map();
for (const p of pagine.values()) {
  const righe = p.pdfjs.righe;
  const candidate = new Set(
    [...righe.slice(0, 2), ...righe.slice(-2), ...p.ocr.header.split('\n'), ...p.ocr.footer.split('\n')]
      .filter((r) => r.trim().length >= 3 && r.length < 200)
      .map(modelloDiRiga),
  );
  for (const m of candidate) quante.set(m, (quante.get(m) || 0) + 1);
}
const corniceSet = new Set([...quante].filter(([, n]) => n >= PAGINE_DECORAZIONE).map(([m]) => m));

const daGuardare = [];
let senzaTrascrizione = 0;
let senzaPdfjs = 0;
for (const doc of set.documenti) {
  // Il piè di pagina del set torna su tutto il PDF, quello del singolo
  // documento logico solo lì dentro: un DIP Aggiuntivo di due pagine non
  // raggiungerebbe mai la soglia calcolata sull'intero fascicolo.
  const quanteDoc = new Map();
  for (let n = doc.da; n <= doc.a; n++) {
    const p = pagine.get(n);
    const righe = p.pdfjs.righe;
    const candidate = new Set(
      [...righe.slice(0, 2), ...righe.slice(-2), ...p.ocr.header.split('\n'), ...p.ocr.footer.split('\n')]
        .filter((r) => r.trim().length >= 3 && r.length < 200)
        .map(modelloDiRiga),
    );
    for (const m of candidate) quanteDoc.set(m, (quanteDoc.get(m) || 0) + 1);
  }
  const sogliaDoc = Math.max(2, Math.ceil((doc.a - doc.da + 1) * 0.6));
  const cornice = new Set([...corniceSet, ...[...quanteDoc].filter(([, n]) => n >= sogliaDoc).map(([m]) => m)]);

  console.log(`\n${doc.file}  pagine ${doc.da}–${doc.a}`);
  for (let n = doc.da; n <= doc.a; n++) {
    const p = pagine.get(n);
    if (p.claude === null) {
      console.log(`  pag. ${String(n).padStart(4)}  TRASCRIZIONE MANCANTE`);
      senzaTrascrizione++;
      daGuardare.push(n);
      continue;
    }
    const trascritto = conta(p.claude, cornice);
    const ocrTesto = [p.ocr.header, p.ocr.corpo, p.ocr.footer].join('\n');
    // Per i «persi» il testimone va letto senza cornice (nessuno pretende il
    // piè di pagina); per i «comparsi» con tutto, perché un titolo di sezione
    // che torna anche come linguetta non è inventato.
    const lettoOcr = conta(ocrTesto, cornice);
    const lettoOcrGrezzo = conta(ocrTesto, new Set());
    const cieco = p.pdfjs.caratteri < CARATTERI_MINIMI;
    if (cieco) senzaPdfjs++;
    const lettoPdfjs = cieco ? null : conta(p.pdfjs.testo, cornice);
    const lettoPdfjsGrezzo = cieco ? null : conta(p.pdfjs.testo, new Set());

    const persiOcr = differenza(lettoOcr, trascritto);
    const comparsiOcr = differenza(trascritto, lettoOcrGrezzo);
    const persiPdfjs = lettoPdfjs ? differenza(lettoPdfjs, trascritto) : [];
    const comparsiPdfjs = lettoPdfjs ? differenza(trascritto, lettoPdfjsGrezzo) : [];

    const numeriCerti = lettoPdfjs
      ? [...intersezione(persiOcr.filter(haCifre), persiPdfjs.filter(haCifre)), ...intersezione(comparsiOcr.filter(haCifre), comparsiPdfjs.filter(haCifre)).map((t) => `+${t}`)]
      : [];
    const numeriDubbi = lettoPdfjs
      ? [...persiOcr.filter(haCifre).filter((t) => !numeriCerti.includes(t)), ...persiPdfjs.filter(haCifre).filter((t) => !numeriCerti.includes(t))]
      : [...persiOcr.filter(haCifre), ...comparsiOcr.filter(haCifre).map((t) => `+${t}`)];
    // Parole: perse davanti a entrambi i testimoni (o al solo OCR se pdfjs è cieco).
    const parolePerse = lettoPdfjs
      ? intersezione(persiOcr.filter((t) => !haCifre(t)), persiPdfjs.filter((t) => !haCifre(t)))
      : persiOcr.filter((t) => !haCifre(t));

    // Si contano le parole distinte: la stessa intestazione ripetuta quattro
    // volte è un'unificazione di tabella, una frase saltata sono parole diverse.
    const paroleDistinte = new Set(parolePerse).size;
    let esito = 'ok';
    if (numeriCerti.length) esito = 'CERTO';
    else if (numeriDubbi.length || paroleDistinte > PAROLE_TOLLERATE) esito = 'guarda';
    if (esito !== 'ok') daGuardare.push(n);

    const note = [];
    if (cieco) note.push('pdfjs cieco: giudica il solo OCR');
    if (p.ocr.confidenza !== undefined) note.push(`conf. OCR ${p.ocr.confidenza.toFixed(2)}`);
    if (numeriCerti.length) note.push(`numeri CERTI: ${numeriCerti.slice(0, 10).join(' ')}`);
    if (numeriDubbi.length) note.push(`numeri da un solo testimone: ${numeriDubbi.slice(0, 10).join(' ')}`);
    if (paroleDistinte > PAROLE_TOLLERATE || (dettaglio && parolePerse.length))
      note.push(`${paroleDistinte} parole perse${dettaglio ? `: ${[...new Set(parolePerse)].slice(0, 15).join(' ')}` : ''}`);
    if (dettaglio && comparsiOcr.filter((t) => !haCifre(t)).length)
      note.push(`comparse vs OCR: ${comparsiOcr.filter((t) => !haCifre(t)).slice(0, 10).join(' ')}`);
    console.log(`  pag. ${String(n).padStart(4)}  ${esito.padEnd(6)} ${note.join(' | ')}`);
  }
}

console.log(`\n${senzaPdfjs ? `${senzaPdfjs} pagine senza testo pdfjs (coperte dal solo OCR). ` : ''}${senzaTrascrizione ? `${senzaTrascrizione} pagine senza trascrizione. ` : ''}`.trim());
if (daGuardare.length) {
  console.log(`Pagine per il secondo sguardo: ${[...new Set(daGuardare)].sort((a, b) => a - b).join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Nessuna pagina da guardare: trascrizione e OCR concordano su tutti i numeri.');
}

/* --------------------------------------------------------------- pdfjs */

async function testoPdfjs(pdf, n) {
  const pagina = await pdf.getPage(n);
  const fr = (await pagina.getTextContent()).items
    .filter((i) => typeof i.str === 'string' && i.str.trim())
    .map((i) => ({ testo: i.str, x: i.transform[4], y: i.transform[5], larghezza: i.width || 0 }));
  if (!fr.length) return { testo: '', righe: [], caratteri: 0 };
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
  const righe = gruppi.map((r) => {
    r.sort((p, q) => p.x - q.x);
    let s = '';
    let fine;
    for (const f of r) {
      if (fine !== undefined && f.x - fine > 1 && !s.endsWith(' ')) s += ' ';
      s += f.testo;
      fine = f.x + f.larghezza;
    }
    return s.replace(/[ \t]+/g, ' ').trim();
  });
  const testo = righe.join('\n');
  return { testo, righe, caratteri: testo.length };
}

/* -------------------------------------------------------------- token */

function conta(testo, cornice) {
  const c = new Map();
  const righe = testo.split('\n').filter((r) => !cornice.has(modelloDiRiga(r)));
  for (const t of spezza(righe.join('\n'))) c.set(t, (c.get(t) || 0) + 1);
  return c;
}

function spezza(testo) {
  return testo
    .normalize('NFKC')
    .replace(/­/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/-\s*\n\s*/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z]+[^>]*>/gi, ' ')
    .replace(/[*_>#|]/g, ' ')
    .toLowerCase()
    .split(/[\s.,;:!?()[\]"'/\\•●▪·◦○§«»✓✗]+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 1 || /\d/.test(t));
}

function modelloDiRiga(riga) {
  return riga
    .replace(/[.·]{3,}/g, '…')
    .replace(/[–—]/g, '-') // lo stesso piè di pagina cambia trattino da una pagina all'altra
    .replace(/[*_>#|]/g, '')
    .replace(/\d+/g, '@')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function differenza(a, b) {
  const fuori = [];
  for (const [t, n] of a) {
    const m = b.get(t) || 0;
    for (let i = 0; i < n - m; i++) fuori.push(t);
  }
  return fuori;
}

function intersezione(a, b) {
  const resto = new Map();
  for (const t of b) resto.set(t, (resto.get(t) || 0) + 1);
  const fuori = [];
  for (const t of a) {
    if (!resto.get(t)) continue;
    resto.set(t, resto.get(t) - 1);
    fuori.push(t);
  }
  return fuori;
}

function haCifre(t) {
  return /\d/.test(t);
}
