import { ErroreFiltroContenuti, type Convertitore } from './convertitore.js';
import type { SecondoSguardo } from './secondo-sguardo.js';
import { estraiPagine } from './pdf.js';
import {
  giudica,
  leggiConOcr,
  leggiConPdfjs,
  type GiudizioPagina,
  type LetturaOcr,
} from './testimoni.js';

/**
 * La lettura visiva di un documento: il motore della skill `/ingest-visivo`
 * portato nel worker.
 *
 * Il principio è quello, parola per parola: **il modello legge, la macchina
 * controlla**. Mai il contrario, e nessuna estrazione automatica come fonte.
 * Ogni pagina viene guardata e trascritta — copertine e pagine bianche
 * comprese, che producono una pagina vuota — poi due testimoni meccanici
 * dicono dove la trascrizione e la pagina non coincidono, e un secondo
 * sguardo in contesto separato torna solo su quelle.
 *
 * I quattro passi, come nella skill:
 *
 *  §2 trascrizione a blocchi da dieci pagine, ognuno una chiamata a sé
 *     (contesto fresco: chi trascrive a lungo comincia a riassumere);
 *  §4a i due testimoni — il layer di testo pdfjs e l'OCR di Mistral, una
 *     chiamata sola per l'intero PDF — che segnalano le pagine da guardare;
 *  §4b il secondo sguardo sulle pagine segnalate, su quelle con
 *     `[!ATTENZIONE]` e su **una ogni dieci** delle altre, pescata a caso;
 *  §3+§4 il giro si ripete finché i testimoni non hanno più niente da dire e
 *     il secondo sguardo non corregge più.
 *
 * L'unica differenza con la sessione è dove stanno le pagine: lì un file per
 * pagina in `lavorazione-visiva/pagine/`, qui una voce dell'array. «File
 * vuoto = pagina vista e senza testo» diventa stringa vuota; «file assente =
 * pagina non trascritta» diventa `undefined`, e quel blocco si rilancia.
 */

/** Il campione della skill: una pagina ogni dieci va guardata comunque. */
const UNA_OGNI = 10;

/** Oltre questi giri ci si ferma: la pagina che non converge la dichiara il report. */
const GIRI_MASSIMI = 3;

/**
 * Quanti blocchi in volo insieme. La skill ne lancia in parallelo quanti ne
 * ha; qui il freno serve ai limiti di frequenza dell'API e alla memoria del
 * worker, che sta su un container piccolo.
 */
const BLOCCHI_INSIEME = 3;

export interface AvanzamentoLettura {
  fase: 'trascrizione' | 'testimoni' | 'secondo-sguardo';
  fatte: number;
  totali: number;
}

export interface DipendenzeLettura {
  convertitore: Convertitore;
  /** Assente nei test che non vogliono il controllo: si trascrive e basta. */
  secondoSguardo?: SecondoSguardo;
  pagineNelBlocco: number;
  /** Per il log del job e la barra di avanzamento. */
  avanzamento?: (a: AvanzamentoLettura) => Promise<void>;
}

export interface EsitoLettura {
  /** Una voce per pagina, dalla 1 alla N: il testo senza ancora. */
  pagine: string[];
  /** Cosa hanno detto i testimoni all'ultimo giro. */
  giudizi: GiudizioPagina[];
  /** Le correzioni del secondo sguardo, per il log: «pag. 12: …». */
  correzioni: string[];
  /** Vero se l'OCR non c'era (chiave mancante o servizio in errore). */
  senzaOcr: boolean;
}

/**
 * Trascrive, verifica e corregge. Torna una pagina per voce: chi chiama ci
 * mette le ancore e l'header.
 */
