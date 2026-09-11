import { FORMATI_DOCUMENTO, type FormatoDocumento } from '../../contratto/documenti-privati.js';
import { leggiEmail } from './email.js';
import { inPng } from './immagini.js';

/** Un file arrivato col multipart, già in memoria (max `limiteFileByte`, decine di MB). */
export interface FileRicevuto {
  nome: string;
  mimetype: string;
  contenuto: Buffer;
  troncato: boolean;
}

/*
 * Le firme: il nome e il mimetype li dichiara il client, questi no. Un
 * .docx rinominato .pdf non deve entrare come PDF e far fallire l'ingestion
 * dieci minuti dopo, con un messaggio che non spiega niente.
 */
const FIRMA_PDF = Buffer.from('%PDF-');
/** DOCX, XLSX, PPTX, OpenOffice e iWork sono archivi zip: `PK\x03\x04`. */
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** Word, Excel e PowerPoint di prima del 2007, e le email di Outlook (.msg): OLE2. */
const FIRMA_OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

const estensioneDi = (nome: string): string => {
  const punto = nome.lastIndexOf('.');
  return punto > 0 ? nome.slice(punto).toLowerCase() : '';
};

/**
 * L'estensione con cui si conserva l'originale in archivio: quella del file,
 * se è un'estensione vera; altrimenti la prima della sua famiglia.
 */
export function estensionePerFormato(formato: FormatoDocumento, nome: string): string {
  const dichiarata = estensioneDi(nome);
  if (/^\.[a-z0-9]{1,10}$/.test(dichiarata)) {
    const voce = FORMATI_DOCUMENTO.find((f) => f.formato === formato);
    /* Un file che dice di essere un'altra cosa (un .pdf che è un Word) si
       salva con l'estensione della famiglia in cui è stato riconosciuto. */
    if (!voce?.estensioni.length || (voce.estensioni as readonly string[]).includes(dichiarata)) return dichiarata;
  }
  const voce = FORMATI_DOCUMENTO.find((f) => f.formato === formato);
  return voce?.estensioni[0] ?? '.bin';
}

/** Le immagini che si riconoscono dai byte: PNG e JPEG, e quelle che al caricamento diventano PNG. */
export function eImmagine(contenuto: Buffer): boolean {
  const t = contenuto.subarray(0, 16);
  const ascii = (da: number, a: number) => t.subarray(da, a).toString('latin1');
  return (
    t.subarray(0, 4).equals(FIRMA_PNG) ||
    t.subarray(0, 3).equals(FIRMA_JPEG) ||
    ascii(0, 4) === 'GIF8' ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') ||
    ascii(0, 4) === 'II*\0' ||
    ascii(0, 4) === 'MM\0*' ||
    ascii(0, 2) === 'BM' ||
    /* HEIC, HEIF, AVIF: un contenitore ISO con la marca giusta. */
    (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|hevm|mif1|msf1|avif|avis)$/.test(ascii(8, 12)))
  );
}

/** PNG o JPEG: le sole immagini che il resto della catena (pdf-lib, il visualizzatore) prende così come sono. */
export function ePngOJpeg(contenuto: Buffer): boolean {
  return contenuto.subarray(0, 4).equals(FIRMA_PNG) || contenuto.subarray(0, 3).equals(FIRMA_JPEG);
}

/** Un'email in formato testo: nelle prime righe ci sono le intestazioni. */
function eEmailTesto(contenuto: Buffer): boolean {
  const testa = contenuto.subarray(0, 8 * 1024).toString('latin1');
  return /^(From|To|Subject|Date|Received|Return-Path|Message-ID|MIME-Version|Delivered-To|X-[\w-]+):/im.test(testa);
}

/**
 * Un testo è testo se si decodifica in UTF-8 e non contiene byte nulli.
 *
 * Markdown, txt e csv non hanno una firma: è l'unico modo di distinguerli
 * da un binario rinominato. Si guardano i primi 64 KB — su un file di
 * decine di MB leggerli tutti non aggiunge certezza, solo lavoro.
 */
