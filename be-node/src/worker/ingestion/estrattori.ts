import ExcelJS from 'exceljs';
import mammoth from 'mammoth';

import type { FormatoDocumento } from '../../contratto/documenti-privati.js';

/**
 * Da un file che è già testo al Markdown che l'archivio conserva
 * (01/09/2026).
 *
 * È la scorciatoia che i formati testuali si meritano: un .md, un .txt, un
 * .csv, un .docx o un .xlsx portano già dentro di sé quello che il motore
 * deve leggere. Farli guardare al modello pagina per pagina — la lettura
 * visiva, che serve ai PDF perché lì il testo può non esserci affatto —
 * sarebbe pagare per una trascrizione meno fedele dell'originale.
 *
 * Quel che si perde è l'impaginazione: un .docx torna come testo con i suoi
 * titoli, elenchi e tabelle, non come la pagina che si vedeva in Word. Il
 * contenuto però c'è tutto, ed è quello che viene citato.
 */

/**
 * Il tetto delle righe per tabella (CSV e fogli Excel).
 *
 * Un listino da centomila righe diventerebbe un documento da millecinquecento
 * pagine: si taglia, e lo si dice nel testo invece di far finta di niente.
 */
export const RIGHE_MASSIME_TABELLA = 5000;

/** Il formato ha un testo da estrarre, o va guardato come si guarda un PDF? */
export function eTestuale(formato: FormatoDocumento): boolean {
  return formato === 'markdown' || formato === 'testo' || formato === 'csv' || formato === 'docx' || formato === 'xlsx';
}

export async function markdownDaOriginale(
  formato: FormatoDocumento,
  contenuto: Buffer,
): Promise<string> {
  switch (formato) {
    case 'markdown':
      return normalizza(contenuto.toString('utf8'));
    case 'testo':
      return normalizza(contenuto.toString('utf8'));
    case 'csv':
      return daCsv(contenuto.toString('utf8'));
    case 'docx':
      return daDocx(contenuto);
    case 'xlsx':
      return daXlsx(contenuto);
    default:
      throw new Error(`formato senza estrattore: ${formato}`);
  }
}

