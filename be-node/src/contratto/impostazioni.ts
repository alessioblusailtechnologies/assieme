import { z } from 'zod';

/**
 * Istruzioni (RF-D-04…D-08), documenti di riferimento (RF-D-14…D-16) e
 * storico (RF-D-07) — lo specchio di `fe-angular/core/models/impostazioni.ts`
 * per il resto della Fase 6, col comportamento fissato da
 * `mocks/impostazioni.mjs`.
 */

export type AmbitoIstruzione =
  | { tipo: 'generale' }
  | { tipo: 'ramo'; ramoId: string }
  | { tipo: 'compagnia'; compagniaId: string };

export interface RegolaIstruzione {
  id: string;
  titolo: string;
  testo: string;
  ambito: AmbitoIstruzione;
  attiva: boolean;
  creataDa: string;
  aggiornataIl: string;
}

export interface DocumentoRiferimento {
  id: string;
  titolo: string;
  /** Valorizzato quando nasce da un documento dell'Archivio Privato. */
  documentoPrivatoId?: string;
  ambito: AmbitoIstruzione;
  attivo: boolean;
  numeroPagine?: number;
  /** RF-D-16: il peso del contesto permanente — il Markdown, non il PDF. */
  dimensioneByte: number;
  caricatoDa: string;
  aggiornatoIl: string;
}

export interface VoceStoricoImpostazioni {
  id: string;
  istante: string;
  utenteId: string;
  utenteNome: string;
  azione: 'creazione' | 'modifica' | 'attivazione' | 'disattivazione' | 'eliminazione';
  oggetto: 'regola' | 'documento-riferimento' | 'modello' | 'template';
  descrizione: string;
}

export const schemaAmbito = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('generale') }),
  z.object({ tipo: z.literal('ramo'), ramoId: z.string().min(1) }),
  z.object({ tipo: z.literal('compagnia'), compagniaId: z.string().min(1) }),
]);

export const schemaNuovaRegola = z.object({
  titolo: z.string().trim().min(1).max(200),
  testo: z.string().trim().min(1).max(4000),
  ambito: schemaAmbito.default({ tipo: 'generale' }),
});

/** Ogni campo è indipendente (mock): si tocca solo ciò che arriva. */
export const schemaModificheRegola = z.object({
  titolo: z.string().trim().min(1).max(200).optional(),
  testo: z.string().trim().min(1).max(4000).optional(),
  ambito: schemaAmbito.optional(),
  attiva: z.boolean().optional(),
});

export const schemaModificheRiferimento = z.object({
  ambito: schemaAmbito.optional(),
  attivo: z.boolean().optional(),
});

/** Le colonne d'ambito come stanno in tabella ↔ la forma del contratto. */
export function versoAmbito(riga: {
  ambito_tipo: string;
  ambito_ramo_id: string | null;
  ambito_compagnia_id: string | null;
}): AmbitoIstruzione {
  if (riga.ambito_tipo === 'ramo' && riga.ambito_ramo_id) {
    return { tipo: 'ramo', ramoId: riga.ambito_ramo_id };
  }
  if (riga.ambito_tipo === 'compagnia' && riga.ambito_compagnia_id) {
    return { tipo: 'compagnia', compagniaId: riga.ambito_compagnia_id };
  }
  return { tipo: 'generale' };
}

export function colonneAmbito(ambito: AmbitoIstruzione): {
  tipo: string;
  ramoId: string | null;
  compagniaId: string | null;
} {
  return {
    tipo: ambito.tipo,
    ramoId: ambito.tipo === 'ramo' ? ambito.ramoId : null,
    compagniaId: ambito.tipo === 'compagnia' ? ambito.compagniaId : null,
  };
}
