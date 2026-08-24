#!/usr/bin/env node
/**
 * Estrae il testo di un PDF pagina per pagina, con le ancore `[pag. N]` del
 * layout dell'archivio, senza modelli: è il primo passo dell'ingestion
 * fatta in sessione (`local-ingestion/ISTRUZIONI.md`, skill
 * `/ingest-pubblico`). Il testo è quello del PDF, fedele per costruzione;
 * la struttura (titoli, tabelle) si rifinisce a mano sul risultato.
 *
 *   node tools/estrai-testo-pdf.mjs <file.pdf> --sonda            # prime pagine + conteggio, per capire il set
 *   node tools/estrai-testo-pdf.mjs <file.pdf> --da 7 --a 22 --uscita dip-aggiuntivo.md
 *   node tools/estrai-testo-pdf.mjs <file.pdf> --uscita tutto.md   # intero
 *
 * Le righe si ricostruiscono dalla posizione verticale degli elementi;
 * gli spazi orizzontali larghi diventano ` | ` (aiuta a riconoscere le
 * tabelle). Una pagina senza testo produce solo l'ancora.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('Uso: node tools/estrai-testo-pdf.mjs <file.pdf> [--sonda] [--da N] [--a M] [--uscita file.md]');
  process.exit(1);
}
const opzione = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const sonda = args.includes('--sonda');
const da = Number(opzione('--da') ?? 1);
const uscita = opzione('--uscita');

const dati = new Uint8Array(readFileSync(file));
const pdf = await getDocument({ data: dati, useSystemFonts: true }).promise;
const totale = pdf.numPages;
const a = Math.min(Number(opzione('--a') ?? (sonda ? Math.min(6, totale) : totale)), totale);

const righe = [];
for (let n = da; n <= a; n++) {
  const pagina = await pdf.getPage(n);
  const contenuto = await pagina.getTextContent();
  righe.push(`[pag. ${n}]`);
  righe.push(...ricostruisciRighe(contenuto.items));
  righe.push('');
}

const testo = righe.join('\n');
if (uscita) {
  writeFileSync(uscita, testo, 'utf8');
  console.log(`${file}: pagine ${da}–${a} di ${totale} → ${uscita} (${testo.length} caratteri)`);
} else {
  console.log(`# ${file} — ${totale} pagine${sonda ? ` (sonda: ${da}–${a})` : ''}\n`);
  console.log(testo);
}

/**
 * Gli elementi di pdf.js arrivano in ordine di disegno con una trasformata
 * [a b c d x y]: si raggruppano per y (stessa riga entro 2pt), si ordinano
 * per x, e un salto orizzontale grande si segna come separatore di colonna.
 */
function ricostruisciRighe(items) {
  const frammenti = items
    .filter((i) => typeof i.str === 'string')
    .map((i) => ({ testo: i.str, x: i.transform[4], y: i.transform[5], larghezza: i.width, altezza: i.height || 0 }));
  if (!frammenti.length) return [];

  frammenti.sort((p, q) => q.y - p.y || p.x - q.x);
  const linee = [];
  let corrente = [];
  let yCorrente = frammenti[0].y;
  for (const f of frammenti) {
    if (Math.abs(f.y - yCorrente) > 2) {
      linee.push(corrente);
      corrente = [];
      yCorrente = f.y;
    }
    corrente.push(f);
  }
  linee.push(corrente);

  const uscita = [];
  for (const linea of linee) {
    linea.sort((p, q) => p.x - q.x);
    let riga = '';
    let fineX = undefined;
    for (const f of linea) {
      if (!f.testo.trim() && f.testo !== ' ') continue;
      if (fineX !== undefined) {
        const salto = f.x - fineX;
        const media = f.altezza || 8;
        if (salto > media * 2.5) riga += ' | ';
        else if (salto > media * 0.2 && !riga.endsWith(' ') && !f.testo.startsWith(' ')) riga += ' ';
      }
      riga += f.testo;
      fineX = f.x + f.larghezza;
    }
    const pulita = riga.replace(/\s+\|\s+/g, ' | ').replace(/[ \t]+/g, ' ').trimEnd();
    if (pulita.trim()) uscita.push(pulita);
  }
  return uscita;
}
