import { configurazione } from '../../config.js';

/**
 * I due testimoni meccanici dell'ingestion visiva.
 *
 * Il principio della skill `/ingest-visivo`: **il modello legge, la macchina
 * controlla**. Mai il contrario. Chi trascrive è il modello, che guarda la
 * pagina; chi verifica sono due lettori che non possono inventare — il layer
 * di testo di pdfjs e l'OCR di Mistral — e che sbagliano su parole diverse.
 * Dove concordano contro la trascrizione c'è un buco certo; dove pdfjs è
 * cieco (testo dentro immagini, scansioni) l'OCR è l'unico testimone
 * possibile.
 *
 * Nessuno dei due scrive mai il testo finale: dicono soltanto **dove
 * guardare**. Il collaudo del 30/08/2026 sul lotto Zurich lo ha misurato:
 * sui numeri Mistral è alla pari con la lettura a occhio, ma sbaglia qualche
 * parola in modo plausibile («gestisce» → «gestione»). Testimone, non fonte.
 *
 * Porta in casa `tools/testimone-ocr.mjs`, che fa lo stesso lavoro in
 * sessione: stessa tokenizzazione, stesse soglie, stessi verdetti.
 */

/** Una riga di bordo che torna su tante pagine è cornice, non contenuto. */
const PAGINE_DECORAZIONE = 3;
/** Qualche parola di scarto è rumore (sillabazioni, simboli); oltre, è un buco. */
const PAROLE_TOLLERATE = 5;
/** Sotto questa soglia pdfjs non ha visto abbastanza per fare da testimone. */
const CARATTERI_MINIMI = 40;

const ENDPOINT_OCR = 'https://api.mistral.ai/v1/ocr';

export interface LetturaPdfjs {
  testo: string;
  righe: string[];
  caratteri: number;
}

export interface LetturaOcr {
  corpo: string;
  header: string;
  footer: string;
  confidenza?: number;
}

export type EsitoPagina = 'ok' | 'guarda' | 'certo';

export interface GiudizioPagina {
  pagina: number;
  esito: EsitoPagina;
  /** Cosa ha visto il testimone, in parole d'uomo: finisce nel log del job. */
  note: string[];
}

// ---------------------------------------------------------------------------
// Il primo testimone: il layer di testo del PDF (gratis, locale, muto sulle
// scansioni). Non vede il testo dentro le immagini: quando è cieco lo dice.
// ---------------------------------------------------------------------------

interface RigaTesto {
  testo: string;
  x: number;
  y: number;
  larghezza: number;
}

interface VocePdfjs {
  str?: unknown;
  width?: number;
  transform: number[];
}

interface PaginaPdfjs {
  getTextContent(): Promise<{ items: VocePdfjs[] }>;
}

interface DocumentoPdfjs {
  numPages: number;
  getPage(n: number): Promise<PaginaPdfjs>;
}

/**
 * pdfjs si carica quando serve: è una libreria da megabyte, e un worker che
 * non converte niente non deve pagarla all'avvio.
 */
async function apriPdf(pdf: Buffer): Promise<DocumentoPdfjs> {
  const modulo = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
    getDocument(opzioni: { data: Uint8Array; useSystemFonts: boolean }): { promise: Promise<DocumentoPdfjs> };
  };
  return modulo.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
}

/** Il testo di una pagina come lo vede pdfjs, ricomposto in righe. */
async function testoPdfjs(documento: DocumentoPdfjs, n: number): Promise<LetturaPdfjs> {
  const pagina = await documento.getPage(n);
  const frammenti: RigaTesto[] = (await pagina.getTextContent()).items
    .filter((i): i is VocePdfjs & { str: string } => typeof i.str === 'string' && i.str.trim() !== '')
    /* I richiami di nota in apice sono cifre a corpo piccolo: nella
       trascrizione sono ¹⁸ (e si tolgono), qui diventerebbero un «18» perso. */
    .filter((i) => !(/^\d{1,2}$/.test(i.str.trim()) && Math.abs(i.transform[0]!) < 6.5))
    .map((i) => ({ testo: i.str, x: i.transform[4]!, y: i.transform[5]!, larghezza: i.width ?? 0 }));

  if (!frammenti.length) return { testo: '', righe: [], caratteri: 0 };

  frammenti.sort((p, q) => q.y - p.y || p.x - q.x);
  const gruppi: RigaTesto[][] = [];
  let corrente: RigaTesto[] = [];
  let yCorrente = frammenti[0]!.y;
  for (const f of frammenti) {
    if (Math.abs(f.y - yCorrente) > 2) {
      gruppi.push(corrente);
      corrente = [];
      yCorrente = f.y;
    }
    corrente.push(f);
  }
  gruppi.push(corrente);

  const righe = gruppi.map((riga) => {
    riga.sort((p, q) => p.x - q.x);
    let s = '';
    let fine: number | undefined;
    for (const f of riga) {
      if (fine !== undefined && f.x - fine > 1 && !s.endsWith(' ')) s += ' ';
      s += f.testo;
      fine = f.x + f.larghezza;
    }
    return s.replace(/[ \t]+/g, ' ').trim();
  });

  const testo = righe.join('\n');
  return { testo, righe, caratteri: testo.length };
}

