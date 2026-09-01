#!/usr/bin/env node
/**
 * Triage di un PDF prima dell'ingestion: dice, pagina per pagina, chi la
 * deve convertire. È il criterio di smistamento della skill
 * `/ingest-pubblico`: la via deterministica (`estrai-testo-pdf.mjs`) regge
 * il testo a una colonna, tutto il resto vuole gli occhi del modello.
 *
 *   node tools/sonda-pagine.mjs <file.pdf>            # tabella + riepilogo
 *   node tools/sonda-pagine.mjs <file.pdf> --json     # per gli script di lotto
 *   node tools/sonda-pagine.mjs <file.pdf> --da 1 --a 40
 *
 * Tre esiti:
 *   testo   una colonna, niente figure che contino: la macchina basta
 *   occhi   due colonne, oppure figura grande su pagina povera di testo:
 *           la pagina si legge con Read e si trascrive
 *   bianca  nessun testo e nessuna figura: produce la sola ancora [pag. N]
 *
 * L'esito è un **sospetto, non una sentenza**: la geometria non separa
 * pulitamente due colonne di testo da una tabella o da una linguetta di
 * margine, e la taratura è larga apposta. Nella pratica il DIP va agli
 * occhi per tipo di documento, sempre; altrove una segnalazione conta
 * quando anche verifica-fedelta.mjs si lamenta della stessa pagina.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getDocument, OPS } = require('pdfjs-dist/legacy/build/pdf.mjs');

const args = process.argv.slice(2);
const file = args[0];
if (!file || file.startsWith('--')) {
  console.error('Uso: node tools/sonda-pagine.mjs <file.pdf> [--da N] [--a M] [--json]');
  process.exit(1);
}
const opzione = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const comeJson = args.includes('--json');

/** Un'immagine più piccola di così è un logo o un pittogramma, non una tavola. */
const PIXEL_FIGURA = 200 * 200;
/** Sotto questa soglia di caratteri la pagina non si regge da sola. */
const CARATTERI_POVERI = 200;
/**
 * Quante righe esclusive per lato bastano a chiamarle due colonne. Misurato
 * sui set in archivio, le pagine a due colonne stanno fra 3 e 40, le tabelle
 * fra 1 e 7: le distribuzioni si toccano e nessuna soglia le separa. Si tara
 * basso di proposito, perché l'errore non è simmetrico: una tabella mandata
 * agli occhi costa qualche token, una pagina a due colonne lasciata alla
 * macchina entra in archivio intrecciata e nessun controllo se ne accorge.
 */
const RIGHE_PER_LATO = 3;

const IMMAGINI = new Set([OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject]);

const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
const totale = pdf.numPages;
const da = Number(opzione('--da') ?? 1);
const a = Math.min(Number(opzione('--a') ?? totale), totale);

const pagine = [];
for (let n = da; n <= a; n++) {
  const pagina = await pdf.getPage(n);
  const larghezza = pagina.view[2] - pagina.view[0];
  const frammenti = (await pagina.getTextContent()).items
    .filter((i) => typeof i.str === 'string' && i.str.trim())
    .map((i) => ({
      testo: i.str,
      x: i.transform[4],
      y: i.transform[5],
      larghezza: i.width || 0,
      ruotato: Math.abs(i.transform[1]) > 0.01 || Math.abs(i.transform[2]) > 0.01,
    }));
  const caratteri = frammenti.reduce((s, f) => s + f.testo.trim().length, 0);

  let figure = 0;
  let pixelMax = 0;
  const ops = await pagina.getOperatorList();
  for (let k = 0; k < ops.fnArray.length; k++) {
    if (!IMMAGINI.has(ops.fnArray[k])) continue;
    const arg = ops.argsArray[k] || [];
    const px = (Number(arg[1]) || 0) * (Number(arg[2]) || 0);
    if (px >= PIXEL_FIGURA) figure++;
    if (px > pixelMax) pixelMax = px;
  }

  // Le linguette di margine sono testo ruotato: sono decorazione, non una colonna.
  const colonne = contaColonne(
    frammenti.filter((f) => !f.ruotato),
    larghezza,
  );
  let esito;
  let perche;
  if (!caratteri && !figure) {
    esito = 'bianca';
    perche = 'nessun testo, nessuna figura';
  } else if (caratteri < CARATTERI_POVERI && figure) {
    esito = 'occhi';
    perche = `${caratteri} caratteri con ${figure} figura/e: il testo può stare nell'immagine`;
  } else if (colonne === 2) {
    esito = 'occhi';
    perche = 'due colonne: la ricostruzione per righe le intreccia';
  } else {
    esito = 'testo';
    perche = 'una colonna';
  }
  pagine.push({ pagina: n, caratteri, frammenti: frammenti.length, figure, pixelMax, colonne, esito, perche });
}

if (comeJson) {
  console.log(JSON.stringify({ file, totale, da, a, pagine }, null, 2));
} else {
  const per = (e) => pagine.filter((p) => p.esito === e);
  console.log(`${file} — ${totale} pagine (sonda ${da}–${a})\n`);
  console.log(`  testo  ${String(per('testo').length).padStart(4)}   una colonna, via deterministica`);
  console.log(`  occhi  ${String(per('occhi').length).padStart(4)}   da leggere con Read`);
  console.log(`  bianca ${String(per('bianca').length).padStart(4)}   sola ancora\n`);
  if (per('occhi').length) {
    console.log('Pagine da leggere:');
    for (const p of per('occhi')) console.log(`  pag. ${String(p.pagina).padStart(4)}  ${p.perche}`);
  }
}

/**
 * Riconosce l'impaginazione a due colonne di testo, l'unico caso in cui la
 * lettura per righe sbaglia: le colonne si intrecciano.
 *
 * Non basta cercare un corridoio vuoto, perché nel DIP le righe a piena
 * larghezza (titoli, cappelli) lo attraversano di continuo, e il blocco a
 * due colonne comincia spesso a metà pagina. E non basta guardare un lato,
 * perché una tabella etichetta/valore ha anch'essa un lato pieno e uno
 * vuoto, ma lì leggere per righe è **giusto**.
 *
 * Quindi: si ignorano le righe che attraversano il corridoio, e fra quelle
 * che restano si contano le esclusive di ciascun lato. Due colonne di testo
 * scorrono con ritmi propri e ne hanno molte da entrambe le parti; una
 * tabella ne ha da un lato solo. Si tiene il taglio che massimizza il lato
 * più debole.
 */
function contaColonne(frammenti, larghezza) {
  const righe = raggruppaPerRiga(frammenti);
  if (righe.length < 15) return 1;
  let latoDebole = 0;
  for (let q = 0.3; q <= 0.7; q += 0.01) {
    const taglio = larghezza * q;
    const sinistre = [];
    const destre = [];
    for (const riga of righe) {
      if (riga.some((f) => f.x < taglio && f.x + f.larghezza > taglio)) continue;
      const sinistra = riga.some((f) => f.x + f.larghezza <= taglio);
      const destra = riga.some((f) => f.x > taglio);
      if (destra && !sinistra) destre.push(riga);
      else if (sinistra && !destra) sinistre.push(riga);
    }
    latoDebole = Math.max(latoDebole, Math.min(sinistre.length, destre.length));
  }
  return latoDebole >= RIGHE_PER_LATO ? 2 : 1;
}

/** Stesso raggruppamento dell'estrattore: stessa riga entro 2pt di y. */
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
