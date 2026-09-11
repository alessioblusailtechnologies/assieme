import {
  AlignmentType,
  FrameAnchorType,
  FrameWrap,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  PageNumber,
  Paragraph,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WpsShapeRun,
  type IFloating,
  type IFrameOptions,
} from 'docx';
import { StandardFontEmbedder, StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';

import {
  LARGHEZZA_FOGLIO,
  type Allineamento,
  type Ancoraggio,
  type Elemento,
  type ElementoTesto,
  type Famiglia,
  type Fascia,
  type Marca,
  type NomeCampo,
  type Paragrafo,
} from '../contratto/intestazione.js';

/**
 * La resa di intestazione e piè di pagina (11/09/2026): una tela per fascia,
 * la stessa che l'agenzia compone nell'editor, e tre uscite.
 *
 * - **PDF** (pdf-lib): ogni elemento si disegna alle sue coordinate; il testo
 *   di una casella va a capo nella sua larghezza e sta in cima, a metà o in
 *   fondo. I campi si risolvono pagina per pagina: il totale lo si conosce
 *   solo dopo aver impaginato il corpo, e infatti le fasce si disegnano per
 *   ultime.
 * - **Word** (`docx`): `Header` e `Footer` con un paragrafo alto quanto la
 *   fascia, a cui sono ancorate immagini e forme; le caselle di testo sono
 *   cornici di paragrafo nelle stesse posizioni; i campi `PAGE` e
 *   `NUMPAGES`.
 * - **Excel** (exceljs): le fasce di stampa sinistra, centro e destra, solo
 *   testo, secondo dove sta la casella sul foglio.
 *
 * Il testo si impagina con le metriche dei font standard del PDF anche per
 * Word, e con le regole dell'editor: interlinea 1,3 del corpo più grande
 * della riga, mai meno del corpo della casella. Così la casella è alta
 * uguale nei tre posti.
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

/** Un millimetro in punti tipografici. */
export const MM = 72 / 25.4;
/** Il margine del corpo sui quattro lati, in punti: anche il minimo sotto una fascia bassa. */
export const MARGINE = 56;
/** Il respiro fra una fascia e il corpo, in punti. */
export const RESPIRO = 16;

const INTERLINEA = 1.3;

/** Dove comincia (o finisce) il corpo, in punti dal bordo: dopo la fascia e il respiro, mai più vicino del margine. */
export const margineCorpo = (altezzaFascia: number): number =>
  altezzaFascia ? Math.max(MARGINE, altezzaFascia + RESPIRO) : MARGINE;

interface Stile {
  grassetto: boolean;
  corsivo: boolean;
  sottolineato: boolean;
  dimensione: number;
  famiglia: Famiglia;
  colore: string;
}

function stileDi(marche: Marca[] | undefined, casella: ElementoTesto): Stile {
  const stile: Stile = {
    grassetto: false,
    corsivo: false,
    sottolineato: false,
    dimensione: casella.dimensione,
    famiglia: casella.famiglia,
    colore: casella.colore,
  };
  for (const m of marche ?? []) {
    if (m.type === 'bold') stile.grassetto = true;
    else if (m.type === 'italic') stile.corsivo = true;
    else if (m.type === 'underline') stile.sottolineato = true;
    else {
      if (m.attrs?.fontSize) stile.dimensione = m.attrs.fontSize;
      if (m.attrs?.fontFamily) stile.famiglia = m.attrs.fontFamily;
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
  return fascia.elementi.length === 0;
}

/**
 * Di quanto spostare un elemento su un foglio che non è largo 210 mm (un
 * file della sandbox in orizzontale, per dire): ciò che sta nel terzo
 * sinistro resta dal bordo sinistro, ciò che sta in quello destro dal
 * destro, il resto al centro.
 */
export function spostamentoOrizzontale(e: Elemento, larghezzaFoglioMm: number): number {
  const scarto = larghezzaFoglioMm - LARGHEZZA_FOGLIO;
  if (Math.abs(scarto) < 0.5) return 0;
  const centro = e.x + e.larghezza / 2;
  if (centro < LARGHEZZA_FOGLIO / 3) return 0;
  return centro > (LARGHEZZA_FOGLIO * 2) / 3 ? scarto : scarto / 2;
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
// Il testo di una casella: parole, righe, altezza
// ---------------------------------------------------------------------------

/** I quattro tagli di ogni famiglia: normale, grassetto, corsivo, grassetto corsivo. */
const FONT_PDF: Record<Famiglia, readonly [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

const nomeFont = (s: Stile): StandardFonts => FONT_PDF[s.famiglia][(s.grassetto ? 1 : 0) + (s.corsivo ? 2 : 0)]!;

/**
 * Dove cade la linea di base in una riga alta 1,3 volte il corpo, in corpi
 * dalla cima: mezza interlinea più l'ascendente, come lo calcola il browser
 * con Arial, Times New Roman e Courier New (le metriche dei font del PDF).
 */
const BASE_LINEA: Record<Famiglia, number> = { sans: 0.997, serif: 0.988, mono: 0.917 };

const metriche = new Map<StandardFonts, StandardFontEmbedder>();

/** Le metriche di un font standard, senza bisogno di un documento: servono anche a Word. */
function metrica(nome: StandardFonts): StandardFontEmbedder {
  let m = metriche.get(nome);
  if (!m) {
    m = StandardFontEmbedder.for(nome as unknown as Parameters<typeof StandardFontEmbedder.for>[0]);
    metriche.set(nome, m);
  }
  return m;
}

const codificabili = new Set(metrica(StandardFonts.Helvetica).encoding.supportedCodePoints);

/** Ciò che WinAnsi non codifica corromperebbe il PDF: diventa `?`. Tabulazioni e a capo diventano spazi. */
export function sanificaPdf(testo: string): string {
  return [...testo.replace(/[\t\r\n]/g, ' ')].map((c) => (codificabili.has(c.codePointAt(0) ?? 0) ? c : '?')).join('');
}

/**
 * La larghezza di un testo come `drawText` lo disegna: carattere per
 * carattere, perché `widthOfTextAtSize` misura con la crenatura e il disegno
 * è senza (`misura.ts`).
 */
function larghezza(testo: string, stile: Stile): number {
  const m = metrica(nomeFont(stile));
  let totale = 0;
  for (const c of testo) totale += m.widthOfTextAtSize(c, stile.dimensione);
  return totale;
}

interface Parola {
  /** Già sanificato: è ciò che si misura e si disegna. */
  testo: string;
  stile: Stile;
  /** Quanti spazi la precedono: solo lì si può andare a capo. */
  spazi: number;
}

interface Riga {
  parole: Parola[];
  larghezza: number;
  /** Il corpo più grande della riga, mai meno di quello della casella: l'altezza è 1,3 volte questo. */
  dimensione: number;
  famiglia: Famiglia;
  allineamento: Allineamento;
}

interface TestoImpaginato {
  righe: Riga[];
  /** Del solo testo, in punti. */
  altezza: number;
}

const larghezzaSpazi = (p: Parola): number => (p.spazi ? larghezza(' ', p.stile) * p.spazi : 0);

function parole(p: Paragrafo, casella: ElementoTesto, campi: FasceDocumento['campi'], contesto: ContestoPagina): Array<Parola | 'a-capo'> {
  const fuori: Array<Parola | 'a-capo'> = [];
  let spazi = 0;
  const aggiungi = (testo: string, stile: Stile): void => {
    for (const pezzo of sanificaPdf(testo).split(/( +)/)) {
      if (!pezzo) continue;
      if (pezzo.startsWith(' ')) {
        spazi += pezzo.length;
        continue;
      }
      fuori.push({ testo: pezzo, stile, spazi });
      spazi = 0;
    }
  };
  for (const nodo of p.content ?? []) {
    if (nodo.type === 'hardBreak') {
      fuori.push('a-capo');
      spazi = 0;
    } else if (nodo.type === 'text') aggiungi(nodo.text, stileDi(nodo.marks, casella));
    else aggiungi(valoreCampo(nodo.attrs.nome, campi, contesto), stileDi(nodo.marks, casella));
  }
  return fuori;
}

/**
 * Le righe di una casella: si va a capo solo davanti a una parola preceduta
 * da spazi, le altre restano attaccate; una parola più lunga della casella
 * ne esce, come nell'editor.
 */
function impaginaTesto(casella: ElementoTesto, campi: FasceDocumento['campi'], contesto: ContestoPagina): TestoImpaginato {
  const disponibile = casella.larghezza * MM;
  const righe: Riga[] = [];
  for (const p of casella.paragrafi) {
    const allineamento = p.attrs?.textAlign ?? 'left';
    let corrente: Riga | undefined;
    const nuova = (): Riga => ({ parole: [], larghezza: 0, dimensione: casella.dimensione, famiglia: casella.famiglia, allineamento });
    const chiudi = (): void => {
      righe.push(corrente ?? nuova());
      corrente = undefined;
    };
    /* I gruppi: una parola con gli spazi davanti e quelle attaccate dopo. */
    const gruppi: Array<Parola[] | 'a-capo'> = [];
    for (const e of parole(p, casella, campi, contesto)) {
      const ultimo = gruppi[gruppi.length - 1];
      if (e === 'a-capo') gruppi.push('a-capo');
      else if (!e.spazi && Array.isArray(ultimo)) ultimo.push(e);
      else gruppi.push([e]);
    }
    for (const g of gruppi) {
      if (g === 'a-capo') {
        chiudi();
        continue;
      }
      const misura = g.reduce((s, x) => s + larghezza(x.testo, x.stile), 0);
      if (corrente?.parole.length && corrente.larghezza + larghezzaSpazi(g[0]!) + misura > disponibile) chiudi();
      corrente ??= nuova();
      /* A inizio riga gli spazi non si vedono. */
      const primo = corrente.parole.length ? g[0]! : { ...g[0]!, spazi: 0 };
      corrente.larghezza += larghezzaSpazi(primo) + misura;
      corrente.parole.push(primo, ...g.slice(1));
      for (const x of g) {
        if (x.stile.dimensione > corrente.dimensione) {
          corrente.dimensione = x.stile.dimensione;
          corrente.famiglia = x.stile.famiglia;
        }
      }
    }
    chiudi();
  }
  return { righe, altezza: righe.reduce((s, r) => s + r.dimensione * INTERLINEA, 0) };
}

/** Il rappresentativo dei numeri di pagina, per le misure: cambiano di una cifra, non di una riga. */
const RAPPRESENTATIVO: ContestoPagina = { pagina: 88, pagine: 88 };

/** L'altezza di un elemento sulla carta, in punti: una casella è alta almeno quanto il suo testo. */
function altezzaElemento(e: Elemento, campi: FasceDocumento['campi']): number {
  if (e.tipo !== 'testo') return e.altezza * MM;
  return Math.max(e.altezza * MM, impaginaTesto(e, campi, RAPPRESENTATIVO).altezza);
}

/** L'altezza di una fascia sulla carta, in punti: la sua, o di più se un testo sporge sotto. */
function altezzaFascia(fascia: Fascia, campi: FasceDocumento['campi']): number {
  if (fasciaVuota(fascia)) return 0;
  return Math.max(fascia.altezza * MM, ...fascia.elementi.map((e) => e.y * MM + altezzaElemento(e, campi)));
}

const scostamentoVerticale = (verticale: Ancoraggio, disponibile: number, occupato: number): number =>
  verticale === 'middle' ? (disponibile - occupato) / 2 : verticale === 'bottom' ? disponibile - occupato : 0;

const xAllineato = (allineamento: Allineamento, disponibile: number, occupato: number): number =>
  allineamento === 'center' ? (disponibile - occupato) / 2 : allineamento === 'right' ? disponibile - occupato : 0;

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export interface FascePdf {
  /** In punti; zero per una fascia vuota. */
  altezzaIntestazione: number;
  altezzaPiede: number;
  /** Disegna intestazione e piè sulla pagina, coi campi di quella pagina. */
  disegna(pagina: PDFPage, contesto: ContestoPagina): void;
}

function coloreRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

/**
 * Prepara le fasce per un documento con pagine di queste misure (in punti):
 * incorpora immagini e font una volta sola, misura le altezze e restituisce
 * chi le disegna pagina per pagina.
 */
export async function preparaFascePdf(
  doc: PDFDocument,
  fasce: FasceDocumento,
  pagina: { larghezza: number; altezza: number },
): Promise<FascePdf> {
  const incorporate = new Map<string, PDFImage>();
  for (const [id, immagine] of fasce.immagini) {
    try {
      incorporate.set(id, immagine.tipo === 'png' ? await doc.embedPng(immagine.byte) : await doc.embedJpg(immagine.byte));
    } catch {
      /* Un'immagine illeggibile non deve far fallire il documento. */
    }
  }

  /* I font delle famiglie usate, nei quattro tagli: tre famiglie per dodici font sarebbero troppi per un logo e due righe. */
  const font = new Map<StandardFonts, PDFFont>();
  for (const e of [...fasce.intestazione.elementi, ...fasce.piede.elementi]) {
    if (e.tipo !== 'testo') continue;
    const famiglie = new Set<Famiglia>([e.famiglia]);
    for (const p of e.paragrafi) {
      for (const n of p.content ?? []) {
        if (n.type === 'hardBreak') continue;
        for (const m of n.marks ?? []) if (m.type === 'textStyle' && m.attrs?.fontFamily) famiglie.add(m.attrs.fontFamily);
      }
    }
    for (const f of famiglie) for (const nome of FONT_PDF[f]) if (!font.has(nome)) font.set(nome, await doc.embedFont(nome));
  }

  const larghezzaFoglioMm = pagina.larghezza / MM;

  const disegnaTesto = (p: PDFPage, e: ElementoTesto, x: number, cima: number, contesto: ContestoPagina): void => {
    const testo = impaginaTesto(e, fasce.campi, contesto);
    const disponibile = e.larghezza * MM;
    let y = cima - scostamentoVerticale(e.verticale, Math.max(e.altezza * MM, testo.altezza), testo.altezza);
    for (const riga of testo.righe) {
      const base = y - riga.dimensione * BASE_LINEA[riga.famiglia];
      let cursore = x + xAllineato(riga.allineamento, disponibile, riga.larghezza);
      for (const parola of riga.parole) {
        cursore += larghezzaSpazi(parola);
        const misura = larghezza(parola.testo, parola.stile);
        const colore = coloreRgb(parola.stile.colore);
        p.drawText(parola.testo, {
          x: cursore,
          y: base,
          size: parola.stile.dimensione,
          font: font.get(nomeFont(parola.stile))!,
          color: colore,
        });
        if (parola.stile.sottolineato) {
          const spessore = Math.max(0.4, parola.stile.dimensione * 0.06);
          p.drawLine({
            start: { x: cursore, y: base - parola.stile.dimensione * 0.13 },
            end: { x: cursore + misura, y: base - parola.stile.dimensione * 0.13 },
            thickness: spessore,
            color: colore,
          });
        }
        cursore += misura;
      }
      y -= riga.dimensione * INTERLINEA;
    }
  };

  /** Una fascia disegnata a partire da `cima` (in punti dal basso della pagina), elemento per elemento, dal fondo in su. */
  const disegnaFascia = (p: PDFPage, fascia: Fascia, cima: number, contesto: ContestoPagina): void => {
    for (const e of fascia.elementi) {
      const x = (e.x + spostamentoOrizzontale(e, larghezzaFoglioMm)) * MM;
      const top = cima - e.y * MM;
      if (e.tipo === 'testo') disegnaTesto(p, e, x, top, contesto);
      else if (e.tipo === 'immagine') {
        const immagine = incorporate.get(e.immagine);
        if (immagine) p.drawImage(immagine, { x, y: top - e.altezza * MM, width: e.larghezza * MM, height: e.altezza * MM });
      } else {
        p.drawRectangle({ x, y: top - e.altezza * MM, width: e.larghezza * MM, height: e.altezza * MM, color: coloreRgb(e.colore) });
      }
    }
  };

  const altezzaIntestazione = altezzaFascia(fasce.intestazione, fasce.campi);
  /* Il piè finisce sul bordo basso: un testo che sporge andrebbe fuori dal foglio, e l'editor non lo lascia fare. */
  const altezzaPiede = fasciaVuota(fasce.piede) ? 0 : fasce.piede.altezza * MM;

  return {
    altezzaIntestazione,
    altezzaPiede,
    disegna(p, contesto) {
      if (!fasciaVuota(fasce.intestazione)) disegnaFascia(p, fasce.intestazione, pagina.altezza, contesto);
      if (!fasciaVuota(fasce.piede)) disegnaFascia(p, fasce.piede, altezzaPiede, contesto);
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

/** Il foglio su cui finiscono le fasce di Word, in millimetri: un A4 in verticale, se il documento non dice altro. */
export interface FoglioDocx {
  larghezzaMm: number;
  altezzaMm: number;
}

const A4: FoglioDocx = { larghezzaMm: LARGHEZZA_FOGLIO, altezzaMm: 297 };

/**
 * I font delle fasce in Word, dichiarati su ogni run: quelli con le
 * metriche dei font del PDF. Senza, header e footer prenderebbero il font
 * del documento in cui finiscono, anche quello di un file della sandbox su
 * cui VELIA li stampa (`timbra.ts`).
 */
const FONT_DOCX: Record<Famiglia, string> = { sans: 'Arial', serif: 'Times New Roman', mono: 'Courier New' };

/** Un millimetro in EMU, l'unità delle posizioni di un disegno; in pixel a 96 dpi, quella delle misure per `docx`. */
const EMU_PER_MM = 36_000;
const PX_PER_MM = 96 / 25.4;
/** Un punto in ventesimi, l'unità delle interlinee e delle cornici. */
const TWIP_PER_PT = 20;
const twip = (mm: number): number => Math.round(mm * MM * TWIP_PER_PT);

/** Gli id dei disegni devono essere unici nel documento: quelli delle fasce stanno lontani da quelli del corpo. */
const PRIMO_ID_DISEGNO = { intestazione: 7100, piede: 7300 } as const;

function runDocx(testo: string | undefined, stile: Stile, pagina?: 'CURRENT' | 'TOTAL_PAGES'): TextRun {
  return new TextRun({
    ...(pagina ? { children: [PageNumber[pagina]] } : { text: testo ?? '' }),
    font: FONT_DOCX[stile.famiglia],
    bold: stile.grassetto,
    italics: stile.corsivo,
    ...(stile.sottolineato && { underline: {} }),
    size: Math.round(stile.dimensione * 2),
    color: stile.colore.replace('#', ''),
  });
}

/** Un paragrafo di una casella: interlinea esatta, 1,3 volte il corpo più grande, come nel PDF e nell'editor. */
function paragrafoDocx(p: Paragrafo, casella: ElementoTesto, fasce: FasceDocumento, cornice: IFrameOptions): Paragraph {
  const figli: TextRun[] = [];
  let corpo = casella.dimensione;
  for (const nodo of p.content ?? []) {
    if (nodo.type === 'hardBreak') {
      figli.push(new TextRun({ break: 1 }));
      continue;
    }
    const stile = stileDi(nodo.marks, casella);
    corpo = Math.max(corpo, stile.dimensione);
    if (nodo.type === 'text') figli.push(runDocx(nodo.text, stile));
    else if (nodo.attrs.nome === 'pagina') figli.push(runDocx(undefined, stile, 'CURRENT'));
    else if (nodo.attrs.nome === 'pagine') figli.push(runDocx(undefined, stile, 'TOTAL_PAGES'));
    else figli.push(runDocx(valoreCampo(nodo.attrs.nome, fasce.campi), stile));
  }
  return new Paragraph({
    frame: cornice,
    alignment: ALLINEAMENTO_DOCX[p.attrs?.textAlign ?? 'left'],
    spacing: { before: 0, after: 0, line: Math.round(corpo * INTERLINEA * TWIP_PER_PT), lineRule: LineRuleType.EXACT },
    children: figli,
  });
}

/**
 * Una casella di testo in Word: una cornice di paragrafo (`w:framePr`)
 * rispetto alla pagina, larga quanto la casella e alta quanto il suo testo,
 * già spostata in cima, a metà o in fondo alla casella. Le caselle di
 * testo di DrawingML sarebbero più naturali, ma LibreOffice ne mette il
 * testo nell'angolo della pagina quando il corpo del documento è corto; le
 * cornici le leggono uguali Word e LibreOffice. I paragrafi consecutivi con
 * la stessa cornice fanno una cornice sola.
 */
function corniceDocx(
  e: ElementoTesto,
  fascia: Fascia,
  fasce: FasceDocumento,
  dove: 'intestazione' | 'piede',
  foglio: FoglioDocx,
): Paragraph[] {
  const testo = impaginaTesto(e, fasce.campi, RAPPRESENTATIVO).altezza / MM;
  const scarto = scostamentoVerticale(e.verticale, Math.max(e.altezza, testo), testo);
  const cima = dove === 'intestazione' ? 0 : foglio.altezzaMm - fascia.altezza;
  const cornice: IFrameOptions = {
    type: 'absolute',
    position: { x: twip(e.x + spostamentoOrizzontale(e, foglio.larghezzaMm)), y: twip(cima + e.y + scarto) },
    width: twip(e.larghezza),
    height: twip(testo),
    anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE },
    rule: HeightRule.ATLEAST,
    wrap: FrameWrap.AROUND,
    space: { horizontal: 0, vertical: 0 },
  };
  return e.paragrafi.map((p) => paragrafoDocx(p, e, fasce, cornice));
}

/**
 * Un'immagine o una forma: un disegno ancorato al paragrafo che fa da
 * fascia, dietro al testo (le cornici delle caselle ci stanno sopra, come
 * nell'editor quando il testo è su un riquadro colorato).
 */
function disegnoDocx(e: Elemento, fasce: FasceDocumento, id: number, larghezzaFoglioMm: number): ImageRun | WpsShapeRun | undefined {
  /* Rispetto alla pagina in orizzontale, al paragrafo che fa da fascia in verticale: nel piè, quello che finisce sul bordo basso. */
  const floating: IFloating = {
    horizontalPosition: {
      relative: HorizontalPositionRelativeFrom.PAGE,
      offset: Math.round((e.x + spostamentoOrizzontale(e, larghezzaFoglioMm)) * EMU_PER_MM),
    },
    verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: Math.round(e.y * EMU_PER_MM) },
    wrap: { type: TextWrappingType.NONE },
    allowOverlap: true,
    behindDocument: true,
    layoutInCell: true,
    zIndex: id,
  };
  const altText = { id: String(id), name: `VELIA ${id}` };
  const larghezzaPx = e.larghezza * PX_PER_MM;

  if (e.tipo === 'immagine') {
    const immagine = fasce.immagini.get(e.immagine);
    if (!immagine) return undefined;
    return new ImageRun({
      type: immagine.tipo,
      data: immagine.byte,
      transformation: { width: larghezzaPx, height: e.altezza * PX_PER_MM },
      floating,
      altText,
    });
  }
  if (e.tipo === 'testo') return undefined;
  /* Una forma è un rettangolo pieno, senza bordo e senza testo. */
  return new WpsShapeRun({
    type: 'wps',
    children: [new Paragraph({ spacing: { before: 0, after: 0, line: TWIP_PER_PT, lineRule: LineRuleType.EXACT } })],
    transformation: { width: larghezzaPx, height: e.altezza * PX_PER_MM },
    floating,
    altText,
    solidFill: { type: 'rgb', value: e.colore.replace('#', '').toUpperCase() },
    bodyProperties: { margins: { top: 0, bottom: 0, left: 0, right: 0 } },
  });
}

/**
 * Il contenuto di un `Header` o `Footer` di Word; vuoto se la fascia è vuota.
 *
 * Un paragrafo con l'interlinea esatta alta quanto la fascia, a cui sono
 * ancorate immagini e forme: così Word gli fa spazio e sposta il corpo,
 * come fa il PDF (la distanza di header e footer dal bordo va messa a zero,
 * in `docx.ts` e in `timbra.ts`). Le caselle di testo sono cornici rispetto
 * alla pagina, fuori dal flusso. Nell'intestazione il respiro sta dopo il
 * paragrafo, nel piè prima, in un paragrafo suo: il piè finisce sul bordo
 * basso della pagina.
 */
export function fasciaDocx(
  fascia: Fascia,
  fasce: FasceDocumento,
  dove: 'intestazione' | 'piede',
  foglio: FoglioDocx = A4,
): Paragraph[] {
  if (fasciaVuota(fascia)) return [];
  const cornici = fascia.elementi.flatMap((e) => (e.tipo === 'testo' ? corniceDocx(e, fascia, fasce, dove, foglio) : []));
  const disegni = fascia.elementi.flatMap((e, i) => disegnoDocx(e, fasce, PRIMO_ID_DISEGNO[dove] + i, foglio.larghezzaMm) ?? []);
  const alta = dove === 'intestazione' ? altezzaFascia(fascia, fasce.campi) : fascia.altezza * MM;
  const esatta = (pt: number) => ({ before: 0, line: Math.max(TWIP_PER_PT, Math.round(pt * TWIP_PER_PT)), lineRule: LineRuleType.EXACT });
  if (dove === 'intestazione') {
    return [...cornici, new Paragraph({ spacing: { ...esatta(alta), after: RESPIRO * TWIP_PER_PT }, children: disegni })];
  }
  return [
    ...cornici,
    new Paragraph({ spacing: { ...esatta(RESPIRO), after: 0 } }),
    new Paragraph({ spacing: { ...esatta(alta), after: 0 }, children: disegni }),
  ];
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

/** Excel non accetta intestazioni più lunghe di così. */
const MASSIMO_EXCEL = 255;

/**
 * Le fasce di stampa di Excel: `&L`, `&C`, `&R`. Ogni casella di testo va
 * nella sezione del terzo di foglio dove cade il suo centro, dall'alto in
 * basso. Solo testo: le immagini in un'intestazione di Excel non reggono
 * fra un programma e l'altro.
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
  const caselle = fascia.elementi
    .filter((e): e is ElementoTesto => e.tipo === 'testo')
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const casella of caselle) {
    const testo = casella.paragrafi.map(testoParagrafo).filter(Boolean).join('\n');
    if (!testo) continue;
    const centro = casella.x + casella.larghezza / 2;
    sezioni[centro < LARGHEZZA_FOGLIO / 3 ? 'left' : centro > (LARGHEZZA_FOGLIO * 2) / 3 ? 'right' : 'center'].push(testo);
  }
  const pezzi: string[] = [];
  if (sezioni.left.length) pezzi.push(`&L${sezioni.left.join('\n')}`);
  if (sezioni.center.length) pezzi.push(`&C${sezioni.center.join('\n')}`);
  if (sezioni.right.length) pezzi.push(`&R${sezioni.right.join('\n')}`);
  return pezzi.join('').slice(0, MASSIMO_EXCEL);
}
