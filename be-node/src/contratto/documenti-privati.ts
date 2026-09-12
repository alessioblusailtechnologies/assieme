import { z } from 'zod';

import { TIPOLOGIE, type Compagnia, type Ramo, type TipologiaDocumento } from './documenti.js';

/**
 * Specchio di `fe-angular/src/app/core/models/documento.ts` (la parte
 * privata) e di `core/api/documenti-privati-api.ts`, col comportamento
 * fissato da `mocks/archivio-privato.mjs`: il contratto dell'Archivio
 * Privato. Il mock è l'unica specifica scritta dei codici d'errore: qui si
 * onora, non si reinventa.
 */

export const STATI_ELABORAZIONE = ['in-coda', 'in-elaborazione', 'pronto', 'errore'] as const;
export type StatoElaborazione = (typeof STATI_ELABORAZIONE)[number];

export interface DocumentoPrivato {
  id: string;
  archivio: 'privato';
  titolo: string;
  tipologia: TipologiaDocumento;
  numeroPagine?: number;
  fileUrl: string;
  stato: StatoElaborazione;
  /** Solo con `stato === 'errore'`: spiega cosa fare, non uno stack trace. */
  erroreElaborazione?: string;
  caricatoDa: string;
  caricatoIl: string;
  dimensioneByte: number;
  etichette: string[];
  compagnia?: Compagnia;
  ramo?: Ramo;
  riferimentoCliente?: string;
  classificazioneDaConfermare?: boolean;
  documentoDiRiferimento: boolean;
  visibilita: 'tenant' | 'personale';
  /* Di chi è. Assente = «Senza cliente», che è una condizione normale e non
     un errore: il documento è pronto e citabile lo stesso, e circolari e
     modulistica un cliente non ce l'hanno per natura (12/09/2026). */
  cliente?: { id: string; nome: string };
  /** Vero finché il cliente è una proposta dell'ingestion: intestarlo a mano la fissa. */
  clienteDaConfermare?: boolean;
  numeroPolizza?: string;
  decorrenza?: string;
  scadenza?: string;
}

export interface PaginaDocumentiPrivati {
  elementi: DocumentoPrivato[];
  totale: number;
  pagina: number;
  perPagina: number;
}

/** Etichetta con quanti documenti la portano (completamento nel FE). */
export interface Etichetta {
  nome: string;
  documenti: number;
}

/** RF-B-08: i limiti del piano e quanto ne è usato. */
export interface SpazioTenant {
  usatoByte: number;
  limiteByte: number;
  limiteFileByte: number;
  numeroDocumenti: number;
}

/** Esito del caricamento: i documenti creati, già in coda. */
export interface EsitoCaricamento {
  creati: DocumentoPrivato[];
  /**
   * I file di uno zip che non sappiamo leggere (Fase 10). Solo lì: un lotto
   * normale resta atomico e risponde 415, ma un archivio d'agenzia contiene
   * sempre un `.doc` del 2009, e non è un motivo per rifiutare l'importazione.
   */
  ignorati?: string[];
}

/**
 * Un booleano di querystring. `z.coerce.boolean()` farebbe `Boolean('false')`
 * → true: il FE oggi non manda mai i falsi, ma il contratto non deve
 * reggersi su questo.
 */
const booleanoQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Parametri di GET /api/documenti-privati, come li manda il FE. */
export const schemaFiltriDocumentiPrivati = z.object({
  q: z.string().optional(),
  tipologia: z.enum(TIPOLOGIE).optional(),
  stato: z.enum(STATI_ELABORAZIONE).optional(),
  etichetta: z.string().optional(),
  soloRiferimenti: booleanoQuery,
  /* `clienteId` e `senzaCliente` sono due viste diverse e non si
     combinano; `daConfermare` è la coda di lavoro di chi rivede le
     proposte dell'ingestion. */
  clienteId: z.string().uuid().optional(),
  senzaCliente: booleanoQuery,
  daConfermare: booleanoQuery,
  pagina: z.coerce.number().int().min(1).default(1),
  perPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type FiltriDocumentiPrivati = z.infer<typeof schemaFiltriDocumentiPrivati>;

/** Un'etichetta: testo breve, senza spazi ai bordi, mai vuoto. */
const etichetta = z
  .string()
  .trim()
  .min(1)
  .max(60);

/**
 * Corpo di PATCH /api/documenti-privati/:id (`ModificheDocumento` nel FE).
 * Chiave assente = non toccare; `null` su riferimentoCliente, compagniaId
 * e ramoId = svuotare (il FE non sa ancora svuotare il riferimento cliente:
 * il contratto glielo permette da qui).
 */
export const schemaModificheDocumento = z
  .object({
    titolo: z.string().trim().min(1).max(300).optional(),
    tipologia: z.enum(TIPOLOGIE).optional(),
    compagniaId: z.string().min(1).nullable().optional(),
    ramoId: z.string().min(1).nullable().optional(),
    riferimentoCliente: z.string().trim().max(200).nullable().optional(),
    etichette: z.array(etichetta).max(30).optional(),
    /* Intestare a mano è definitivo: `clienteDaConfermare` si spegne e
       nessuna rilavorazione rimette il documento in discussione. `null` lo
       rimanda fra quelli senza cliente. */
    clienteId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type ModificheDocumento = z.infer<typeof schemaModificheDocumento>;

/**
 * Come un documento è entrato in archivio (01/09/2026), cioè come lo si
 * legge: è la **famiglia** del file, non la sua estensione.
 *
 * Quale che sia, quello che si apre nel visualizzatore è sempre un PDF: chi
 * non arriva già così viene impaginato all'ingestion, e le citazioni
 * puntano alle pagine di quel PDF. Il formato serve a sapere *come* leggere
 * il file, non a cambiare ciò che l'utente vede dopo.
 *
 * Dall'11/09/2026 (fase 3 di `PIANO-LINK-E-FORMATI.md`) si carica qualsiasi
 * file: le famiglie nuove si leggono convertendole (Office col LibreOffice
 * della sandbox, audio e video con Voxtral, il .p7m sbustato), e ciò che
 * non si sa leggere è `altro`: resta come originale, con una scheda che dice
 * che cos'è. Le immagini che non sono PNG o JPEG diventano PNG al caricamento.
 */
export const FORMATI_DOCUMENTO = [
  { formato: 'pdf', estensioni: ['.pdf'], mime: ['application/pdf'], etichetta: 'PDF' },
  {
    formato: 'docx',
    estensioni: ['.docx', '.docm', '.dotx', '.dotm'],
    mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    etichetta: 'Word',
  },
  {
    formato: 'xlsx',
    estensioni: ['.xlsx', '.xlsm', '.xltx', '.xltm'],
    mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    etichetta: 'Excel',
  },
  { formato: 'markdown', estensioni: ['.md', '.markdown'], mime: ['text/markdown'], etichetta: 'Markdown' },
  {
    formato: 'testo',
    estensioni: ['.txt', '.log', '.json', '.xml', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.sql', '.ics', '.vcf', '.srt', '.vtt', '.tex', '.rst'],
    mime: ['text/plain', 'application/json', 'application/xml', 'text/xml', 'text/calendar', 'text/vcard'],
    etichetta: 'testo',
  },
  { formato: 'csv', estensioni: ['.csv', '.tsv'], mime: ['text/csv', 'text/tab-separated-values'], etichetta: 'CSV' },
  {
    formato: 'immagine',
    estensioni: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic', '.heif', '.tif', '.tiff', '.bmp', '.avif'],
    mime: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp', 'image/avif'],
    etichetta: 'immagini',
  },
  { formato: 'html', estensioni: ['.html', '.htm', '.xhtml'], mime: ['text/html', 'application/xhtml+xml'], etichetta: 'pagine web' },
  {
    formato: 'office',
    estensioni: [
      '.pptx', '.pptm', '.potx', '.ppsx', '.ppt', '.pps', '.pot', '.doc', '.dot', '.rtf', '.odt', '.ott', '.ods', '.ots',
      '.odp', '.otp', '.odg', '.xls', '.xlt', '.xlsb', '.pages', '.numbers', '.key', '.vsd', '.vsdx', '.pub', '.wpd', '.svg',
    ],
    mime: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/msword',
      'application/vnd.ms-excel',
      'application/rtf',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      'image/svg+xml',
    ],
    etichetta: 'PowerPoint e gli altri formati Office',
  },
  { formato: 'email', estensioni: ['.eml', '.msg'], mime: ['message/rfc822', 'application/vnd.ms-outlook'], etichetta: 'email' },
  {
    formato: 'audio',
    estensioni: ['.mp3', '.m4a', '.wav', '.ogg', '.oga', '.opus', '.aac', '.flac', '.amr', '.weba', '.aiff', '.aif', '.wma'],
    mime: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/opus', 'audio/aac', 'audio/flac', 'audio/amr', 'audio/webm'],
    etichetta: 'audio',
  },
  {
    formato: 'video',
    estensioni: ['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv', '.3gp', '.mpeg', '.mpg'],
    mime: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/mpeg'],
    etichetta: 'video',
  },
  { formato: 'firmato', estensioni: ['.p7m'], mime: ['application/pkcs7-mime'], etichetta: 'firmati digitalmente (.p7m)' },
  /* Tutto il resto: si conserva, non si legge. Nessuna estensione sua. */
  { formato: 'altro', estensioni: [], mime: [], etichetta: 'qualsiasi altro file' },
] as const;

export type FormatoDocumento = (typeof FORMATI_DOCUMENTO)[number]['formato'];

/** Per l'`accept` della finestra di scelta file e per i messaggi d'errore. */
export const ESTENSIONI_ACCETTATE = FORMATI_DOCUMENTO.flatMap((f) => [...f.estensioni]);

/** «PDF, Word, Excel, Markdown, testo, CSV e immagini», per parlare all'utente. */
export const ELENCO_FORMATI = FORMATI_DOCUMENTO.map((f) => f.etichetta).join(', ');
