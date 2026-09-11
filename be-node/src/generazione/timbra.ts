import { PDFDocument, PageSizes, type PDFPage } from 'pdf-lib';
import PizZip from 'pizzip';

import { componiDocx } from './docx.js';
import {
  MARGINE,
  MM,
  fasciaVuota,
  fasciaXlsx,
  margineCorpo,
  preparaFascePdf,
  type FasceDocumento,
  type FascePdf,
} from './intestazione.js';

/**
 * La carta dell'agenzia su un documento già fatto (11/09/2026, fase 3 di
 * `PIANO-INTESTAZIONE-MODELLI.md`): i file che la sandbox consegna da un
 * modello con «intestazione dell'agenzia», o senza modello.
 *
 * L'intestazione non la disegna la sandbox: la mette il worker dopo la
 * consegna, con lo stesso motore di «Esporta come». Così è identica
 * all'anteprima di Impostazioni, i numeri di pagina girano davvero, e un
 * modello che porta la carta di un altro ente la perde per quella
 * dell'agenzia. Alla sandbox si dice solo quanto spazio lasciare libero
 * (`misureFasce`).
 *
 * - **PDF**: le fasce si disegnano su ogni pagina, sopra il contenuto.
 * - **Word**: header e footer del documento si sostituiscono con quelli
 *   dell'agenzia, in ogni sezione; il resto del pacchetto non si tocca.
 * - **Excel**: le fasce di stampa di ogni foglio, solo testo.
 */

export type FormatoTimbrabile = 'pdf' | 'docx' | 'xlsx';

export function senzaFasce(fasce: FasceDocumento): boolean {
  return fasciaVuota(fasce.intestazione) && fasciaVuota(fasce.piede);
}

export async function timbra(byte: Buffer, formato: FormatoTimbrabile, fasce: FasceDocumento): Promise<Buffer> {
  if (senzaFasce(fasce)) return byte;
  if (formato === 'pdf') return timbraPdf(byte, fasce);
  if (formato === 'docx') return timbraDocx(byte, fasce);
  return timbraXlsx(byte, fasce);
}

// ---------------------------------------------------------------------------
// Misure per la sandbox
// ---------------------------------------------------------------------------

/**
 * I margini alto e basso, in millimetri, che lasciano libere le fasce su
 * una pagina A4: ciò che la sandbox deve rispettare perché l'intestazione,
 * messa dopo, non copra il contenuto.
 */
