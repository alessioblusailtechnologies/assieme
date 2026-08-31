import { z } from 'zod';

/**
 * Specchio di `fe-angular/src/app/core/models/documento.ts` e del
 * comportamento di `mocks/api-stub.mjs` — il contratto del dominio
 * documentale. Qui i soli tipi del Pubblico: il Privato arriva in Fase 2.
 */

export const TIPOLOGIE = [
  'dip',
  'dip-aggiuntivo',
  'condizioni-assicurazione',
  'glossario',
  'preventivo',
  'polizza',
  'appendice',
  'convenzione',
  'nota-tecnica',
  'altro',
] as const;

export type TipologiaDocumento = (typeof TIPOLOGIE)[number];

/**
 * L'ordine di lettura di un set informativo, non alfabetico: prima il DIP,
 * poi l'Aggiuntivo, poi le Condizioni, infine il Glossario (dallo stub).
 */
export const ORDINE_TIPOLOGIA: readonly TipologiaDocumento[] = TIPOLOGIE;

export interface Compagnia {
  id: string;
  nome: string;
  ultimoAggiornamento?: string;
}

export interface Ramo {
  id: string;
  nome: string;
  codice: string;
}

export interface Edizione {
  id: string;
  etichetta: string;
  validaDal: string;
  validaAl?: string;
  corrente: boolean;
}

export interface DocumentoPubblico {
  id: string;
  archivio: 'pubblico';
  titolo: string;
  tipologia: TipologiaDocumento;
  numeroPagine?: number;
  /**
   * Dove il documento comincia nel PDF condiviso dell'edizione (le compagnie
   * pubblicano il set in un file unico): il visualizzatore si apre qui.
   * Stessa numerazione delle ancore `[pag. N]` e delle citazioni.
   */
  paginaInizio?: number;
  fileUrl: string;
  compagnia: Compagnia;
  ramo: Ramo;
  prodotto: string;
  edizione: Edizione;
  preferito: boolean;
}

/** RF-A-04: un'edizione sorella, con il documento che la rappresenta. */
export interface EdizioneDiProdotto extends Edizione {
  documentoId: string;
}

export interface DettaglioDocumento extends DocumentoPubblico {
  edizioni: EdizioneDiProdotto[];
}

/** La busta dell'elenco, identica allo stub. */
export interface PaginaDocumenti {
  elementi: DocumentoPubblico[];
  totale: number;
  pagina: number;
  perPagina: number;
}

/** Parametri di GET /api/documenti (RF-A-03), come li manda il FE. */
export const schemaFiltriDocumenti = z.object({
  compagniaId: z.string().optional(),
  ramoId: z.string().optional(),
  tipologia: z.enum(TIPOLOGIE).optional(),
  q: z.string().optional(),
  soloCorrenti: z.coerce.boolean().optional(),
  soloPreferiti: z.coerce.boolean().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  perPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type FiltriDocumenti = z.infer<typeof schemaFiltriDocumenti>;

// ---------------------------------------------------------------------------
// Set informativi (GET /api/set-informativi)
// ---------------------------------------------------------------------------

/** Un documento dentro il set: il minimo per aprirlo dalla riga. */
export interface DocumentoDelSet {
  id: string;
  titolo: string;
  tipologia: TipologiaDocumento;
  numeroPagine?: number;
  preferito: boolean;
}

/**
 * La riga dell'Archivio Pubblico è il set informativo: il prodotto in una
 * sua edizione, coi documenti che lo compongono nell'ordine di lettura
 * (DIP → DIP Aggiuntivo → Condizioni → Glossario). È l'unità con cui un
 * intermediario ragiona — l'elenco per singolo documento ripeteva lo stesso
 * prodotto tre o quattro righe di fila.
 *
 * `preferito` è del set: vero se almeno un documento è marcato. La stella
 * della riga marca e smarca tutti i documenti del set (RF-A-09 resta
 * per-documento sotto il cofano).
 */
export interface SetInformativo {
  /** Chiave stabile della riga: compagnia + prodotto + edizione. */
  chiave: string;
  prodotto: string;
  compagnia: Compagnia;
  ramo: Ramo;
  edizione: Edizione;
  documenti: DocumentoDelSet[];
  preferito: boolean;
}

export interface PaginaSet {
  elementi: SetInformativo[];
  totale: number;
  pagina: number;
  perPagina: number;
}

/**
 * Come i filtri dei documenti, senza la tipologia: a livello di set quasi
 * ogni riga ha DIP e Condizioni, e il filtro non distinguerebbe più nulla.
 */
export const schemaFiltriSet = schemaFiltriDocumenti.omit({ tipologia: true });

export type FiltriSet = z.infer<typeof schemaFiltriSet>;
