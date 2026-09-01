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
  })
  .strict();

export type ModificheDocumento = z.infer<typeof schemaModificheDocumento>;

/**
 * Come un documento è entrato in archivio (01/09/2026).
 *
 * Quale che sia, quello che si apre nel visualizzatore è sempre un PDF: chi
 * non arriva già così viene impaginato all'ingestion, e le citazioni
 * puntano alle pagine di quel PDF. Il formato serve a sapere *come* leggere
 * il file, non a cambiare ciò che l'utente vede dopo.
 */
export const FORMATI_DOCUMENTO = [
  { formato: 'pdf', estensioni: ['.pdf'], mime: ['application/pdf'], etichetta: 'PDF' },
  { formato: 'docx', estensioni: ['.docx'], mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], etichetta: 'Word' },
  { formato: 'xlsx', estensioni: ['.xlsx'], mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], etichetta: 'Excel' },
  { formato: 'markdown', estensioni: ['.md', '.markdown'], mime: ['text/markdown'], etichetta: 'Markdown' },
  { formato: 'testo', estensioni: ['.txt'], mime: ['text/plain'], etichetta: 'testo' },
  { formato: 'csv', estensioni: ['.csv'], mime: ['text/csv'], etichetta: 'CSV' },
  { formato: 'immagine', estensioni: ['.png', '.jpg', '.jpeg'], mime: ['image/png', 'image/jpeg'], etichetta: 'immagini' },
] as const;

export type FormatoDocumento = (typeof FORMATI_DOCUMENTO)[number]['formato'];

/** Per l'`accept` della finestra di scelta file e per i messaggi d'errore. */
export const ESTENSIONI_ACCETTATE = FORMATI_DOCUMENTO.flatMap((f) => [...f.estensioni]);

/** «PDF, Word, Excel, Markdown, testo, CSV e immagini», per parlare all'utente. */
export const ELENCO_FORMATI = FORMATI_DOCUMENTO.map((f) => f.etichetta).join(', ');
