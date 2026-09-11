import { z } from 'zod';

/**
 * Le pagine condivise (11/09/2026, fase 2 di `PIANO-LINK-E-FORMATI.md`): un
 * documento generato in chat che l'agenzia manda al cliente come link. Il
 * link è la credenziale, e vale finché non scade o non viene revocato.
 *
 * Specchio di `fe-angular/src/app/core/models/pagine.ts`.
 */

/** Quanto dura un link nuovo, se chi lo crea non dice altro (decisione del committente). */
export const GIORNI_LINK_PREDEFINITI = 30;

/** Il link di un documento generato, come lo vede l'agenzia. */
export interface LinkDocumento {
  url: string;
  /** ISO 8601; null = nessuna scadenza. */
  scadeIl: string | null;
  creatoIl: string;
}

/**
 * Corpo di `PUT /api/conversazioni/:id/documenti/:did/link`: quanti giorni
 * da oggi, o `null` per nessuna scadenza. Assente: 30 giorni per un link
 * nuovo, scadenza invariata per uno che c'è già.
 */
export const schemaLinkDocumento = z.object({
  giorni: z.number().int().min(1).max(365).nullable().optional(),
});

export type RichiestaLinkDocumento = z.infer<typeof schemaLinkDocumento>;