export async function leggiDocumento(
  pdf: Buffer,
  totale: number,
  dipendenze: DipendenzeLettura,
): Promise<EsitoLettura> {
  const { pagine, rifiutate } = await trascriviTutto(pdf, totale, dipendenze);

  const pdfjs = await leggiConPdfjs(pdf);
  /* Il testimone che non c'è (chiave mancante) o che non risponde non ferma
     l'ingestion: resta l'altro, e il job lo dichiara. */
  const ocr = await leggiConOcr(pdf).catch(() => undefined);
  const senzaOcr = ocr === undefined;

  /* §2: le pagine che il filtro dei contenuti ha rifiutato anche a una a una
     si prendono dalla lettura OCR. Vanno **sempre** al secondo sguardo, che
     le confronta con la pagina senza doverle riscrivere. */
  const daOcr: number[] = [];
  for (const n of rifiutate) {
    const lettura = ocr?.[n - 1]?.corpo;
    if (!lettura) continue;
    pagine[n - 1] = lettura;
    daOcr.push(n);
  }

  const correzioni: string[] = [];
  let giudizi = valuta(pagine, pdfjs, ocr, totale);

  if (dipendenze.secondoSguardo) {
    let campionate = [...campione(totale), ...daOcr];
    for (let giro = 0; giro < GIRI_MASSIMI; giro++) {
      const daGuardare = daRicontrollare(giudizi, pagine, campionate);
      if (!daGuardare.length) break;

      await dipendenze.avanzamento?.({ fase: 'secondo-sguardo', fatte: 0, totali: daGuardare.length });
      let corretteQuesteVolta = 0;
      let fatte = 0;
      for (const { pagina, motivo } of daGuardare) {
        const soloQuella = await estraiPagine(pdf, pagina, pagina);
        const esito = await dipendenze.secondoSguardo.ricontrolla(soloQuella, pagine[pagina - 1] ?? '', {
          pagina,
          motivo,
        });
        if (esito.correzione) {
          pagine[pagina - 1] = esito.testo;
          correzioni.push(`pag. ${pagina}: ${esito.correzione}`);
          corretteQuesteVolta++;
        }
        await dipendenze.avanzamento?.({
          fase: 'secondo-sguardo',
          fatte: ++fatte,
          totali: daGuardare.length,
        });
      }

      /* Il campione si pesca una volta sola: al giro dopo si torna solo su
         ciò che è ancora segnalato. */
      campionate = [];
      if (!corretteQuesteVolta) break;
      /* Qualcosa è cambiato: i testimoni rileggono, come nella skill. */
      giudizi = valuta(pagine, pdfjs, ocr, totale);
    }
  }

  return { pagine, giudizi, correzioni, senzaOcr };
}

function valuta(
  pagine: string[],
  pdfjs: Awaited<ReturnType<typeof leggiConPdfjs>>,
  ocr: LetturaOcr[] | undefined,
  totale: number,
): GiudizioPagina[] {
  return giudica(
    Array.from({ length: totale }, (_, i) => ({
      pagina: i + 1,
      trascrizione: pagine[i],
      pdfjs: pdfjs[i] ?? { testo: '', righe: [], caratteri: 0 },
      ocr: ocr?.[i],
    })),
  );
}

/** Le pagine che tornano davanti al modello, col motivo per cui ci tornano. */
function daRicontrollare(
  giudizi: GiudizioPagina[],
  pagine: string[],
  campionate: number[],
): { pagina: number; motivo: string }[] {
  const motivi = new Map<number, string>();
  for (const g of giudizi) {
    if (g.esito === 'ok') continue;
    motivi.set(g.pagina, g.note.join('; ') || 'i testimoni non concordano con la trascrizione');
  }
  pagine.forEach((testo, i) => {
    if (testo?.includes('[!ATTENZIONE]')) {
      motivi.set(i + 1, motivi.get(i + 1) ?? 'la trascrizione dichiara una porzione non leggibile');
    }
  });
  for (const p of campionate) {
    if (!motivi.has(p)) motivi.set(p, 'controllo a campione, una pagina ogni dieci');
  }
  return [...motivi]
    .sort(([a], [b]) => a - b)
    .map(([pagina, motivo]) => ({ pagina, motivo }));
}

/** Una pagina ogni dieci, pescata a caso dentro ogni decina. */
function campione(totale: number): number[] {
  const scelte: number[] = [];
  for (let inizio = 1; inizio <= totale; inizio += UNA_OGNI) {
    const fine = Math.min(inizio + UNA_OGNI - 1, totale);
    scelte.push(inizio + Math.floor(Math.random() * (fine - inizio + 1)));
  }
  return scelte;
}

// ---------------------------------------------------------------------------
// §2 — la trascrizione
// ---------------------------------------------------------------------------