/** Il layer di testo di tutte le pagine, in ordine. */
export async function leggiConPdfjs(pdf: Buffer): Promise<LetturaPdfjs[]> {
  const documento = await apriPdf(pdf);
  const letture: LetturaPdfjs[] = [];
  for (let n = 1; n <= documento.numPages; n++) letture.push(await testoPdfjs(documento, n));
  return letture;
}

// ---------------------------------------------------------------------------
// Il secondo testimone: Mistral OCR, una chiamata sola per l'intero PDF
// (4 $ ogni 1.000 pagine). È l'unico che vede il testo dentro le immagini.
// ---------------------------------------------------------------------------

interface PaginaOcrGrezza {
  index: number;
  markdown?: string;
  header?: string;
  footer?: string;
  tables?: { id?: string; content?: string; markdown?: string; html?: string; text?: string }[];
  confidence_scores?: { average_page_confidence_score?: number };
}

/**
 * Il testo di una pagina OCR: markdown con le tabelle innestate al posto dei
 * rimandi `[tbl-N.md](tbl-N.md)`, senza i rimandi alle immagini. Header e
 * footer restano a parte: sono contenuto (il blocco di testa di un DIP) o
 * cornice (il titolo corrente) a seconda che tornino uguali su più pagine, e
 * lo decide chi confronta.
 */
function testoOcr(pagina: PaginaOcrGrezza): LetturaOcr {
  let md = pagina.markdown ?? '';
  (pagina.tables ?? []).forEach((t, i) => {
    const id = (t.id ?? `tbl-${i}`).replace(/\.md$/, '');
    const contenuto = t.content ?? t.markdown ?? t.html ?? t.text ?? '';
    const rimando = new RegExp(`\\[${id}\\.md\\]\\(${id}\\.md\\)`, 'g');
    if (rimando.test(md)) md = md.replace(rimando, contenuto);
    else md += `\n\n${contenuto}`;
  });
  md = md.replace(/^!\[[^\]]*\]\([^)]*\)\s*$/gm, '');
  const confidenza = pagina.confidence_scores?.average_page_confidence_score;
  return {
    corpo: md.trim(),
    header: (pagina.header ?? '').trim(),
    footer: (pagina.footer ?? '').trim(),
    ...(confidenza !== undefined && { confidenza }),
  };
}

/**
 * La lettura OCR dell'intero PDF, in una chiamata. Senza chiave il testimone
 * non c'è: si torna `undefined` e il giudizio lo dà il solo pdfjs, come nella
 * skill quando `MISTRAL_API_KEY` manca.
 */
