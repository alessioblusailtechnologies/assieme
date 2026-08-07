import { z } from 'zod';

/**
 * RF-A-08 — Segnalazioni sull'Archivio Pubblico.
 *
 * L'archivio lo mantiene Velia, ma chi lo usa tutti i giorni è il primo ad
 * accorgersi quando qualcosa non torna: un set che manca, un'edizione
 * superata, un errore di conversione. La segnalazione è il canale — una
 * riga verso il gestore della piattaforma, non un ticket.
 *
 * Il contratto nasce qui (il mock non aveva questa rotta): la controparte
 * FE è `core/api/segnalazioni-api.ts` + `core/models/segnalazione.ts`.
 */

export const TIPI_SEGNALAZIONE = ['mancante', 'obsoleto', 'errato'] as const;
export type TipoSegnalazione = (typeof TIPI_SEGNALAZIONE)[number];

export const schemaNuovaSegnalazione = z.object({
  tipo: z.enum(TIPI_SEGNALAZIONE),
  messaggio: z.string().trim().min(1).max(2000),
  /** Assente per «manca un documento»: non c'è la riga da indicare. */
  documentoId: z.string().min(1).optional(),
});

export type NuovaSegnalazione = z.infer<typeof schemaNuovaSegnalazione>;

/** La risposta del POST: la segnalazione registrata. */
export interface Segnalazione {
  id: string;
  tipo: TipoSegnalazione;
  messaggio: string;
  documentoId?: string;
  creataIl: string;
}
