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
 * Corpo delle esportazioni (chat RF-C-10, tabelle RF-C-14): il formato, o
 * un template da cui ricavarlo. Dall'11/09/2026 l'impaginazione è sempre il
 * layout di VELIA con l'intestazione dell'agenzia: il template resta
 * accettato finché tabelle e agenti non passano ai soli formati (fase 3).
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

/**
 * L'«Esporta come» di una risposta in chat (29/08/2026): i formati
 * generabili più il testo semplice, che non passa da nessun template.
 */
export const FORMATI_ESPORTA_RISPOSTA = [...FORMATI_GENERAZIONE, 'txt'] as const;

export type FormatoEsportaRisposta = (typeof FORMATI_ESPORTA_RISPOSTA)[number];

export const schemaEsportaRisposta = z
  .object({
    templateId: z.string().min(1).optional(),
    formato: z.enum(FORMATI_ESPORTA_RISPOSTA).optional(),
  })
  .refine((e) => e.templateId !== undefined || e.formato !== undefined, {
    message: 'Indica il template o il formato.',
  });

export type RichiestaEsportaRisposta = z.infer<typeof schemaEsportaRisposta>;