export async function leggiConOcr(pdf: Buffer): Promise<LetturaOcr[] | undefined> {
  const chiave = configurazione().MISTRAL_API_KEY;
  if (!chiave) return undefined;

  const risposta = await fetch(ENDPOINT_OCR, {
    method: 'POST',
    headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: configurazione().MODELLO_OCR,
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${pdf.toString('base64')}`,
      },
      table_format: 'markdown',
      extract_header: true,
      extract_footer: true,
      confidence_scores_granularity: 'page',
    }),
  });
  if (!risposta.ok) {
    /* Un testimone che non risponde non ferma l'ingestion: resta l'altro, e
       il job lo dichiara nel log. */
    throw new Error(`Mistral OCR: HTTP ${risposta.status} ${(await risposta.text()).slice(0, 300)}`);
  }
  const esito = (await risposta.json()) as { pages?: PaginaOcrGrezza[] };
  const pagine = esito.pages ?? [];
  const letture: LetturaOcr[] = [];
  for (const pagina of pagine) letture[pagina.index] = testoOcr(pagina);
  return letture;
}

// ---------------------------------------------------------------------------
// Il confronto
// ---------------------------------------------------------------------------

export interface PaginaDaGiudicare {
  /** Il numero di pagina, 1-based. */
  pagina: number;
  /** La trascrizione del modello; `undefined` se quella pagina manca. */
  trascrizione: string | undefined;
  pdfjs: LetturaPdfjs;
  ocr: LetturaOcr | undefined;
}

/**
 * Il verdetto pagina per pagina.
 *
 * `certo`  un numero presente in **entrambi** i testimoni e assente nella
 *          trascrizione (o comparso nella trascrizione e assente in entrambi);
 * `guarda` uno scarto visto da un solo testimone, o parole perse oltre la
 *          tolleranza: la pagina va al secondo sguardo;
 * `ok`     nessuno scarto che conti.
 */
export function giudica(pagine: PaginaDaGiudicare[]): GiudizioPagina[] {
  const cornice = riconosciCornice(pagine);

  return pagine.map((p): GiudizioPagina => {
    if (p.trascrizione === undefined) {
      return { pagina: p.pagina, esito: 'guarda', note: ['trascrizione mancante'] };
    }

    const trascritto = conta(p.trascrizione, cornice);
    const cieco = p.pdfjs.caratteri < CARATTERI_MINIMI;
    const lettoPdfjs = cieco ? undefined : conta(p.pdfjs.testo, cornice);
    const lettoPdfjsGrezzo = cieco ? undefined : conta(p.pdfjs.testo, new Set<string>());

    const testoOcrIntero = p.ocr ? [p.ocr.header, p.ocr.corpo, p.ocr.footer].join('\n') : undefined;
    /* Per i «persi» il testimone va letto senza cornice (nessuno pretende il
       piè di pagina); per i «comparsi» con tutto, perché un titolo di sezione
       che torna anche come linguetta non è inventato. */
    const lettoOcr = testoOcrIntero === undefined ? undefined : conta(testoOcrIntero, cornice);
    const lettoOcrGrezzo =
      testoOcrIntero === undefined ? undefined : conta(testoOcrIntero, new Set<string>());

    const persiOcr = lettoOcr ? differenza(lettoOcr, trascritto) : [];
    const comparsiOcr = lettoOcrGrezzo ? assenti(trascritto, lettoOcrGrezzo) : [];
    const persiPdfjs = lettoPdfjs ? differenza(lettoPdfjs, trascritto) : [];
    const comparsiPdfjs = lettoPdfjsGrezzo ? assenti(trascritto, lettoPdfjsGrezzo) : [];

    const dueTestimoni = Boolean(lettoOcr && lettoPdfjs);
    /* I «comparsi» si giudicano per presenza, non per molteplicità: una cella
       unita ripetuta su ogni riga della tabella non è un numero inventato. */
    const numeriCerti = dueTestimoni
      ? [
          ...intersezione(persiOcr.filter(haCifre), persiPdfjs.filter(haCifre)),
          ...intersezione(comparsiOcr.filter(haCifre), comparsiPdfjs.filter(haCifre)).map((t) => `+${t}`),
        ]
      : [];
    const numeriDubbi = dueTestimoni
      ? [
          ...persiOcr.filter(haCifre).filter((t) => !numeriCerti.includes(t)),
          ...persiPdfjs.filter(haCifre).filter((t) => !numeriCerti.includes(t)),
        ]
      : [
          ...persiOcr.filter(haCifre),
          ...comparsiOcr.filter(haCifre).map((t) => `+${t}`),
          ...persiPdfjs.filter(haCifre),
        ];

    /* Parole: perse davanti a entrambi i testimoni, o al solo testimone che
       c'è. Si contano distinte: la stessa intestazione ripetuta quattro volte
       è un'unificazione di tabella, una frase saltata sono parole diverse. */
    const senzaCifre = (t: string): boolean => !haCifre(t);
    const parolePerse = dueTestimoni
      ? intersezione(persiOcr.filter(senzaCifre), persiPdfjs.filter(senzaCifre))
      : [...persiOcr.filter(senzaCifre), ...persiPdfjs.filter(senzaCifre)];
    const paroleDistinte = new Set(parolePerse).size;

    let esito: EsitoPagina = 'ok';
    if (numeriCerti.length) esito = 'certo';
    else if (numeriDubbi.length || paroleDistinte > PAROLE_TOLLERATE) esito = 'guarda';

    const note: string[] = [];
    if (cieco) note.push('pdfjs cieco: giudica il solo OCR');
    if (!p.ocr) note.push('senza OCR: giudica il solo pdfjs');
    if (p.ocr?.confidenza !== undefined) note.push(`conf. OCR ${p.ocr.confidenza.toFixed(2)}`);
    if (numeriCerti.length) note.push(`numeri certi: ${numeriCerti.slice(0, 10).join(' ')}`);
    if (numeriDubbi.length) note.push(`numeri da un solo testimone: ${numeriDubbi.slice(0, 10).join(' ')}`);
    if (paroleDistinte > PAROLE_TOLLERATE) {
      note.push(`${paroleDistinte} parole perse: ${[...new Set(parolePerse)].slice(0, 12).join(' ')}`);
    }
    return { pagina: p.pagina, esito, note };
  });
}

/**
 * La cornice: righe di bordo (pdfjs), header e footer (OCR) che tornano su
 * più pagine, con le cifre mascherate. Si toglie da tutte le letture, o il
 * piè di pagina risulterebbe «perso» su ogni pagina del documento.
 */
function riconosciCornice(pagine: PaginaDaGiudicare[]): Set<string> {
  const quante = new Map<string, number>();
  for (const p of pagine) {
    const righe = p.pdfjs.righe;
    const candidate = new Set(
      [
        ...righe.slice(0, 2),
        ...righe.slice(-2),
        ...(p.ocr?.header.split('\n') ?? []),
        ...(p.ocr?.footer.split('\n') ?? []),
      ]
        .filter((r) => r.trim().length >= 3 && r.length < 200)
        .map(modelloDiRiga),
    );
    for (const m of candidate) quante.set(m, (quante.get(m) ?? 0) + 1);
  }
  /* Su un documento corto la soglia fissa non si raggiunge mai: vale anche il
     60% delle pagine, come nel testimone della skill sui documenti logici. */
  const soglia = Math.min(PAGINE_DECORAZIONE, Math.max(2, Math.ceil(pagine.length * 0.6)));
  return new Set([...quante].filter(([, n]) => n >= soglia).map(([m]) => m));
}

// --- Tokenizzazione: identica a `tools/testimone-ocr.mjs` -------------------

function conta(testo: string, cornice: Set<string>): Map<string, number> {
  const c = new Map<string, number>();
  const righe = testo.split('\n').filter((r) => !cornice.has(modelloDiRiga(r)));
  for (const t of spezza(righe.join('\n'))) c.set(t, (c.get(t) ?? 0) + 1);
  return c;
}

/** I token di `a` che in `b` non compaiono mai (presenza, non molteplicità). */
function assenti(a: Map<string, number>, b: Map<string, number>): string[] {
  const fuori: string[] = [];
  for (const [t, n] of a) if (!b.get(t)) for (let i = 0; i < n; i++) fuori.push(t);
  return fuori;
}

function spezza(testo: string): string[] {
  return (
    testo
      /* Richiami di nota in apice: ¹ ² ³ nel PDF, $^{1}$ nell'OCR. Non sono
         numeri del contratto. */
      .replace(/\$\^\{[^}]*\}\$/g, ' ')
      .replace(/[¹²³⁰⁴-⁹]/g, '')
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
      .filter((t) => t.length > 1 || /\d/.test(t))
  );
}

/**
 * Il modello di una riga di bordo: cifre mascherate, parole in ordine
 * alfabetico. Il titolo corrente alterna il lato fra pagine pari e dispari
 * («7 di 36 NORME…» / «NORME… 8 di 36») e deve restare lo stesso modello.
 */
function modelloDiRiga(riga: string): string {
  return riga
    .replace(/[.·]{3,}/g, '…')
    .replace(/[–—]/g, '-')
    .replace(/[*_>#|]/g, '')
    .replace(/\d+/g, '@')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function differenza(a: Map<string, number>, b: Map<string, number>): string[] {
  const fuori: string[] = [];
  for (const [t, n] of a) {
    const m = b.get(t) ?? 0;
    for (let i = 0; i < n - m; i++) fuori.push(t);
  }
  return fuori;
}

function intersezione(a: string[], b: string[]): string[] {
  const resto = new Map<string, number>();
  for (const t of b) resto.set(t, (resto.get(t) ?? 0) + 1);
  const fuori: string[] = [];
  for (const t of a) {
    const quanti = resto.get(t) ?? 0;
    if (!quanti) continue;
    resto.set(t, quanti - 1);
    fuori.push(t);
  }
  return fuori;
}

/**
 * Un numero che conta: importi, percentuali, articoli, date, termini a due
 * cifre. Una cifra sola è quasi sempre un richiamo di nota o un numero
 * d'elenco; una parola con una cifra incollata («nellagaranzia4») è il layer
 * di testo che ha perso lo spazio prima del richiamo. Entrambi restano nel
 * confronto delle parole, con la sua tolleranza.
 */
function haCifre(t: string): boolean {
  return /\d/.test(t) && !/^\d$/.test(t) && !/^[a-zà-ù]{4,}\d{1,2}$/.test(t) && !/\d[%€]?[a-zà-ù]{3,}/.test(t);
}