async function trascriviTutto(
  pdf: Buffer,
  totale: number,
  dipendenze: DipendenzeLettura,
): Promise<{ pagine: string[]; rifiutate: number[] }> {
  const pagine: string[] = new Array<string>(totale);
  const rifiutate = new Set<number>();
  const daFare = blocchiDi(totale, dipendenze.pagineNelBlocco);
  let fatte = 0;

  /* I blocchi corrono a gruppi: ognuno è una chiamata indipendente, e
     l'ordine in cui tornano non conta — ognuno scrive le sue pagine. */
  for (let i = 0; i < daFare.length; i += BLOCCHI_INSIEME) {
    const gruppo = daFare.slice(i, i + BLOCCHI_INSIEME);
    await Promise.all(
      gruppo.map(async ([da, a]) => {
        await trascriviBlocco(pdf, da, a, totale, pagine, rifiutate, dipendenze);
        fatte += a - da + 1;
        await dipendenze.avanzamento?.({ fase: 'trascrizione', fatte, totali: totale });
      }),
    );
  }

  /* «Manca un file → rilancia quel blocco»: il rilancio è già avvenuto dentro
     `trascriviBlocco`, a pagine singole. Ciò che resta senza testo si dichiara
     vuoto: se la pagina aveva davvero qualcosa, i testimoni lo vedono e il
     secondo sguardo la riscrive. */
  for (let n = 1; n <= totale; n++) pagine[n - 1] ??= '';
  return { pagine, rifiutate: [...rifiutate].sort((a, b) => a - b) };
}

/**
 * Un blocco: una chiamata, una trascrizione, le pagine spacchettate sulle
 * ancore. Se il modello salta una pagina del blocco si riprova una volta
 * sola, con blocchi più piccoli — è la regola della skill per i blocchi che
 * muoiono, applicata anche a quelli che tornano monchi.
 */
async function trascriviBlocco(
  pdf: Buffer,
  da: number,
  a: number,
  totale: number,
  pagine: string[],
  rifiutate: Set<number>,
  dipendenze: DipendenzeLettura,
  secondoTentativo = false,
): Promise<void> {
  const spezzone = await estraiPagine(pdf, da, a);
  let markdown: string;
  try {
    markdown = await dipendenze.convertitore.convertiBlocco(spezzone, {
      paginaIniziale: da,
      pagineTotali: totale,
    });
  } catch (errore) {
    /* Solo il filtro dei contenuti si aggira spezzando: un modello
       irraggiungibile o una chiave scaduta devono far fallire il job, non
       lasciare un archivio a metà che nessuno guarda più. */
    if (!(errore instanceof ErroreFiltroContenuti)) throw errore;
    if (secondoTentativo || a === da) {
      for (let n = da; n <= a; n++) rifiutate.add(n);
      return;
    }
    for (let n = da; n <= a; n++) {
      await trascriviBlocco(pdf, n, n, totale, pagine, rifiutate, dipendenze, true);
    }
    return;
  }

  const spacchettate = spacchettaAncore(markdown, da, a);
  for (const [numero, testo] of spacchettate) pagine[numero - 1] = testo;

  const mancanti: number[] = [];
  for (let n = da; n <= a; n++) if (pagine[n - 1] === undefined) mancanti.push(n);
  if (mancanti.length && !secondoTentativo) {
    for (const n of mancanti) {
      await trascriviBlocco(pdf, n, n, totale, pagine, rifiutate, dipendenze, true);
    }
  }
}

/**
 * Dal Markdown di un blocco alle sue pagine: si taglia sulle ancore
 * `[pag. N]`, che il prompt pretende su riga propria. Le ancore fuori
 * dall'intervallo del blocco si ignorano: sono un errore di numerazione, e
 * la pagina che manca si rilancia.
 */
export function spacchettaAncore(markdown: string, da: number, a: number): Map<number, string> {
  const pagine = new Map<number, string>();
  const ancora = /^[ \t]*\[pag\.\s*(\d+)\][ \t]*$/gm;
  const trovate: { numero: number; inizio: number; fine: number }[] = [];
  let corrispondenza: RegExpExecArray | null;
  while ((corrispondenza = ancora.exec(markdown)) !== null) {
    trovate.push({
      numero: Number(corrispondenza[1]),
      inizio: corrispondenza.index,
      fine: corrispondenza.index + corrispondenza[0].length,
    });
  }
  trovate.forEach((t, i) => {
    if (t.numero < da || t.numero > a) return;
    const testo = markdown.slice(t.fine, trovate[i + 1]?.inizio ?? markdown.length).trim();
    pagine.set(t.numero, testo);
  });
  return pagine;
}

/** Gli intervalli [da, a] dei blocchi, 1-based e inclusivi. */
export function blocchiDi(totale: number, perBlocco: number): [number, number][] {
  const blocchi: [number, number][] = [];
  for (let da = 1; da <= totale; da += perBlocco) {
    blocchi.push([da, Math.min(da + perBlocco - 1, totale)]);
  }
  return blocchi;
}