function eTesto(contenuto: Buffer): boolean {
  const campione = contenuto.subarray(0, 64 * 1024);
  if (campione.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(campione);
    return true;
  } catch {
    /* Un troncamento a metà carattere multibyte non è un errore del file:
       si riprova senza l'ultima manciata di byte. */
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(campione.subarray(0, Math.max(0, campione.length - 4)));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Che cos'è questo file, davvero (01/09/2026; qualsiasi file dall'11/09/2026).
 *
 * Prima si guarda cosa dichiara — estensione, e senza estensione il
 * mimetype — e poi si controlla che i byte gli diano ragione. Nessuna delle
 * due cose da sola basta: l'estensione la sceglie chi carica, e il mimetype
 * lo scrive il browser (che sui .md manda spesso `application/octet-stream`).
 *
 * Non rifiuta più niente. Un file che dice di essere una cosa e ne è
 * un'altra (un Word rinominato .pdf) si riconosce dai byte, quando si può;
 * altrimenti è `altro`: si conserva, e la sua scheda dice che cos'è.
 */
export function riconosciFormato(f: FileRicevuto): FormatoDocumento {
  const estensione = estensioneDi(f.nome);
  const mime = f.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  const voce =
    FORMATI_DOCUMENTO.find((v) => (v.estensioni as readonly string[]).includes(estensione)) ??
    (estensione ? undefined : FORMATI_DOCUMENTO.find((v) => (v.mime as readonly string[]).includes(mime)));
  const confermato = voce ? confermaDaiByte(voce.formato, f.contenuto) : undefined;
  return confermato ?? annusa(f.contenuto);
}

/** La famiglia dichiarata, se i byte le danno ragione. */
function confermaDaiByte(formato: FormatoDocumento, contenuto: Buffer): FormatoDocumento | undefined {
  const testa = contenuto.subarray(0, 1024);
  const zip = testa.subarray(0, 4).equals(FIRMA_ZIP);
  const ole = testa.subarray(0, 8).equals(FIRMA_OLE);
  switch (formato) {
    /* Il PDF vero comincia con `%PDF-`, ma qualche generatore ci mette
       davanti dei byte di comodo: si cerca nella testa, come si è sempre
       fatto qui. */
    case 'pdf':
      return testa.includes(FIRMA_PDF) ? 'pdf' : undefined;
    case 'docx':
    case 'xlsx':
      return zip ? formato : undefined;
    case 'immagine':
      return eImmagine(contenuto) ? 'immagine' : undefined;
    case 'office':
      /* Zip (OOXML, OpenOffice, iWork), OLE2 (Office di prima del 2007),
         RTF, o un SVG, che è testo. */
      return zip || ole || testa.subarray(0, 5).toString('latin1') === '{\\rtf' || (eTesto(contenuto) && /<svg\b/i.test(testa.toString('utf8')))
        ? 'office'
        : undefined;
    case 'email':
      return ole || eEmailTesto(contenuto) ? 'email' : undefined;
    /* Contenitori troppo vari per una firma sola: lo dirà la trascrizione. */
    case 'audio':
    case 'video':
    case 'firmato':
      return contenuto.length ? formato : undefined;
    case 'altro':
      return undefined;
    default:
      return eTesto(contenuto) ? formato : undefined;
  }
}

/** Senza un'estensione che torni: che cosa dicono i byte da soli. */
function annusa(contenuto: Buffer): FormatoDocumento {
  if (!contenuto.length) return 'altro';
  if (contenuto.subarray(0, 1024).includes(FIRMA_PDF)) return 'pdf';
  if (eImmagine(contenuto)) return 'immagine';
  if (eTesto(contenuto)) return 'testo';
  return 'altro';
}

/** Il PDF resta un caso a parte: alcune rotte accettano solo quello. */
export function ePdf(f: FileRicevuto): boolean {
  return riconosciFormato(f) === 'pdf';
}

/**
 * Il file come entra in archivio (11/09/2026): riconosciuto, e se è
 * un'immagine che non è PNG o JPEG, già PNG. Il nome lo dice (`foto.heic`
 * diventa `foto.png`), perché è il file che si scaricherà. Un'immagine che
 * non si converte si conserva com'è, come file che non si legge.
 */
export async function preparaFile<T extends FileRicevuto>(file: T): Promise<{ file: T; formato: FormatoDocumento }> {
  const formato = riconosciFormato(file);
  if (formato !== 'immagine' || ePngOJpeg(file.contenuto)) return { file, formato };
  try {
    const png = await inPng(file.contenuto);
    const base = file.nome.replace(/\.[^.]+$/, '') || file.nome;
    return { file: { ...file, nome: `${base}.png`, mimetype: 'image/png', contenuto: png }, formato: 'immagine' };
  } catch {
    return { file, formato: 'altro' };
  }
}

/**
 * Gli allegati di un'email come file a sé (11/09/2026), compresi quelli di
 * un'email allegata: una PEC porta dentro il messaggio originale
 * (`postacert.eml`), e i documenti veri stanno lì.
 */
export async function allegatiDaEmail(contenuto: Buffer, profondita = 0): Promise<FileRicevuto[]> {
  if (profondita > 2) return [];
  let email;
  try {
    email = await leggiEmail(contenuto);
  } catch {
    return [];
  }
  const allegati: FileRicevuto[] = [];
  for (const a of email.allegati) {
    const file: FileRicevuto = { nome: a.nome, mimetype: a.mimetype, contenuto: a.contenuto, troncato: false };
    allegati.push(file);
    if (riconosciFormato(file) === 'email') allegati.push(...(await allegatiDaEmail(a.contenuto, profondita + 1)));
  }
  return allegati;
}
