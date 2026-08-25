import { z } from 'zod';

/**
 * I template di output e l'identità visiva (RF-D-10…D-13, RF-C-10) — lo
 * specchio di `fe-angular/core/models/impostazioni.ts`.
 *
 * Revisione del 25/08/2026: un template è sempre un file caricato
 * dall'agenzia, quanti ne vuole e anche più d'uno per formato; ognuno ha un
 * nome con cui si richiama (in chat, negli agenti). Per ogni formato ce n'è
 * al più uno predefinito. Quando per un formato non c'è nessun template,
 * l'output si impagina col layout di piattaforma e l'identità visiva.
 */

/** I formati che il motore sa generare. */
export const FORMATI_GENERAZIONE = ['pdf', 'docx', 'xlsx'] as const;

export type FormatoGenerazione = (typeof FORMATI_GENERAZIONE)[number];

/**
 * Il contratto ammette anche `pptx` (il tipo FE lo elenca), ma la
 * generazione PPTX è rimandata (punto aperto §6.11): il caricamento di un
 * template PPTX si rifiuta con un motivo leggibile.
 */
export type FormatoTemplate = FormatoGenerazione | 'pptx';

export interface TemplateOutput {
  id: string;
  nome: string;
  formato: FormatoTemplate;
  descrizione: string;
  anteprimaUrl?: string;
  /** RF-D-13: il predefinito per il suo formato (al più uno per formato). */
  predefinito: boolean;
}

/** RF-D-12: l'identità visiva che i template applicano alla generazione. */
export interface IdentitaVisiva {
  logoUrl?: string;
  colorePrimario: string;
  recapiti: string;
  firma: string;
}

/**
 * Corpo di `PATCH /api/template/:id`: il nome con cui si richiama e/o il
 * predefinito per il suo formato (`true` lo toglie a chi lo portava).
 */
export const schemaPatchTemplate = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    predefinito: z.boolean().optional(),
  })
  .strict()
  .refine((m) => m.nome !== undefined || m.predefinito !== undefined, {
    message: 'Indica il nome o il predefinito.',
  });

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

/**
 * Corpo delle esportazioni (chat RF-C-10, tabelle RF-C-14): un template
 * preciso, oppure solo il formato — allora vale il predefinito del formato,
 * e senza predefinito il layout di piattaforma.
 */
export const schemaEsporta = z
  .object({
    templateId: z.string().min(1).optional(),
    formato: z.enum(FORMATI_GENERAZIONE).optional(),
  })
  .refine((e) => e.templateId !== undefined || e.formato !== undefined, {
    message: 'Indica il template o il formato.',
  });

export type RichiestaEsporta = z.infer<typeof schemaEsporta>;
