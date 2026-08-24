import { z } from 'zod';

/**
 * Gestione utenti del tenant (RF-D-01) — lo specchio di
 * `fe-angular/core/models/utente.ts`. Non esiste un'eliminazione: un utente
 * si sospende, perché chi se ne va lascia conversazioni, tabelle e regole
 * firmate col suo nome.
 */

export interface Utente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: 'operatore' | 'amministratore';
  tenantId: string;
  ultimoAccesso?: string;
  stato?: 'attivo' | 'invitato' | 'sospeso';
}

export const schemaNuovoUtente = z.object({
  nome: z.string().trim().min(1).max(100),
  cognome: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  ruolo: z.enum(['operatore', 'amministratore']).default('operatore'),
});

/** Il PATCH del mock: ruolo e stato, ognuno per conto suo. */
export const schemaModificheUtente = z.object({
  ruolo: z.enum(['operatore', 'amministratore']).optional(),
  stato: z.enum(['attivo', 'sospeso']).optional(),
});
