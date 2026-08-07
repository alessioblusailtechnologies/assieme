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