export async function misureFasce(fasce: FasceDocumento): Promise<{ altoMm: number; bassoMm: number }> {
  const [larghezza, altezza] = PageSizes.A4;
  const f = await preparaFascePdf(await PDFDocument.create(), fasce, { larghezza, altezza });
  return {
    altoMm: Math.ceil(margineCorpo(f.altezzaIntestazione) / MM),
    bassoMm: Math.ceil(margineCorpo(f.altezzaPiede) / MM),
  };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export async function timbraPdf(byte: Buffer, fasce: FasceDocumento): Promise<Buffer> {
  const doc = await PDFDocument.load(byte, { ignoreEncryption: true });
  const pagine = doc.getPages();
  /* Le fasce si preparano una volta per formato di pagina: di solito uno. */
  const perFormato = new Map<string, FascePdf>();
  const fascePer = async (pagina: PDFPage): Promise<FascePdf> => {
    const { width, height } = pagina.getSize();
    const chiave = `${Math.round(width)}x${Math.round(height)}`;
    let f = perFormato.get(chiave);
    if (!f) {
      f = await preparaFascePdf(doc, fasce, { larghezza: width, altezza: height });
      perFormato.set(chiave, f);
    }
    return f;
  };
  for (const [i, pagina] of pagine.entries()) {
    (await fascePer(pagina)).disegna(pagina, { pagina: i + 1, pagine: pagine.length });
  }
  return Buffer.from(await doc.save());
}

// ---------------------------------------------------------------------------
// Word
// ---------------------------------------------------------------------------

const TIPO_HEADER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';
const TIPO_FOOTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';
const CT_HEADER = 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const CT_FOOTER = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const ID_HEADER = 'rIdVeliaIntestazione';
const ID_FOOTER = 'rIdVeliaPiede';

/** Un millimetro in ventesimi di punto, l'unità delle misure di pagina di Word. */
const TWIP_PER_MM = 72 * 20 / 25.4;

/** I margini di una sezione che non ne dichiara: quelli del PDF, con header e footer a filo del bordo. */
const MARGINI_PREDEFINITI = `<w:pgMar w:top="${MARGINE * 20}" w:right="${MARGINE * 20}" w:bottom="${MARGINE * 20}" w:left="${MARGINE * 20}" w:header="0" w:footer="0" w:gutter="0"/>`;

/**
 * Header e footer a filo del bordo della pagina: gli elementi delle fasce
 * hanno le coordinate contate da lì (`fasciaDocx`). Gli altri margini della
 * sezione restano come la sandbox li ha voluti.
 */
function fasceAFilo(interno: string): string {
  if (/<w:pgMar\b/.test(interno)) {
    return interno.replace(/<w:pgMar\b([^>]*?)\s*\/>/, (_t, attributi: string) => {
      const altri = attributi.replace(/\s+w:(header|footer)="[^"]*"/g, '');
      return `<w:pgMar${altri} w:header="0" w:footer="0"/>`;
    });
  }
  const formato = /<w:pgSz\b[^>]*\/>/.exec(interno);
  if (!formato) return MARGINI_PREDEFINITI + interno;
  const dopo = formato.index + formato[0].length;
  return interno.slice(0, dopo) + MARGINI_PREDEFINITI + interno.slice(dopo);
}

/**
 * Header e footer dell'agenzia al posto di quelli del documento.
 *
 * Le parti si prendono da un documento vuoto composto col motore di
 * «Esporta come» (`componiDocx`), che sa già fare caselle di testo,
 * immagini, forme e campi `PAGE`/`NUMPAGES`; si copiano nel pacchetto con
 * nomi nuovi, e ogni `w:sectPr` punta a loro, con header e footer a filo del
 * bordo. Prima pagina diversa e pagine pari/dispari si spengono:
 * l'intestazione è una sola, su tutte.
 */
export async function timbraDocx(byte: Buffer, fasce: FasceDocumento): Promise<Buffer> {
  const zip = new PizZip(byte);
  /* Le fasce si dispongono sul foglio della prima sezione: un A4 in orizzontale sposta a destra ciò che sta a destra, e il piè sta sul suo fondo. */
  const formato = /<w:pgSz\b[^>]*\/>/.exec(testo(zip, 'word/document.xml'))?.[0] ?? '';
  const larghezzaTwip = Number(/\bw:w="(\d+)"/.exec(formato)?.[1]);
  const altezzaTwip = Number(/\bw:h="(\d+)"/.exec(formato)?.[1]);
  const carta = new PizZip(
    await componiDocx({
      titolo: '',
      blocchi: [],
      fonti: [],
      fasce,
      ...(larghezzaTwip > 0 &&
        altezzaTwip > 0 && { foglio: { larghezzaMm: larghezzaTwip / TWIP_PER_MM, altezzaMm: altezzaTwip / TWIP_PER_MM } }),
    }),
  );

  const relsCarta = testo(carta, 'word/_rels/document.xml.rels');
  const parteCarta = (tipo: string): string | undefined => {
    const m = new RegExp(`<Relationship[^>]*Type="${tipo}"[^>]*/>`).exec(relsCarta)?.[0];
    return m ? /Target="([^"]+)"/.exec(m)?.[1] : undefined;
  };

  const nuoveRelazioni: string[] = [];
  const nuoviOverride: string[] = [];
  let immagini = 0;
  const copia = (tipo: string, ct: string, id: string, nome: string): boolean => {
    const origine = parteCarta(tipo);
    if (!origine) return false;
    zip.file(`word/${nome}.xml`, testo(carta, `word/${origine}`));
    /* Le immagini della parte, con nomi che non si scontrano con quelle del documento. */
    const rels = carta.file(`word/_rels/${origine}.rels`)?.asText();
    if (rels) {
      const riscritte = rels.replace(/Target="media\/([^"]+)"/g, (_t, file: string) => {
        const estensione = file.split('.').pop() ?? 'png';
        const nuovo = `velia-${nome}-${++immagini}.${estensione}`;
        const dati = carta.file(`word/media/${file}`)?.asUint8Array();
        if (dati) zip.file(`word/media/${nuovo}`, dati);
        return `Target="media/${nuovo}"`;
      });
      zip.file(`word/_rels/${nome}.xml.rels`, riscritte);
    }
    nuoveRelazioni.push(`<Relationship Id="${id}" Type="${tipo}" Target="${nome}.xml"/>`);
    nuoviOverride.push(`<Override PartName="/word/${nome}.xml" ContentType="${ct}"/>`);
    return true;
  };
  const conIntestazione = copia(TIPO_HEADER, CT_HEADER, ID_HEADER, 'velia-intestazione');
  const conPiede = copia(TIPO_FOOTER, CT_FOOTER, ID_FOOTER, 'velia-piede');

  /* Le relazioni del documento. */
  const percorsoRels = 'word/_rels/document.xml.rels';
  const rels = testo(zip, percorsoRels).replace(/<Relationship[^>]*Id="rIdVelia[^"]*"[^>]*\/>/g, '');
  zip.file(percorsoRels, rels.replace('</Relationships>', `${nuoveRelazioni.join('')}</Relationships>`));

  /* I tipi del pacchetto: le due parti e le estensioni delle immagini. */
  let tipi = testo(zip, '[Content_Types].xml');
  for (const [estensione, ct] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg']] as const) {
    if (!new RegExp(`Extension="${estensione}"`, 'i').test(tipi)) {
      tipi = tipi.replace('</Types>', `<Default Extension="${estensione}" ContentType="${ct}"/></Types>`);
    }
  }
  tipi = tipi.replace(/<Override PartName="\/word\/velia-[^"]*"[^>]*\/>/g, '');
  zip.file('[Content_Types].xml', tipi.replace('</Types>', `${nuoviOverride.join('')}</Types>`));

  /* Ogni sezione punta alle fasce dell'agenzia, e solo a quelle. */
  const riferimenti =
    (conIntestazione ? `<w:headerReference w:type="default" r:id="${ID_HEADER}"/>` : '') +
    (conPiede ? `<w:footerReference w:type="default" r:id="${ID_FOOTER}"/>` : '');
  let documento = testo(zip, 'word/document.xml');
  const sezione = (interno: string): string =>
    riferimenti +
    fasceAFilo(
      interno
        .replace(/<w:(header|footer)Reference\b[^>]*\/>/g, '')
        .replace(/<w:titlePg\b[^>]*\/>/g, ''),
    );
  let sezioni = 0;
  documento = documento
    .replace(/<w:sectPr\b([^>]*)\/>/g, (_t, attributi: string) => {
      sezioni++;
      return `<w:sectPr${attributi}>${sezione('')}</w:sectPr>`;
    })
    .replace(/<w:sectPr\b([^>]*)>([\s\S]*?)<\/w:sectPr>/g, (_t, attributi: string, interno: string) => {
      sezioni++;
      return `<w:sectPr${attributi}>${sezione(interno)}</w:sectPr>`;
    });
  if (!sezioni) documento = documento.replace('</w:body>', `<w:sectPr>${sezione('')}</w:sectPr></w:body>`);
  if (!/xmlns:r="/.test(documento.slice(0, 3000))) {
    documento = documento.replace(/<w:document\b/, `<w:document xmlns:r="${NS_R}"`);
  }
  zip.file('word/document.xml', documento);

  /* Pari e dispari diversi lascerebbero le pagine pari senza intestazione. */
  const impostazioni = zip.file('word/settings.xml')?.asText();
  if (impostazioni) zip.file('word/settings.xml', impostazioni.replace(/<w:evenAndOddHeaders\b[^>]*\/>/g, ''));

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

