#!/usr/bin/env node
/**
 * L'oracolo dell'ingestion: confronta un `.md` dell'archivio con le pagine
 * del PDF da cui è nato, e dice cosa si è perso e cosa è comparso dal nulla.
 *
 *   node tools/verifica-fedelta.mjs <file.md>
 *   node tools/verifica-fedelta.mjs <cartella>          # tutto l'albero
 *   node tools/verifica-fedelta.mjs <file.md> --dettaglio
 *
 * Serve perché le due vie di conversione sbagliano in modo opposto e
 * ugualmente invisibile: la macchina intreccia le colonne, il modello che
 * trascrive può saltare un pallino o arrotondare una cifra. Il confronto è
 * fra sacchetti di parole, quindi non guarda l'ordine: va bene per
 * entrambe, e non si lamenta se una tabella è stata riscritta in Markdown.
 *
 * Quello che NON può fare: certificare una pagina il cui testo sta dentro
 * un'immagine, perché lì pdfjs non vede niente. Quelle pagine le dichiara
 * sospese, ed è l'unica categoria che resta senza rete.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument, OPS } = require('pdfjs-dist/legacy/build/pdf.mjs');

const QUI = dirname(fileURLToPath(import.meta.url));
const ORIGINALI = join(QUI, '..', '..', 'local-ingestion', 'originali');

const args = process.argv.slice(2);
const bersaglio = args[0];
if (!bersaglio) {
  console.error('Uso: node tools/verifica-fedelta.mjs <file.md | cartella> [--dettaglio]');
  process.exit(1);
}
const dettaglio = args.includes('--dettaglio');

/**
 * Su quante pagine deve tornare una riga di bordo perché sia decorazione.
 * Soglia assoluta e bassa: un titolo corrente vive solo dentro la sua
 * sezione, quindi in un documento di cento pagine può comparirne su tre.
 * Il rischio di mascherare contenuto è nullo, perché le righe di bordo si
 * tolgono da entrambe le parti del confronto.
 */
const PAGINE_DECORAZIONE = 3;
/** Sotto questa soglia di caratteri pdfjs non ha visto abbastanza per giudicare. */
const CARATTERI_MINIMI = 40;
/** Qualche parola di scarto è rumore di normalizzazione; oltre, è un buco. */
const PAROLE_TOLLERATE = 3;

const files = statSync(bersaglio).isDirectory() ? cercaMd(bersaglio) : [bersaglio];
let documenti = 0;
let conProblemi = 0;
const pdfAperti = new Map();
const decorazioni = new Map();
const linguette = new Map();

