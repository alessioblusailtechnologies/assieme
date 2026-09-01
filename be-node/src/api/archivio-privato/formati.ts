import { FORMATI_DOCUMENTO, type FormatoDocumento } from '../../contratto/documenti-privati.js';

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
/** DOCX e XLSX sono archivi zip: `PK\x03\x04`. */
const FIRMA_ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FIRMA_JPEG = Buffer.from([0xff, 0xd8, 0xff]);

const estensioneDi = (nome: string): string => {
  const punto = nome.lastIndexOf('.');
  return punto > 0 ? nome.slice(punto).toLowerCase() : '';
};

/** L'estensione con cui si conserva l'originale in archivio. */
export function estensionePerFormato(formato: FormatoDocumento, nome: string): string {
  const dichiarata = estensioneDi(nome);
  const voce = FORMATI_DOCUMENTO.find((f) => f.formato === formato);
  return voce && (voce.estensioni as readonly string[]).includes(dichiarata)
    ? dichiarata
    : (voce?.estensioni[0] ?? '.bin');
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
 * Che cos'è questo file, davvero (01/09/2026).
 *
 * Prima si guarda cosa dichiara — estensione, e in subordine il mimetype —
 * e poi si controlla che i byte gli diano ragione. Nessuna delle due cose
 * da sola basta: l'estensione la sceglie chi carica, e il mimetype lo
 * scrive il browser (che sui .md manda spesso `application/octet-stream`).
 *
 * Torna `undefined` se il file non è di un formato che sappiamo leggere, o
 * se dice di essere una cosa e ne è un'altra.
 */
export function riconosciFormato(f: FileRicevuto): FormatoDocumento | undefined {
  const estensione = estensioneDi(f.nome);
  const mime = f.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
  const voce =
    FORMATI_DOCUMENTO.find((v) => (v.estensioni as readonly string[]).includes(estensione)) ??
    FORMATI_DOCUMENTO.find((v) => (v.mime as readonly string[]).includes(mime));
  if (!voce) return undefined;

  const testa = f.contenuto.subarray(0, 1024);
  switch (voce.formato) {
    /* Il PDF vero comincia con `%PDF-`, ma qualche generatore ci mette
       davanti dei byte di comodo: si cerca nella testa, come si è sempre
       fatto qui. */
    case 'pdf':
      return testa.includes(FIRMA_PDF) ? 'pdf' : undefined;
    case 'docx':
    case 'xlsx':
      return testa.subarray(0, 4).equals(FIRMA_ZIP) ? voce.formato : undefined;
    case 'immagine':
      return testa.subarray(0, 4).equals(FIRMA_PNG) || testa.subarray(0, 3).equals(FIRMA_JPEG)
        ? 'immagine'
        : undefined;
    default:
      return eTesto(f.contenuto) ? voce.formato : undefined;
  }
}

/** Il PDF resta un caso a parte: alcune rotte accettano solo quello. */
export function ePdf(f: FileRicevuto): boolean {
  return riconosciFormato(f) === 'pdf';
}
