import { z } from 'zod';

/**
 * I template di output e l'identità visiva (RF-D-10…D-13, RF-C-10) — lo
 * specchio di `fe-angular/core/models/impostazioni.ts` per la parte che la
 * Fase 4 serve dal backend.
 */

export const TIPOLOGIE_OUTPUT = [
  'confronto',
  'riepilogo-garanzie',
  'proposta-rinnovo',
  'report-interno',
] as const;

export type TipologiaOutput = (typeof TIPOLOGIE_OUTPUT)[number];

/**
 * Il contratto ammette anche `pptx` (il tipo FE lo elenca), ma la
 * generazione PPTX è rimandata (punto aperto §6.11, deciso in Fase 5 FE):
 * il caricamento di un template PPTX si rifiuta con un motivo leggibile.
 */
export type FormatoTemplate = 'pdf' | 'docx' | 'xlsx' | 'pptx';

export interface TemplateOutput {
  id: string;
  nome: string;
  formato: FormatoTemplate;
  descrizione: string;
  anteprimaUrl?: string;
  /** RF-D-12: caricato dal tenant invece che precaricato dalla piattaforma. */
  personalizzato: boolean;
  /** RF-D-13: template predefinito per una tipologia di output. */
  tipologiaPredefinita?: TipologiaOutput;
}

/** RF-D-12: l'identità visiva che i template applicano alla generazione. */
export interface IdentitaVisiva {
  logoUrl?: string;
  colorePrimario: string;
  recapiti: string;
  firma: string;
}

/** Corpo di `PATCH /api/template/:id`: solo il predefinito, `null` lo toglie. */
export const schemaPatchTemplate = z
  .object({ tipologiaPredefinita: z.enum(TIPOLOGIE_OUTPUT).nullable() })
  .strict();

/**
 * Corpo di `PUT /api/identita-visiva`. Come il mock: aggiorna i campi
 * presenti e ignora il resto (il FE manda sempre tutti e tre).
 */
export const schemaIdentitaVisiva = z.object({
  colorePrimario: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Il colore primario è un esadecimale, es. #2f4b7c.')
    .optional(),
  recapiti: z.string().max(500).optional(),
  firma: z.string().max(200).optional(),
});

/** Corpo di `POST …/messaggi/:id/esporta` (RF-C-10). */
export const schemaEsporta = z.object({ templateId: z.string().min(1) });
