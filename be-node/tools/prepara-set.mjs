#!/usr/bin/env node
/**
 * Prepara l'albero di lavorazione di un set informativo partendo da un
 * manifesto, facendo tutto ciò che si può fare senza guardare le pagine:
 * estrazione per range, header nel formato delle ISTRUZIONI, ancore
 * `[pag. N]`, rifinitura meccanica del testo a una colonna.
 *
 *   node tools/prepara-set.mjs <manifesto.json>
 *   node tools/prepara-set.mjs <manifesto.json> --radice <albero>
 *
 * Il manifesto (uno per edizione):
 *
 * {
 *   "compagnia": "Generali Italia S.p.A.",
 *   "compagniaSlug": "generali",
 *   "ramo": "auto",
 *   "prodotto": "Contratto Base Autovetture",
 *   "prodottoSlug": "contratto-base-autovetture",
 *   "modello": "GP014S1725",
 *   "edizione": "23/07/2026",
 *   "pdf": "Generali_Contratto_Base_Autovetture_B.pdf",
 *   "documenti": [
 *     { "file": "dip.md", "titolo": "DIP Danni", "da": 3, "a": 4 },
 *     { "file": "condizioni-di-assicurazione.md", "titolo": "Condizioni di Assicurazione", "da": 11, "a": 26 }
 *   ]
 * }
 *
 * Quello che NON fa, e che resta al modello: le pagine che la sonda manda
 * agli occhi. Lo script ci mette l'ancora e un segnaposto
 * `<!-- DA TRASCRIVERE -->`, e le elenca alla fine: finché ce n'è uno,
 * il set non è finito. `verifica-fedelta.mjs` dirà poi se la trascrizione
 * ha perso o inventato qualcosa.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const QUI = dirname(fileURLToPath(import.meta.url));
const LOCALE = join(QUI, '..', '..', 'local-ingestion');
const ORIGINALI = join(LOCALE, 'originali');

const args = process.argv.slice(2);
const manifesto = args[0];
if (!manifesto) {
  console.error('Uso: node tools/prepara-set.mjs <manifesto.json> [--radice <albero>]');
  process.exit(1);
}
const iRadice = args.indexOf('--radice');
const RADICE = iRadice >= 0 ? args[iRadice + 1] : join(LOCALE, 'lavorazione', 'archivio-pubblico');

/** Una riga di bordo che torna su almeno tante pagine è intestazione o piè di pagina. */
const PAGINE_DECORAZIONE = 3;

const set = JSON.parse(readFileSync(manifesto, 'utf8'));
const percorsoPdf = join(ORIGINALI, set.pdf);
const pdf = await getDocument({ data: new Uint8Array(readFileSync(percorsoPdf)), useSystemFonts: true }).promise;
const totale = pdf.numPages;

// Le pagine servono tutte: la decorazione si riconosce sull'intero PDF. Si
// legge due volte, perché per sapere quali scritte ruotate sono linguette di
// margine bisogna prima aver visto quante volte tornano.
const primaLettura = new Map();
for (let n = 1; n <= totale; n++) primaLettura.set(n, await leggiPagina(pdf, n));
const ruotatiRipetuti = ruotatiDecorativi([...primaLettura.values()]);
const pagine = new Map();
for (let n = 1; n <= totale; n++) pagine.set(n, await leggiPagina(pdf, n, ruotatiRipetuti));
const decorazione = trovaDecorazione([...pagine.values()]);

const [anno, mese] = meseDiEdizione(set.edizione);
const cartella = join(RADICE, set.compagniaSlug, set.ramo, set.prodottoSlug, `ed-${anno}-${mese}`);
mkdirSync(cartella, { recursive: true });

