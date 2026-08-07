import { z } from 'zod';

import type { Identita } from '../db/identita.js';

/**
 * Specchio di `fe-angular/src/app/core/models/utente.ts` — la forma che
 * `GET /api/sessione` deve restituire. Ogni divergenza è una modifica di
 * contratto.
 */
export type Ruolo = 'operatore' | 'amministratore';

export type Permesso =
  | 'archivio-privato.carica'
  | 'archivio-privato.elimina'
  | 'istruzioni.gestisci'
  | 'riferimenti.gestisci'
  | 'template.gestisci'
  | 'utenti.gestisci'
  | 'modello-ai.configura'
  | 'mcp.credenziali'
  | 'agenti.crea';

export interface Sessione {
  utente: {
    id: string;
    nome: string;
    cognome: string;
    email: string;
    ruolo: Ruolo;
    tenantId: string;
    ultimoAccesso?: string;
  };
  tenant: {
    id: string;
    nome: string;
    logoUrl?: string;
    piano: 'base' | 'professionale' | 'agenzia';
  };
  permessi: Permesso[];
}

/**
 * I permessi per ruolo — la stessa assunzione minima del FE
 * (`amministratore` ⊃ `operatore`), qui perché è il server a doverla
 * affermare: il FE la usa per mostrare, il server per rifiutare.
 *
 * Nota (07/08/2026): la fixture mock portava ancora
 * `knowledge-base.gestisci` (v0.8); il vocabolario giusto è quello del tipo
 * `Permesso` del FE, con `riferimenti.gestisci`.
 */
const PERMESSI_OPERATORE: Permesso[] = [
  'archivio-privato.carica',
  'archivio-privato.elimina',
  'agenti.crea',
];

const PERMESSI_AMMINISTRATORE: Permesso[] = [
  ...PERMESSI_OPERATORE,
  'istruzioni.gestisci',
  'riferimenti.gestisci',
  'template.gestisci',
  'utenti.gestisci',
  'modello-ai.configura',
  'mcp.credenziali',
];

export function permessiPerRuolo(ruolo: Identita['ruolo']): Permesso[] {
  return ruolo === 'amministratore' ? PERMESSI_AMMINISTRATORE : PERMESSI_OPERATORE;
}

/** Corpo di `POST /api/sessione/accesso`. */
export const schemaAccesso = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Corpo di `POST /api/sessione/aggiorna`. */
export const schemaAggiorna = z.object({
  tokenAggiornamento: z.string().min(1),
});

/**
 * Risposta di accesso e aggiornamento: i token viaggiano nel corpo, il FE
 * li conserva e li allega con l'interceptor. `sessione` evita al client la
 * chiamata immediata a `GET /api/sessione` dopo il login.
 */
export interface EsitoAccesso {
  tokenAccesso: string;
  tokenAggiornamento: string;
  scadeInSecondi: number;
  sessione: Sessione;
}
