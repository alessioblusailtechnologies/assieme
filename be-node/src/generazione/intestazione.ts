import {
  AlignmentType,
  ImageRun,
  PageNumber,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';

import type {
  Allineamento,
  Blocco,
  BloccoColonna,
  Dimensione,
  Fascia,
  Immagine,
  Marca,
  NomeCampo,
  Paragrafo,
} from '../contratto/intestazione.js';
import { larghezzaTesto } from './misura.js';

/**
 * La resa di intestazione e piè di pagina (11/09/2026): un JSON solo, lo
 * stesso che l'agenzia compone nell'editor, e tre uscite.
 *
 * - **PDF** (pdf-lib): le fasce si impaginano nella larghezza utile della
 *   pagina e se ne misura l'altezza, da cui il corpo ricava i suoi margini.
 *   I campi si risolvono pagina per pagina: il totale lo si conosce solo
 *   dopo aver impaginato il corpo, e infatti le fasce si disegnano per
 *   ultime.
 * - **Word** (`docx`): `Header` e `Footer` con paragrafi, immagini, una
 *   tabella senza bordi per le colonne, i campi `PAGE` e `NUMPAGES`.
 * - **Excel** (exceljs): le fasce di stampa sinistra, centro e destra, solo
 *   testo. Excel non ne sa fare di più senza trucchi che poi non reggono.
 *
 * Lo schema è vincolato (`contratto/intestazione.ts`) proprio perché queste
 * tre rese dicano la stessa cosa dell'anteprima.
 */

export interface ImmagineFascia {
  byte: Buffer;
  tipo: 'png' | 'jpg';
  larghezzaPx: number;
  altezzaPx: number;
}

export interface FasceDocumento {
  intestazione: Fascia;
  piede: Fascia;
  /** Le immagini citate dalle fasce, per id. Una che manca si salta: non ferma il documento. */
  immagini: Map<string, ImmagineFascia>;
  /** I campi che non dipendono dalla pagina. */
  campi: { titolo: string; data: string; agenzia: string };
}

export interface ContestoPagina {
  pagina: number;
  pagine: number;
}

/** Le misure dei tre corpi di testo, in punti tipografici. */
const PUNTI: Record<Dimensione, number> = { piccolo: 7.5, normale: 9, grande: 12 };

const COLORE_TESTO = '#262626';
const MM = 72 / 25.4;
const SPAZIO_FRA_BLOCCHI = 3;
const SPAZIO_FRA_COLONNE = 14;

interface Stile {
  grassetto: boolean;
  corsivo: boolean;
  sottolineato: boolean;
  dimensione: Dimensione;
  colore: string;
}

function stileDi(marche: Marca[] | undefined): Stile {
  const stile: Stile = { grassetto: false, corsivo: false, sottolineato: false, dimensione: 'normale', colore: COLORE_TESTO };
  for (const m of marche ?? []) {
    if (m.type === 'bold') stile.grassetto = true;
    else if (m.type === 'italic') stile.corsivo = true;
    else if (m.type === 'underline') stile.sottolineato = true;
    else {
      if (m.attrs?.fontSize) stile.dimensione = m.attrs.fontSize;
      if (m.attrs?.color) stile.colore = m.attrs.color;
    }
  }
  return stile;
}

/** Il testo di un campo; per `pagina` e `pagine` serve la pagina. */
export function valoreCampo(nome: NomeCampo, campi: FasceDocumento['campi'], pagina?: ContestoPagina): string {
  switch (nome) {
    case 'pagina':
      return String(pagina?.pagina ?? 1);
    case 'pagine':
      return String(pagina?.pagine ?? 1);
    case 'data':
      return campi.data;
    case 'titolo':
      return campi.titolo;
    case 'agenzia':
      return campi.agenzia;
  }
}

/** Una fascia senza niente dentro: niente da disegnare, e nessuno spazio da riservarle. */
export function fasciaVuota(fascia: Fascia): boolean {
  return fascia.content.length === 0;
}

// ---------------------------------------------------------------------------
// Immagini: tipo e dimensioni dai byte, senza librerie
// ---------------------------------------------------------------------------

export function tipoImmagine(byte: Buffer): 'png' | 'jpg' | undefined {
  if (byte.length > 8 && byte.readUInt32BE(0) === 0x89504e47) return 'png';
  if (byte.length > 3 && byte[0] === 0xff && byte[1] === 0xd8 && byte[2] === 0xff) return 'jpg';
  return undefined;
}

/** Larghezza e altezza in pixel: dall'IHDR di un PNG, dal primo SOF di un JPEG. */
export function dimensioniImmagine(byte: Buffer): { larghezzaPx: number; altezzaPx: number } | undefined {
  const tipo = tipoImmagine(byte);
  if (tipo === 'png') {
    if (byte.length < 24) return undefined;
    return { larghezzaPx: byte.readUInt32BE(16), altezzaPx: byte.readUInt32BE(20) };
  }
  if (tipo === 'jpg') {
    let i = 2;
    while (i + 9 < byte.length) {
      if (byte[i] !== 0xff) {
        i++;
        continue;
      }
      const marcatore = byte[i + 1]!;
      const lunghezza = byte.readUInt16BE(i + 2);
      const sof = marcatore >= 0xc0 && marcatore <= 0xcf && marcatore !== 0xc4 && marcatore !== 0xc8 && marcatore !== 0xcc;
      if (sof) return { altezzaPx: byte.readUInt16BE(i + 5), larghezzaPx: byte.readUInt16BE(i + 7) };
      i += 2 + lunghezza;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface FontPdf {
  normale: PDFFont;
  grassetto: PDFFont;
  corsivo: PDFFont;
  grassettoCorsivo: PDFFont;
}

interface Parola {
  testo: string;
  font: PDFFont;
  dimensione: number;
  colore: RGB;
  sottolineato: boolean;
  /** Vero se prima c'era uno spazio: solo lì si può andare a capo. */
  spazioPrima: boolean;
}

interface RigaPdf {
  parole: Parola[];
  larghezza: number;
  altezza: number;
  dimensione: number;
}

/** Ciò che un blocco impaginato sa fare: dire quanto è alto e disegnarsi. */
interface Impaginato {
  altezza: number;
  disegna(pagina: PDFPage, x: number, yCima: number): void;
}

export interface FascePdf {
  altezzaIntestazione: number;
  altezzaPiede: number;
  /** Disegna intestazione e piè sulla pagina, coi campi di quella pagina. */
  disegna(pagina: PDFPage, contesto: ContestoPagina): void;
}

function coloreRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

const xAllineato = (allineamento: Allineamento, x: number, disponibile: number, occupato: number): number =>
  allineamento === 'center' ? x + (disponibile - occupato) / 2 : allineamento === 'right' ? x + disponibile - occupato : x;

/**
 * Prepara le fasce per un documento: incorpora le immagini una volta sola,
 * misura le altezze (con un contesto di pagina rappresentativo: i numeri di
 * pagina cambiano di una cifra, non di una riga) e restituisce chi le
 * disegna pagina per pagina.
 */
export async function preparaFascePdf(
  doc: PDFDocument,
  fasce: FasceDocumento,
  font: FontPdf,
  sanifica: (testo: string) => string,
  geometria: { larghezzaPagina: number; altezzaPagina: number; margine: number; cima: number; fondo: number },
): Promise<FascePdf> {
  const incorporate = new Map<string, PDFImage>();
  for (const [id, immagine] of fasce.immagini) {
    try {
      incorporate.set(id, immagine.tipo === 'png' ? await doc.embedPng(immagine.byte) : await doc.embedJpg(immagine.byte));
    } catch {
      /* Un'immagine illeggibile non deve far fallire il documento. */
    }
  }

  const larghezza = geometria.larghezzaPagina - geometria.margine * 2;

  const fontDi = (s: Stile): PDFFont =>
    s.grassetto && s.corsivo ? font.grassettoCorsivo : s.grassetto ? font.grassetto : s.corsivo ? font.corsivo : font.normale;

  /** Le parole di un paragrafo, con lo spazio che le precede e i campi già risolti. */
  const parole = (p: Paragrafo, contesto: ContestoPagina): Array<Parola | 'a-capo'> => {
    const fuori: Array<Parola | 'a-capo'> = [];
    let spazio = false;
    const aggiungi = (testo: string, stile: Stile): void => {
      for (const pezzo of sanifica(testo).split(/( +)/)) {
        if (!pezzo) continue;
        if (/^ +$/.test(pezzo)) {
          spazio = true;
          continue;
        }
        fuori.push({
          testo: pezzo,
          font: fontDi(stile),
          dimensione: PUNTI[stile.dimensione],
          colore: coloreRgb(stile.colore),
          sottolineato: stile.sottolineato,
          spazioPrima: spazio,
        });
        spazio = false;
      }
    };
    for (const nodo of p.content ?? []) {
      if (nodo.type === 'hardBreak') {
        fuori.push('a-capo');
        spazio = false;
      } else if (nodo.type === 'text') {
        aggiungi(nodo.text, stileDi(nodo.marks));
      } else {
        aggiungi(valoreCampo(nodo.attrs.nome, fasce.campi, contesto), stileDi(nodo.marks));
      }
    }
    return fuori;
  };

  const larghezzaParola = (p: Parola): number => larghezzaTesto(p.font, p.testo, p.dimensione);
  const larghezzaSpazio = (p: Parola): number => larghezzaTesto(p.font, ' ', p.dimensione);

  /** Va a capo solo davanti a una parola preceduta da uno spazio: le altre restano attaccate. */
  const righe = (elementi: Array<Parola | 'a-capo'>, disponibile: number): RigaPdf[] => {
    const fuori: RigaPdf[] = [];
    let corrente: RigaPdf = { parole: [], larghezza: 0, altezza: 0, dimensione: 0 };
    const chiudi = (): void => {
      const dimensione = corrente.dimensione || PUNTI.normale;
      fuori.push({ ...corrente, dimensione, altezza: dimensione * 1.3 });
      corrente = { parole: [], larghezza: 0, altezza: 0, dimensione: 0 };
    };
    /* I gruppi: una parola con lo spazio davanti e quelle attaccate dopo. */
    const gruppi: Array<Parola[] | 'a-capo'> = [];
    for (const e of elementi) {
      const ultimo = gruppi[gruppi.length - 1];
      if (e === 'a-capo') gruppi.push('a-capo');
      else if (!e.spazioPrima && Array.isArray(ultimo)) ultimo.push(e);
      else gruppi.push([e]);
    }
    for (const g of gruppi) {
      if (g === 'a-capo') {
        chiudi();
        continue;
      }
      const spazio = corrente.parole.length && g[0]!.spazioPrima ? larghezzaSpazio(g[0]!) : 0;
      const misura = g.reduce((s, p) => s + larghezzaParola(p), 0);
      if (corrente.parole.length && corrente.larghezza + spazio + misura > disponibile) {
        chiudi();
        g[0] = { ...g[0]!, spazioPrima: false };
        corrente.parole.push(...g);
        corrente.larghezza = misura;
      } else {
        if (!corrente.parole.length) g[0] = { ...g[0]!, spazioPrima: false };
        corrente.parole.push(...g);
        corrente.larghezza += spazio + misura;
      }
      corrente.dimensione = Math.max(corrente.dimensione, ...g.map((p) => p.dimensione));
    }
    chiudi();
    return fuori;
  };

  const impaginaParagrafo = (p: Paragrafo, disponibile: number, contesto: ContestoPagina): Impaginato => {
    const allineamento = p.attrs?.textAlign ?? 'left';
    const linee = righe(parole(p, contesto), disponibile);
    return {
      altezza: linee.reduce((s, r) => s + r.altezza, 0),
      disegna(pagina, x, yCima) {
        let y = yCima;
        for (const riga of linee) {
          const base = y - riga.dimensione;
          let cursore = xAllineato(allineamento, x, disponibile, riga.larghezza);
          for (const parola of riga.parole) {
            if (parola.spazioPrima) cursore += larghezzaSpazio(parola);
            const misura = larghezzaParola(parola);
            pagina.drawText(parola.testo, { x: cursore, y: base, size: parola.dimensione, font: parola.font, color: parola.colore });
            if (parola.sottolineato) {
              pagina.drawLine({
                start: { x: cursore, y: base - 1.5 },
                end: { x: cursore + misura, y: base - 1.5 },
                thickness: 0.5,
                color: parola.colore,
              });
            }
            cursore += misura;
          }
          y -= riga.altezza;
        }
      },
    };
  };

  const impaginaImmagine = (b: Immagine, disponibile: number): Impaginato => {
    const immagine = incorporate.get(b.attrs.id);
    if (!immagine) return { altezza: 0, disegna: () => undefined };
    const larghezzaImmagine = Math.min(b.attrs.larghezza * MM, disponibile);
    const altezza = (larghezzaImmagine * immagine.height) / immagine.width;
    return {
      altezza,
      disegna(pagina, x, yCima) {
        pagina.drawImage(immagine, {
          x: xAllineato(b.attrs.allineamento, x, disponibile, larghezzaImmagine),
          y: yCima - altezza,
          width: larghezzaImmagine,
          height: altezza,
        });
      },
    };
  };

  const impaginaBlocchi = (blocchi: Array<Blocco | BloccoColonna>, disponibile: number, contesto: ContestoPagina): Impaginato => {
    const pezzi = blocchi.map((b): Impaginato => {
      if (b.type === 'paragraph') return impaginaParagrafo(b, disponibile, contesto);
      if (b.type === 'immagine') return impaginaImmagine(b, disponibile);
      const n = b.content.length;
      const larghezzaColonna = (disponibile - SPAZIO_FRA_COLONNE * (n - 1)) / n;
      const colonne = b.content.map((c) => impaginaBlocchi(c.content, larghezzaColonna, contesto));
      return {
        altezza: Math.max(...colonne.map((c) => c.altezza)),
        disegna(pagina, x, yCima) {
          colonne.forEach((c, i) => c.disegna(pagina, x + i * (larghezzaColonna + SPAZIO_FRA_COLONNE), yCima));
        },
      };
    });
    const spazi = Math.max(0, pezzi.length - 1) * SPAZIO_FRA_BLOCCHI;
    return {
      altezza: pezzi.reduce((s, p) => s + p.altezza, 0) + spazi,
      disegna(pagina, x, yCima) {
        let y = yCima;
        for (const p of pezzi) {
          p.disegna(pagina, x, y);
          y -= p.altezza + SPAZIO_FRA_BLOCCHI;
        }
      },
    };
  };

  const rappresentativo: ContestoPagina = { pagina: 88, pagine: 88 };
  const altezzaIntestazione = impaginaBlocchi(fasce.intestazione.content, larghezza, rappresentativo).altezza;
  const altezzaPiede = impaginaBlocchi(fasce.piede.content, larghezza, rappresentativo).altezza;

  return {
    altezzaIntestazione,
    altezzaPiede,
    disegna(pagina, contesto) {
      if (!fasciaVuota(fasce.intestazione)) {
        impaginaBlocchi(fasce.intestazione.content, larghezza, contesto).disegna(
          pagina,
          geometria.margine,
          geometria.altezzaPagina - geometria.cima,
        );
      }
      if (!fasciaVuota(fasce.piede)) {
        const piede = impaginaBlocchi(fasce.piede.content, larghezza, contesto);
        piede.disegna(pagina, geometria.margine, geometria.fondo + piede.altezza);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

const ALLINEAMENTO_DOCX = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
} as const;

const PX_PER_MM = 96 / 25.4;

/**
 * Il font delle fasce in Word, dichiarato su ogni run: l'Helvetica del PDF
 * (Arial ne ha le stesse metriche). Senza, header e footer prenderebbero
 * il font del documento in cui finiscono, anche quello di un file della
 * sandbox su cui VELIA li stampa (`timbra.ts`).
 */
const FONT_DOCX = 'Arial';

function runDocx(testo: string | undefined, stile: Stile, pagina?: 'CURRENT' | 'TOTAL_PAGES'): TextRun {
  return new TextRun({
    ...(pagina ? { children: [PageNumber[pagina]] } : { text: testo ?? '' }),
    font: FONT_DOCX,
    bold: stile.grassetto,
    italics: stile.corsivo,
    ...(stile.sottolineato && { underline: {} }),
    size: Math.round(PUNTI[stile.dimensione] * 2),
    color: stile.colore.replace('#', ''),
  });
}

function paragrafoDocx(p: Paragrafo, fasce: FasceDocumento): Paragraph {
  const figli: TextRun[] = [];
  for (const nodo of p.content ?? []) {
    if (nodo.type === 'hardBreak') figli.push(new TextRun({ break: 1 }));
    else if (nodo.type === 'text') figli.push(runDocx(nodo.text, stileDi(nodo.marks)));
    else if (nodo.attrs.nome === 'pagina') figli.push(runDocx(undefined, stileDi(nodo.marks), 'CURRENT'));
    else if (nodo.attrs.nome === 'pagine') figli.push(runDocx(undefined, stileDi(nodo.marks), 'TOTAL_PAGES'));
    else figli.push(runDocx(valoreCampo(nodo.attrs.nome, fasce.campi), stileDi(nodo.marks)));
  }
  return new Paragraph({
    alignment: ALLINEAMENTO_DOCX[p.attrs?.textAlign ?? 'left'],
    spacing: { after: 40 },
    children: figli,
  });
}

function immagineDocx(b: Immagine, fasce: FasceDocumento): Paragraph | undefined {
  const immagine = fasce.immagini.get(b.attrs.id);
  if (!immagine) return undefined;
  const larghezza = Math.round(b.attrs.larghezza * PX_PER_MM);
  const altezza = Math.round((larghezza * immagine.altezzaPx) / Math.max(1, immagine.larghezzaPx));
  return new Paragraph({
    alignment: ALLINEAMENTO_DOCX[b.attrs.allineamento],
    children: [new ImageRun({ type: immagine.tipo, data: immagine.byte, transformation: { width: larghezza, height: altezza } })],
  });
}

function blocchiDocx(blocchi: Array<Blocco | BloccoColonna>, fasce: FasceDocumento): Array<Paragraph | Table> {
  const fuori: Array<Paragraph | Table> = [];
  for (const b of blocchi) {
    if (b.type === 'paragraph') fuori.push(paragrafoDocx(b, fasce));
    else if (b.type === 'immagine') {
      const p = immagineDocx(b, fasce);
      if (p) fuori.push(p);
    } else {
      const quota = Math.floor(100 / b.content.length);
      fuori.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: TableBorders.NONE,
          rows: [
            new TableRow({
              children: b.content.map((colonna) => {
                const figli = blocchiDocx(colonna.content, fasce).filter((x): x is Paragraph => x instanceof Paragraph);
                return new TableCell({
                  width: { size: quota, type: WidthType.PERCENTAGE },
                  borders: TableBorders.NONE,
                  children: figli.length ? figli : [new Paragraph({})],
                });
              }),
            }),
          ],
        }),
      );
    }
  }
  return fuori;
}

/** Il contenuto di un `Header` o `Footer` di Word; vuoto se la fascia è vuota. */
export function fasciaDocx(fascia: Fascia, fasce: FasceDocumento): Array<Paragraph | Table> {
  return blocchiDocx(fascia.content, fasce);
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

/** Excel non accetta intestazioni più lunghe di così. */
const MASSIMO_EXCEL = 255;

/**
 * Le fasce di stampa di Excel: `&L`, `&C`, `&R`. Una riga a colonne va nelle
 * tre sezioni (due colonne: sinistra e destra); un paragrafo fuori dalle
 * colonne va nella sezione del suo allineamento. Solo testo: le immagini in
 * un'intestazione di Excel non reggono fra un programma e l'altro.
 */
export function fasciaXlsx(fascia: Fascia, campi: FasceDocumento['campi']): string {
  const sezioni: Record<Allineamento, string[]> = { left: [], center: [], right: [] };
  const testoParagrafo = (p: Paragrafo): string => {
    let s = '';
    for (const nodo of p.content ?? []) {
      if (nodo.type === 'hardBreak') s += '\n';
      else if (nodo.type === 'text') s += nodo.text.replace(/&/g, '&&');
      else if (nodo.attrs.nome === 'pagina') s += '&P';
      else if (nodo.attrs.nome === 'pagine') s += '&N';
      else if (nodo.attrs.nome === 'data') s += '&D';
      else s += valoreCampo(nodo.attrs.nome, campi).replace(/&/g, '&&');
    }
    return s.trim();
  };
  for (const b of fascia.content) {
    if (b.type === 'paragraph') {
      const testo = testoParagrafo(b);
      if (testo) sezioni[b.attrs?.textAlign ?? 'left'].push(testo);
    } else if (b.type === 'colonne') {
      const posti: Allineamento[] = b.content.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
      b.content.forEach((colonna, i) => {
        for (const x of colonna.content) {
          if (x.type !== 'paragraph') continue;
          const testo = testoParagrafo(x);
          if (testo) sezioni[posti[i]!].push(testo);
        }
      });
    }
  }
  const pezzi: string[] = [];
  if (sezioni.left.length) pezzi.push(`&L${sezioni.left.join('\n')}`);
  if (sezioni.center.length) pezzi.push(`&C${sezioni.center.join('\n')}`);
  if (sezioni.right.length) pezzi.push(`&R${sezioni.right.join('\n')}`);
  return pezzi.join('').slice(0, MASSIMO_EXCEL);
}