/**
 * Gli elementi che nello schema di un foglio vengono dopo `headerFooter`:
 * lì davanti va messo, o Excel dichiara il file danneggiato.
 */
const DOPO_HEADER_FOOTER = [
  'rowBreaks',
  'colBreaks',
  'customProperties',
  'cellWatches',
  'ignoredErrors',
  'smartTags',
  'drawing',
  'legacyDrawing',
  'legacyDrawingHF',
  'drawingHF',
  'picture',
  'oleObjects',
  'controls',
  'webPublishItems',
  'tableParts',
  'extLst',
];

const escXml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Le fasce di stampa dell'agenzia su ogni foglio, dritte nell'XML: ExcelJS
 * rileggendo e riscrivendo un file perderebbe grafici e formattazioni che
 * la sandbox ha messo con openpyxl.
 */
export function timbraXlsx(byte: Buffer, fasce: FasceDocumento): Promise<Buffer> {
  return Promise.resolve(timbraXlsxSincrono(byte, fasce));
}

function timbraXlsxSincrono(byte: Buffer, fasce: FasceDocumento): Buffer {
  const intestazione = fasciaXlsx(fasce.intestazione, fasce.campi);
  const piede = fasciaXlsx(fasce.piede, fasce.campi);
  if (!intestazione && !piede) return byte;
  const elemento =
    '<headerFooter>' +
    (intestazione ? `<oddHeader>${escXml(intestazione)}</oddHeader>` : '') +
    (piede ? `<oddFooter>${escXml(piede)}</oddFooter>` : '') +
    '</headerFooter>';

  const zip = new PizZip(byte);
  for (const percorso of Object.keys(zip.files).filter((p) => /^xl\/worksheets\/[^/]+\.xml$/.test(p))) {
    let foglio = testo(zip, percorso).replace(/<(\w+:)?headerFooter\b[^>]*\/>|<(\w+:)?headerFooter\b[\s\S]*?<\/(\w+:)?headerFooter>/g, '');
    const prefisso = /<(\w+:)?worksheet\b/.exec(foglio)?.[1] ?? '';
    const conPrefisso = prefisso ? elemento.replace(/<(\/?)(\w)/g, `<$1${prefisso}$2`) : elemento;
    const dopo = new RegExp(`<(\\w+:)?(${DOPO_HEADER_FOOTER.join('|')})[\\s>/]`).exec(foglio);
    foglio = dopo
      ? `${foglio.slice(0, dopo.index)}${conPrefisso}${foglio.slice(dopo.index)}`
      : foglio.replace(new RegExp(`</${prefisso}worksheet>`), `${conPrefisso}</${prefisso}worksheet>`);
    zip.file(percorso, foglio);
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function testo(zip: PizZip, percorso: string): string {
  const file = zip.file(percorso);
  if (!file) throw new Error(`il pacchetto non ha ${percorso}`);
  return file.asText();
}
