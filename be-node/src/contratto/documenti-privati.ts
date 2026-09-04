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
  /* Fase 10 — dove sta e di chi è. Assenti = «Da sistemare», che è una
     condizione normale: il documento è pronto e referenziabile lo stesso. */
  cartellaId?: string;
  /** Il percorso leggibile dalla radice: quello che l'utente vede e pronuncia. */
  percorso?: string;
  cliente?: { id: string; nome: string };
  /** Vero finché la collocazione è una proposta: uno spostamento a mano la fissa. */
  collocazioneDaConfermare?: boolean;
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
  /* Fase 10. `cartellaId` da solo mostra anche il sottoalbero (è quello che
     ci si aspetta cliccando una cartella nell'albero); `soloQui` la
     restringe alla cartella esatta. `daSistemare` è il non-collocato, e non
     si combina con `cartellaId`: sono due viste diverse. */
  cartellaId: z.string().uuid().optional(),
  soloQui: booleanoQuery,
  daSistemare: booleanoQuery,
  clienteId: z.string().uuid().optional(),
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
    /* Fase 10. Spostare a mano è definitivo: `collocazioneDaConfermare` si
       spegne e nessun ricalcolo rimette il documento in discussione.
       `null` su `cartellaId` lo rimanda in «Da sistemare». */
    cartellaId: z.string().uuid().nullable().optional(),
    clienteId: z.string().uuid().nullable().optional(),
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
