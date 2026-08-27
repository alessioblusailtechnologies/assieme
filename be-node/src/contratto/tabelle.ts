import { z } from 'zod';
import type { TipologiaDocumento } from './documenti.js';

import type { Citazione } from './conversazioni.js';

/**
 * Le tabelle di analisi (RF-C-11…C-15) — lo specchio di
 * `fe-angular/core/models/tabella.ts`, col comportamento fissato da
 * `mocks/tabelle.mjs`. Ogni cella è un valore estratto che porta con sé la
 * citazione completa o la dichiarazione di assenza: non esiste una cella che
 * afferma qualcosa senza dire da dove viene (RF-C-12).
 */

export type StatoTabella = 'in-generazione' | 'completa' | 'errore';

export interface ColonnaTabella {
  id: string;
  intestazione: string;
  origine: 'predefinita' | 'personalizzata';
  /** Per le personalizzate: il criterio così come l'utente l'ha scritto. */
  criterio?: string;
}

export type CellaTabella =
  | { stato: 'in-attesa' }
  | { stato: 'pronta'; esito: 'presente'; valore: string; citazioni: Citazione[] }
  | { stato: 'pronta'; esito: 'non-presente'; nota?: string }
  | { stato: 'pronta'; esito: 'non-determinabile'; motivo: string };

export interface RigaTabella {
  documentoId: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  /** Etichetta di riga già pronta: compagnia + prodotto, o titolo del privato. */
  etichetta: string;
  /** Che documento è: l'etichetta da sola non distingue tre documenti dello stesso prodotto. */
  tipologia: TipologiaDocumento;
  /** Chiave = `ColonnaTabella.id`. */
  celle: Record<string, CellaTabella>;
}

export interface TabellaAnalisi {
  id: string;
  titolo: string;
  creataIl: string;
  aggiornataIl: string;
  autoreId: string;
  condivisa: boolean;
  colonne: ColonnaTabella[];
  righe: RigaTabella[];
  stato: StatoTabella;
}

export interface TabellaRiepilogo {
  id: string;
  titolo: string;
  creataIl: string;
  aggiornataIl: string;
  autoreId: string;
  condivisa: boolean;
  stato: StatoTabella;
  numeroDocumenti: number;
  numeroColonne: number;
}

export interface PaginaTabelle {
  elementi: TabellaRiepilogo[];
  totale: number;
  pagina: number;
  perPagina: number;
}

export interface CriterioPredefinito {
  id: string;
  intestazione: string;
  descrizione: string;
  ramoId?: string;
}

/** Colonna come la manda il client: l'id lo assegna il server. */
export const schemaNuovaColonna = z.object({
  intestazione: z.string().trim().min(1).max(200),
  origine: z.enum(['predefinita', 'personalizzata']),
  criterio: z.string().trim().min(1).max(500).optional(),
});

export type NuovaColonna = z.infer<typeof schemaNuovaColonna>;

export const schemaNuovaTabella = z.object({
  titolo: z.string().trim().min(1).max(200).optional(),
  documentiIds: z.array(z.string().min(1)).min(1).max(50),
  colonne: z.array(schemaNuovaColonna).min(1).max(30),
});

/** Come per le conversazioni: titolo solo se non vuoto, il resto si ignora. */
export const schemaModificheTabella = z.object({
  titolo: z.string().optional(),
  condivisa: z.boolean().optional(),
});

export const schemaAggiungiDocumenti = z.object({
  documentiIds: z.array(z.string().min(1)).max(50).default([]),
});