const daTrascrivere = [];
for (const doc of set.documenti) {
  // Il piè di pagina del set torna su tutto il PDF, quello del singolo
  // documento logico solo lì dentro: un DIP Aggiuntivo lungo due pagine non
  // raggiungerebbe mai la soglia calcolata sull'intero fascicolo.
  const suo = [];
  for (let n = doc.da; n <= doc.a; n++) suo.push(pagine.get(n));
  const decorazioneDoc = new Set([...decorazione, ...trovaDecorazione(suo, Math.max(2, suo.length * 0.6))]);
  const righe = [
    `# ${doc.titolo} — ${nomeCorto(set)}`,
    '',
    `> **Compagnia**: ${set.compagnia} · **Prodotto**: ${set.prodotto} · **Tipologia**: ${doc.titolo}` +
      `${set.modello ? ` · **Modello**: ${set.modello}` : ''} · **Edizione**: ${set.edizione}` +
      ` · **Pagine nel PDF**: ${doc.da}–${doc.a} di ${totale} (file \`${set.pdf}\`)`,
    '',
  ];
  // Le pagine già trascritte a mano non si toccano: rilanciare lo script
  // deve poter aggiornare la parte meccanica senza buttare via il lavoro.
  const gia = trascrizioniEsistenti(join(cartella, doc.file));

  for (let n = doc.da; n <= doc.a; n++) {
    const pagina = pagine.get(n);
    righe.push(`[pag. ${n}]`, '');
    if (pagina.occhi) {
      if (gia.has(n)) {
        righe.push(gia.get(n), '');
        continue;
      }
      righe.push(`<!-- DA TRASCRIVERE: ${pagina.perche} -->`, '');
      daTrascrivere.push({ file: doc.file, pagina: n, perche: pagina.perche });
      continue;
    }
    const corpo = rifinisci(pagina.righe, decorazioneDoc);
    if (corpo.length) righe.push(...corpo, '');
  }
  writeFileSync(join(cartella, doc.file), righe.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', 'utf8');
  console.log(`  ${doc.file.padEnd(32)} pagine ${doc.da}–${doc.a}`);
}

console.log(`\n${cartella}`);
if (daTrascrivere.length) {
  console.log(`\n${daTrascrivere.length} pagine da trascrivere guardandole con Read:`);
  for (const p of daTrascrivere) console.log(`  ${p.file.padEnd(32)} pag. ${String(p.pagina).padStart(4)}  ${p.perche}`);
} else {
  console.log('\nNessuna pagina da trascrivere: il set è tutto a una colonna.');
}

/** Le pagine di un `.md` già scritto che portano una trascrizione vera, per numero. */
function trascrizioniEsistenti(percorso) {
  const per = new Map();
  if (!existsSync(percorso)) return per;
  const parti = readFileSync(percorso, 'utf8').split(/^\[pag\. (\d+)\]\s*$/m);
  for (let i = 1; i < parti.length; i += 2) {
    const corpo = (parti[i + 1] || '').trim();
    if (corpo && !corpo.includes('DA TRASCRIVERE')) per.set(Number(parti[i]), corpo);
  }
  return per;
}

/** Testo, righe e verdetto della sonda per una pagina. */
async function leggiPagina(documento, n, ruotatiDaTogliere = new Set()) {
  const pagina = await documento.getPage(n);
  const larghezza = pagina.view[2] - pagina.view[0];
  const tutti = (await pagina.getTextContent()).items
    .filter((i) => typeof i.str === 'string' && i.str.trim())
    .map((i) => ({
      testo: i.str,
      x: i.transform[4],
      y: i.transform[5],
      larghezza: i.width || 0,
      ruotato: Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01,
    }));
  // Le linguette di margine (le diciture verticali di sezione) sono testo
  // ruotato che torna pagina dopo pagina: sono decorazione, e per giunta
  // farebbero passare la pagina per impaginata a due colonne.
  const frammenti = tutti.filter((f) => !(f.ruotato && ruotatiDaTogliere.has(f.testo.trim())));
  const righe = componiRighe(frammenti);
  const caratteri = frammenti.reduce((s, f) => s + f.testo.trim().length, 0);
  const dueColonne = contaColonne(frammenti.filter((f) => !f.ruotato), larghezza) === 2;
  return {
    righe,
    ruotati: tutti.filter((f) => f.ruotato).map((f) => f.testo.trim()),
    bordi: [...righe.slice(0, 2), ...righe.slice(-2)],
    caratteri,
    occhi: dueColonne,
    perche: dueColonne ? 'due colonne' : '',
  };
}

/**
 * Rifinitura meccanica del testo a una colonna: via la decorazione, via la
 * sillabazione di fine riga, titoli sui numeri d'articolo, e le righe con
 * i separatori di colonna raccolte in tabelle Markdown. Non tocca il
 * contenuto: quello che entra esce, salvo intestazioni e piè di pagina.
 */
function rifinisci(righe, decorazione) {
  const pulite = righe.filter((r) => !decorazione.has(modelloDiRiga(r)));
  const unite = uniscISillabazione(pulite);
  const fuori = [];
  let tabella = [];
  const scaricaTabella = () => {
    if (!tabella.length) return;
    if (tabella.length >= 2) fuori.push(...comeTabella(tabella), '');
    else fuori.push(tabella[0].join(' — '));
    tabella = [];
  };
  for (const riga of unite) {
    if (riga.includes(' | ')) {
      tabella.push(riga.split(' | ').map((c) => c.trim()));
      continue;
    }
    scaricaTabella();
    fuori.push(titolo(riga) ?? riga);
  }
  scaricaTabella();
  return fuori;
}

/** «Art. 2.4 - Esclusioni» e «SEZIONE III» diventano titoli Markdown. */
function titolo(riga) {
  if (riga.length > 90) return null;
  if (/^(art\.?|articolo)\s*\d+/i.test(riga)) return `### ${riga}`;
  if (/^(sezione|capitolo|titolo|parte)\b/i.test(riga)) return `## ${riga}`;
  return null;
}

/** Le righe con i separatori di colonna diventano una tabella Markdown. */
function comeTabella(righe) {
  const colonne = Math.max(...righe.map((r) => r.length));
  const pari = righe.map((r) => [...r, ...Array(colonne - r.length).fill('')]);
  const testa = pari[0];
  return [
    `| ${testa.join(' | ')} |`,
    `| ${testa.map(() => '---').join(' | ')} |`,
    ...pari.slice(1).map((r) => `| ${r.join(' | ')} |`),
  ];
}

/** «corri-» a fine riga si riattacca alla riga dopo. */
function uniscISillabazione(righe) {
  const fuori = [];
  for (const riga of righe) {
    if (fuori.length && /[a-zàèéìòù]-$/.test(fuori[fuori.length - 1]) && /^[a-zàèéìòù]/.test(riga)) {
      fuori[fuori.length - 1] = fuori[fuori.length - 1].replace(/-$/, '') + riga;
      continue;
    }
    fuori.push(riga);
  }
  return fuori;
}

/** Le scritte ruotate che tornano su più pagine: sono linguette, non contenuto. */
function ruotatiDecorativi(pagine) {
  const quante = new Map();
  for (const p of pagine) for (const t of new Set(p.ruotati)) quante.set(t, (quante.get(t) || 0) + 1);
  const fuori = new Set();
  for (const [t, n] of quante) if (n >= PAGINE_DECORAZIONE) fuori.add(t);
  return fuori;
}

function trovaDecorazione(pagine, sogliaEsplicita) {
  const quante = new Map();
  for (const p of pagine) {
    const viste = new Set(p.bordi.filter((r) => r.length >= 3 && r.length < 200).map(modelloDiRiga));
    for (const m of viste) quante.set(m, (quante.get(m) || 0) + 1);
  }
  const modelli = new Set();
  const soglia = sogliaEsplicita ?? PAGINE_DECORAZIONE;
  for (const [m, n] of quante) if (n >= soglia) modelli.add(m);
  return modelli;
}

function modelloDiRiga(riga) {
  return riga
    .replace(/[.·]{3,}/g, '…')
    .replace(/[*_>#|]/g, '')
    .replace(/\d+/g, '@')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function nomeCorto(set) {
  return `${set.compagnia.replace(/\s+(S\.p\.A\.|Assicurazioni S\.p\.A\.|Mutua).*$/i, '')} ${set.prodotto}`;
}

function meseDiEdizione(edizione) {
  const m = edizione.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Edizione «${edizione}»: serve gg/mm/aaaa`);
  return [m[3], m[2]];
}

/** Le righe della pagina, coi salti orizzontali larghi segnati ` | `. */
function componiRighe(frammenti) {
  const righe = raggruppaPerRiga(frammenti);
  const fuori = [];
  for (const riga of righe) {
    riga.sort((p, q) => p.x - q.x);
    let testo = '';
    let fineX;
    for (const f of riga) {
      if (fineX !== undefined) {
        const salto = f.x - fineX;
        if (salto > 20) testo += ' | ';
        else if (salto > 1 && !testo.endsWith(' ') && !f.testo.startsWith(' ')) testo += ' ';
      }
      testo += f.testo;
      fineX = f.x + f.larghezza;
    }
    const pulita = testo.replace(/\s+\|\s+/g, ' | ').replace(/[ \t]+/g, ' ').trim();
    if (pulita) fuori.push(pulita);
  }
  return fuori;
}

function raggruppaPerRiga(frammenti) {
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
  return righe;
}

/** Stesso criterio di tools/sonda-pagine.mjs: vedere lì il perché. */
function contaColonne(frammenti, larghezza) {
  const righe = raggruppaPerRiga(frammenti);
  if (righe.length < 15) return 1;
  let latoDebole = 0;
  for (let q = 0.3; q <= 0.7; q += 0.01) {
    const taglio = larghezza * q;
    let soloSinistra = 0;
    let soloDestra = 0;
    for (const riga of righe) {
      if (riga.some((f) => f.x < taglio && f.x + f.larghezza > taglio)) continue;
      const sinistra = riga.some((f) => f.x + f.larghezza <= taglio);
      const destra = riga.some((f) => f.x > taglio);
      if (destra && !sinistra) soloDestra++;
      else if (sinistra && !destra) soloSinistra++;
    }
    latoDebole = Math.max(latoDebole, Math.min(soloSinistra, soloDestra));
  }
  return latoDebole >= 3 ? 2 : 1;
}