for (const file of files.sort()) {
  const testo = readFileSync(file, 'utf8');
  const intestazione = testo.match(/\*\*Pagine nel PDF\*\*:\s*(\d+)\s*[–-]\s*(\d+)\s+di\s+(\d+)\s+\(file `([^`]+)`\)/);
  if (!intestazione) {
    console.log(`?  ${etichetta(file)}: header senza «Pagine nel PDF», non verificabile`);
    conProblemi++;
    continue;
  }
  documenti++;
  const da = Number(intestazione[1]);
  const a = Number(intestazione[2]);
  const nomePdf = intestazione[4];

  const pdf = await apri(join(ORIGINALI, nomePdf));
  if (!pdf) {
    console.log(`?  ${etichetta(file)}: PDF «${nomePdf}» non trovato in originali/`);
    conProblemi++;
    continue;
  }

  const perPagina = spezzaPerAncora(testo);
  const ruotatiRipetuti = await linguetteDi(pdf, nomePdf);
  const grezze = new Map();
  for (let n = da; n <= a; n++) grezze.set(n, await paginaGrezza(pdf, n, ruotatiRipetuti));
  // Due livelli: il piè di pagina del set torna su tutto il PDF, quello del
  // singolo documento logico (un DIP è lungo due pagine) solo lì dentro.
  const decorazione = new Set([
    ...(await decorazioneDi(pdf, nomePdf)),
    ...trovaDecorazione([...grezze.values()], Math.max(2, grezze.size * 0.6)),
  ]);

  const guai = [];
  let sospese = 0;
  let ancoreMancanti = 0;
  for (let n = da; n <= a; n++) {
    const grezza = grezze.get(n);
    if (!perPagina.has(n)) {
      ancoreMancanti++;
      continue;
    }
    if (grezza.figura && grezza.caratteri < CARATTERI_MINIMI) {
      sospese++;
      continue;
    }
    const attesi = conta(grezza.testo, decorazione);
    const trovati = conta(perPagina.get(n), decorazione);
    const persi = differenza(attesi, trovati);
    const inventati = differenza(trovati, attesi);
    const numeriPersi = persi.filter(haCifre);
    const numeriInventati = inventati.filter(haCifre);
    const parolePerse = persi.filter((t) => !haCifre(t));
    if (numeriPersi.length || numeriInventati.length || parolePerse.length > PAROLE_TOLLERATE)
      guai.push({ n, numeriPersi, numeriInventati, parolePerse, inventate: inventati.filter((t) => !haCifre(t)) });
  }

  const rotto = guai.length > 0 || ancoreMancanti > 0;
  if (rotto) conProblemi++;
  const note = [`pagine ${da}–${a}`];
  if (sospese) note.push(`${sospese} sospese (testo in figura)`);
  if (ancoreMancanti) note.push(`${ancoreMancanti} ancore MANCANTI`);
  if (guai.length) note.push(`${guai.length} pagine con scarti`);
  console.log(`${rotto ? '!!' : 'ok'} ${etichetta(file)} — ${note.join(', ')}`);
  for (const g of guai) {
    const pezzi = [];
    if (g.numeriPersi.length) pezzi.push(`numeri persi: ${g.numeriPersi.slice(0, 8).join(' ')}`);
    if (g.numeriInventati.length) pezzi.push(`numeri comparsi: ${g.numeriInventati.slice(0, 8).join(' ')}`);
    if (g.parolePerse.length > PAROLE_TOLLERATE)
      pezzi.push(`${g.parolePerse.length} parole perse${dettaglio ? `: ${g.parolePerse.slice(0, 15).join(' ')}` : ''}`);
    if (dettaglio && g.inventate.length) pezzi.push(`comparse: ${g.inventate.slice(0, 10).join(' ')}`);
    console.log(`     pag. ${g.n}: ${pezzi.join(' | ')}`);
  }
}
console.log(`\n${documenti - conProblemi}/${documenti} documenti puliti`);
if (conProblemi) process.exitCode = 1;

function etichetta(f) {
  return f.replace(/\\/g, '/').split('/').slice(-4).join('/');
}

function cercaMd(radice) {
  const fuori = [];
  (function scava(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) scava(p);
      else if (n.endsWith('.md') && n !== 'INDICE.md') fuori.push(p);
    }
  })(radice);
  return fuori;
}

async function apri(percorso) {
  if (pdfAperti.has(percorso)) return pdfAperti.get(percorso);
  let pdf = null;
  try {
    pdf = await getDocument({ data: new Uint8Array(readFileSync(percorso)), useSystemFonts: true }).promise;
  } catch {
    /* manca o è illeggibile */
  }
  pdfAperti.set(percorso, pdf);
  return pdf;
}

/**
 * Le scritte ruotate che tornano su più pagine sono linguette di margine:
 * decorazione, che `prepara-set.mjs` toglie e che quindi va tolta anche di
 * qua, se no risulterebbero perse a torto. Una scritta ruotata che compare
 * una volta sola resta, perché può essere l'intestazione di una tabella.
 */
async function linguetteDi(pdf, nome) {
  if (linguette.has(nome)) return linguette.get(nome);
  const quante = new Map();
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const viste = new Set(
      (await pagina.getTextContent()).items
        .filter((i) => typeof i.str === 'string' && i.str.trim())
        .filter((i) => Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01)
        .map((i) => i.str.trim()),
    );
    for (const t of viste) quante.set(t, (quante.get(t) || 0) + 1);
  }
  const fuori = new Set();
  for (const [t, n] of quante) if (n >= PAGINE_DECORAZIONE) fuori.add(t);
  linguette.set(nome, fuori);
  return fuori;
}

/** Testo grezzo di una pagina, più il fatto che ci sia una figura grande. */
async function paginaGrezza(pdf, n, ruotatiDaTogliere = new Set()) {
  if (n > pdf.numPages) return { testo: '', righe: [], bordi: [], caratteri: 0, figura: false };
  const pagina = await pdf.getPage(n);
  const items = (await pagina.getTextContent())
    .items.filter((i) => typeof i.str === 'string')
    .filter(
      (i) =>
        !(
          (Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01) &&
          ruotatiDaTogliere.has(i.str.trim())
        ),
    );
  const righe = ricostruisciRighe(items, pagina.view[2] - pagina.view[0]);
  const testo = righe.join('\n');
  const ops = await pagina.getOperatorList();
  let figura = false;
  for (let k = 0; k < ops.fnArray.length; k++) {
    if (ops.fnArray[k] !== OPS.paintImageXObject && ops.fnArray[k] !== OPS.paintJpegXObject) continue;
    const arg = ops.argsArray[k] || [];
    if ((Number(arg[1]) || 0) * (Number(arg[2]) || 0) >= 200 * 200) figura = true;
  }
  // Le righe di bordo sono le uniche candidate a essere intestazione o piè
  // di pagina: due in testa e due in coda bastano a coprire i casi visti.
  const bordi = [...righe.slice(0, 2), ...righe.slice(-2)];
  return { testo, righe, bordi, caratteri: testo.trim().length, figura };
}

/**
 * Le righe della pagina, raggruppando i frammenti per y come fa
 * l'estrattore. I frammenti attaccati si concatenano senza spazio: il
 * trattino di sillabazione a fine riga è spesso un frammento a sé, e se ci
 * si infila uno spazio («modifi -») la parola non si riattacca più con
 * quella della riga dopo, e risulta persa a torto.
 */
function ricostruisciRighe(items, larghezza) {
  const frammenti = items
    .filter((i) => i.str.trim())
    .map((i) => ({ testo: i.str, x: i.transform[4], y: i.transform[5], larghezza: i.width || 0 }));
  if (!frammenti.length) return [];
  // Su una pagina a due colonne le righe attraversano entrambe, e la parola
  // sillabata a fine riga sinistra si riattaccherebbe alla colonna destra
  // («ca-» + «danni causati» = «cadanni»): là si legge una colonna per volta.
  const corridoio = cercaCorridoio(frammenti, larghezza);
  if (corridoio === null) return righeDiFascia(frammenti);
  return [
    ...righeDiFascia(frammenti.filter((f) => f.x + f.larghezza <= corridoio)),
    ...righeDiFascia(frammenti.filter((f) => f.x + f.larghezza > corridoio)),
  ];
}

function righeDiFascia(frammenti) {
  if (!frammenti.length) return [];
  const ordinati = [...frammenti].sort((p, q) => q.y - p.y || p.x - q.x);
  const righe = [];
  let corrente = [];
  let yCorrente = ordinati[0].y;
  for (const f of ordinati) {
    if (Math.abs(f.y - yCorrente) > 2) {
      righe.push(corrente);
      corrente = [];
      yCorrente = f.y;
    }
    corrente.push(f);
  }
  righe.push(corrente);
  return righe.map(componiRiga).filter(Boolean);
}

/**
 * La x del corridoio fra le colonne, o null se la pagina è a una colonna.
 * Stesso criterio di tools/sonda-pagine.mjs: si tiene il taglio che
 * massimizza il lato più debole fra le righe che non lo attraversano.
 */
function cercaCorridoio(frammenti, larghezza) {
  const righe = righeCrude(frammenti);
  if (righe.length < 15) return null;
  let migliore = { peso: 0, taglio: null };
  for (let q = 0.3; q <= 0.7; q += 0.01) {
    const taglio = larghezza * q;
    let sinistra = 0;
    let destra = 0;
    for (const riga of righe) {
      if (riga.some((f) => f.x < taglio && f.x + f.larghezza > taglio)) continue;
      const haSinistra = riga.some((f) => f.x + f.larghezza <= taglio);
      const haDestra = riga.some((f) => f.x > taglio);
      if (haDestra && !haSinistra) destra++;
      else if (haSinistra && !haDestra) sinistra++;
    }
    const peso = Math.min(sinistra, destra);
    if (peso > migliore.peso) migliore = { peso, taglio };
  }
  return migliore.peso >= 3 ? migliore.taglio : null;
}

function righeCrude(frammenti) {
  const ordinati = [...frammenti].sort((p, q) => q.y - p.y || p.x - q.x);
  const righe = [];
  let corrente = [];
  let yCorrente = ordinati[0].y;
  for (const f of ordinati) {
    if (Math.abs(f.y - yCorrente) > 2) {
      righe.push(corrente);
      corrente = [];
      yCorrente = f.y;
    }
    corrente.push(f);
  }
  righe.push(corrente);
  return righe;
}

/** Concatena i frammenti di una riga mettendo lo spazio solo dove c'è uno stacco. */
function componiRiga(riga) {
  riga.sort((p, q) => p.x - q.x);
  let testo = '';
  let fineX;
  for (const f of riga) {
    if (fineX !== undefined && f.x - fineX > 1 && !testo.endsWith(' ') && !f.testo.startsWith(' ')) testo += ' ';
    testo += f.testo;
    fineX = f.x + f.larghezza;
  }
  return testo.replace(/[ \t]+/g, ' ').trim();
}

/**
 * Intestazioni e piè di pagina si omettono di proposito (regola 5 delle
 * ISTRUZIONI), quindi vanno tolti da entrambe le parti prima di confrontare.
 * Si riconoscono da due segni insieme:
 *
 *  - la **posizione**: solo le righe di bordo, in testa o in coda alla
 *    pagina, sono candidate. Così una riga di contenuto non sparisce mai;
 *  - il **modello**: la riga con le cifre mascherate, perché il piè porta
 *    dentro il numero di pagina («# di #») e il titolo corrente il numero
 *    di sezione, e cambiano a ogni foglio.
 *
 * La soglia è bassa di proposito: un titolo corrente vive solo dentro la
 * sua sezione, quindi torna su una frazione piccola del documento.
 */
/**
 * La decorazione si cerca sull'intero PDF, non nelle sole pagine del
 * documento logico: un DIP è lungo due pagine e il suo piè di pagina non
 * farebbe mai in tempo a ripetersi abbastanza. Su PDF lunghi basta un
 * campione di pagine ben distribuito.
 */
async function decorazioneDi(pdf, nome) {
  if (decorazioni.has(nome)) return decorazioni.get(nome);
  const tutte = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const righe = ricostruisciRighe((await pagina.getTextContent()).items.filter((i) => typeof i.str === "string"), pagina.view[2] - pagina.view[0]);
    tutte.push({ bordi: [...righe.slice(0, 2), ...righe.slice(-2)] });
  }
  const trovata = trovaDecorazione(tutte, PAGINE_DECORAZIONE);
  decorazioni.set(nome, trovata);
  return trovata;
}

function trovaDecorazione(pagine, sogliaEsplicita) {
  const quante = new Map();
  for (const p of pagine) {
    const viste = new Set(p.bordi.filter((r) => r.length >= 3 && r.length < 200).map(modelloDiRiga));
    for (const m of viste) quante.set(m, (quante.get(m) || 0) + 1);
  }
  const soglia = sogliaEsplicita ?? PAGINE_DECORAZIONE;
  const modelli = new Set();
  for (const [m, n] of quante) if (n >= soglia) modelli.add(m);
  return modelli;
}

/** La riga con ogni gruppo di cifre ridotto a #: «pag. 3 di 64» e «pag. 4 di 64» diventano lo stesso. */
function modelloDiRiga(riga) {
  return riga
    .replace(/[.·]{3,}/g, '…')   // i puntini di guida dell'indice non si contano uno per uno
    .replace(/[–—]/g, '-')       // lo stesso piè di pagina cambia trattino da una pagina all'altra
    .replace(/[*_>#|]/g, '')     // il Markdown non deve far divergere il modello dal grezzo
    .replace(/\d+/g, '@')        // e il numero di pagina cambia a ogni foglio
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function spezzaPerAncora(md) {
  const per = new Map();
  const parti = md.split(/^\[pag\. (\d+)\]\s*$/m);
  for (let i = 1; i < parti.length; i += 2) {
    const n = Number(parti[i]);
    per.set(n, (per.get(n) || '') + '\n' + (parti[i + 1] || ''));
  }
  return per;
}

/** Normalizza e conta i token, buttando via le righe di decorazione e la sintassi Markdown. */
function conta(testo, decorazione) {
  const conteggio = new Map();
  const righe = testo.split('\n').filter((r) => !decorazione.has(modelloDiRiga(r)));
  for (const t of spezza(righe.join('\n'))) conteggio.set(t, (conteggio.get(t) || 0) + 1);
  return conteggio;
}

function spezza(testo) {
  return testo
    .normalize('NFKC')
    .replace(/­/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/-\s*\n\s*/g, '')
    .replace(/<br\s*\/?>/gi, ' ') // le celle su più righe usano <br>: non è una parola
    .replace(/[*_>#|]/g, ' ')
    .toLowerCase()
    .split(/[\s.,;:!?()[\]"'/\\•●▪·◦○§«»]+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 1 || /\d/.test(t));
}

function differenza(a, b) {
  const fuori = [];
  for (const [t, n] of a) {
    const m = b.get(t) || 0;
    for (let i = 0; i < n - m; i++) fuori.push(t);
  }
  return fuori;
}

function haCifre(t) {
  return /\d/.test(t);
}