/** Fine riga uniformi, niente BOM, niente code di righe vuote. */
function normalizza(testo: string): string {
  return testo.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Un .docx diventa Markdown: titoli, grassetti, elenchi e tabelle
 * sopravvivono, il resto (caselle di testo, disegni, intestazioni ripetute)
 * no — sono decorazione, e nessuno le cita.
 *
 * Si passa dall'HTML di mammoth e non dal suo `convertToMarkdown`, che è
 * deprecato e — cosa che qui conta più di tutto — appiattisce le tabelle in
 * paragrafi sciolti: in un documento assicurativo le tabelle sono metà del
 * contenuto, e perderle vorrebbe dire perdere massimali e franchigie.
 */
async function daDocx(contenuto: Buffer): Promise<string> {
  const esito = await mammoth.convertToHtml({ buffer: contenuto });
  const testo = normalizza(markdownDaHtml(esito.value));
  if (testo) return testo;
  /* Un documento fatto solo di caselle di testo o di immagini: non ne esce
     niente, e vale la stessa regola delle scansioni mute. */
  const grezzo = await mammoth.extractRawText({ buffer: contenuto });
  return normalizza(grezzo.value);
}

/** Le entità che mammoth produce; il resto passa com'è. */
function decodifica(testo: string): string {
  return testo
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Il contenuto di un blocco: grassetto e corsivo restano, il resto cade. */
function inLinea(html: string): string {
  return decodifica(
    html
      .replace(/<(strong|b)>(.*?)<\/\1>/gis, (_, __, t: string) => `**${t.trim()}**`)
      .replace(/<(em|i)>(.*?)<\/\1>/gis, (_, __, t: string) => `*${t.trim()}*`)
      .replace(/<a\b[^>]*>(.*?)<\/a>/gis, '$1')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * L'HTML regolare di mammoth → Markdown.
 *
 * Non è un parser HTML generale e non deve diventarlo: legge la manciata di
 * tag che mammoth produce (titoli, paragrafi, elenchi, tabelle) e ignora
 * tutto il resto. Un parser vero qui sarebbe una dipendenza in più per
 * capire un dialetto che conosciamo già.
 */
export function markdownDaHtml(html: string): string {
  const pezzi: string[] = [];
  const blocchi = html.replace(/<img\b[^>]*>/gi, '').matchAll(
    /<h([1-6])>(.*?)<\/h\1>|<p>(.*?)<\/p>|<(ul|ol)>(.*?)<\/\4>|<table>(.*?)<\/table>/gis,
  );
  for (const b of blocchi) {
    if (b[1]) {
      const livello = Math.min(Number(b[1]), 6);
      const testo = inLinea(b[2] ?? '');
      if (testo) pezzi.push(`${'#'.repeat(livello)} ${testo}`);
    } else if (b[3] !== undefined) {
      const testo = inLinea(b[3]);
      if (testo) pezzi.push(testo);
    } else if (b[4]) {
      const ordinato = b[4].toLowerCase() === 'ol';
      const voci = [...(b[5] ?? '').matchAll(/<li>(.*?)<\/li>/gis)]
        .map((v, i) => `${ordinato ? `${i + 1}.` : '-'} ${inLinea(v[1] ?? '')}`)
        .filter((v) => v.length > 2);
      if (voci.length) pezzi.push(voci.join('\n'));
    } else if (b[6] !== undefined) {
      const righe = [...b[6].matchAll(/<tr>(.*?)<\/tr>/gis)].map((r) =>
        [...(r[1] ?? '').matchAll(/<t[hd]\b[^>]*>(.*?)<\/t[hd]>/gis)].map((c) => inLinea(c[1] ?? '')),
      );
      if (righe.length) pezzi.push(tabellaMarkdown(righe));
    }
  }
  return pezzi.join('\n\n');
}

/**
 * Ogni foglio del file Excel diventa una sezione con la sua tabella.
 *
 * Le formule non si valutano: si prende il risultato che il file porta con
 * sé (`result`), che è quello che l'utente vedeva aprendo il foglio.
 */
async function daXlsx(contenuto: Buffer): Promise<string> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenuto as unknown as ArrayBuffer);
  const pezzi: string[] = [];
  for (const foglio of libro.worksheets) {
    if (foglio.state === 'hidden' || foglio.state === 'veryHidden') continue;
    const righe: string[][] = [];
    let troncato = false;
    foglio.eachRow({ includeEmpty: false }, (riga) => {
      if (righe.length >= RIGHE_MASSIME_TABELLA) {
        troncato = true;
        return;
      }
      const celle: string[] = [];
      riga.eachCell({ includeEmpty: true }, (cella) => celle.push(testoDiCella(cella.value)));
      while (celle.length && !celle[celle.length - 1]) celle.pop();
      if (celle.some((c) => c !== '')) righe.push(celle);
    });
    if (!righe.length) continue;
    pezzi.push(
      `## ${foglio.name}\n\n${tabellaMarkdown(righe)}${troncato ? `\n\n_Tabella troncata alle prime ${RIGHE_MASSIME_TABELLA} righe._` : ''}`,
    );
  }
  return pezzi.join('\n\n');
}

/** Il valore di una cella come lo si leggeva nel foglio. */
function testoDiCella(valore: ExcelJS.CellValue): string {
  if (valore === null || valore === undefined) return '';
  if (valore instanceof Date) return valore.toLocaleDateString('it-IT');
  if (typeof valore === 'object') {
    /* Formule, testo formattato, collegamenti: interessa il valore che si
       leggeva nel foglio, non come era scritto. */
    const v = valore as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    for (const candidato of [v.result, v.text]) {
      if (candidato instanceof Date) return candidato.toLocaleDateString('it-IT');
      if (typeof candidato === 'string') return candidato;
      if (typeof candidato === 'number' || typeof candidato === 'boolean') return String(candidato);
    }
    return '';
  }
  return String(valore);
}

/**
 * Un CSV è una tabella: si legge col separatore che ha davvero — il
 * punto e virgola è la norma dei file esportati da Excel in italiano — e si
 * riscrive come tabella Markdown, che è ciò che il motore sa leggere.
 */
function daCsv(testo: string): string {
  const pulito = normalizza(testo);
  if (!pulito.trim()) return '';
  const separatore = scegliSeparatore(pulito);
  const righe = leggiCsv(pulito, separatore);
  const troncato = righe.length > RIGHE_MASSIME_TABELLA;
  const usate = troncato ? righe.slice(0, RIGHE_MASSIME_TABELLA) : righe;
  return (
    tabellaMarkdown(usate) +
    (troncato ? `\n\n_Tabella troncata alle prime ${RIGHE_MASSIME_TABELLA} righe._` : '')
  );
}

/** Vince il separatore che compare più spesso nella prima riga vera. */
function scegliSeparatore(testo: string): string {
  const prima = testo.split('\n').find((r) => r.trim()) ?? '';
  const conta = (c: string) => prima.split(c).length - 1;
  return conta(';') > conta(',') ? ';' : conta('\t') > conta(',') ? '\t' : ',';
}

/** Lettura RFC 4180: virgolette, virgolette raddoppiate, a capo dentro il campo. */
function leggiCsv(testo: string, separatore: string): string[][] {
  const righe: string[][] = [];
  let riga: string[] = [];
  let campo = '';
  let traVirgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i]!;
    if (traVirgolette) {
      if (c === '"') {
        if (testo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          traVirgolette = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') traVirgolette = true;
    else if (c === separatore) {
      riga.push(campo);
      campo = '';
    } else if (c === '\n') {
      riga.push(campo);
      campo = '';
      if (riga.some((x) => x.trim() !== '')) righe.push(riga);
      riga = [];
    } else campo += c;
  }
  riga.push(campo);
  if (riga.some((x) => x.trim() !== '')) righe.push(riga);
  return righe;
}

/**
 * Righe di celle → tabella Markdown, con la prima riga come intestazione.
 *
 * Le celle si ripuliscono dei caratteri che spezzerebbero la tabella: una
 * barra verticale dentro un valore, un a capo dentro una cella di Excel.
 */
export function tabellaMarkdown(righe: string[][]): string {
  const colonne = Math.max(...righe.map((r) => r.length));
  const cella = (v: string | undefined) =>
    (v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
  const riga = (r: string[]) =>
    `| ${Array.from({ length: colonne }, (_, i) => cella(r[i])).join(' | ')} |`;
  const intestazione = righe[0] ?? [];
  return [
    riga(intestazione),
    `| ${Array.from({ length: colonne }, () => '---').join(' | ')} |`,
    ...righe.slice(1).map(riga),
  ].join('\n');
}
