import { z } from 'zod';

import type { Identita } from '../db/identita.js';

/**
 * Specchio di `fe-angular/src/app/core/models/utente.ts` — la forma che
 * `GET /api/sessione` deve restituire. Ogni divergenza è una modifica di
 * contratto.
 */
/**
 * `ospite` (07/09/2026) è il cliente dell'agenzia che entra dal link di una
 * chat cliente. Non compare mai nell'elenco utenti delle Impostazioni: non
 * è personale dell'agenzia, e mescolarlo ai colleghi confonderebbe la
 * pagina che serve a governare chi lavora.
 */
export type Ruolo = 'operatore' | 'amministratore' | 'ospite';

export type Permesso =
  | 'archivio-privato.carica'
  | 'archivio-privato.elimina'
  | 'istruzioni.gestisci'
  | 'riferimenti.gestisci'
  | 'template.gestisci'
  | 'utenti.gestisci'
  | 'modello-ai.configura'
  /* Fase 10: correggere la convenzione dell'archivio. Leggerla è di tutti —
     sapere come il sistema si orienta serve a chi lo usa, non solo a chi lo
     amministra — ma cambiarla vale per l'agenzia intera. */
  | 'archivio-privato.organizza'
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
  /**
   * Il lotto di saluti per la schermata iniziale, generato dal modello e
   * valido per tutti (le frasi portano il segnaposto `{nome}`). Assente se
   * nessun lotto è ancora stato generato: il FE usa le sue frasi fisse.
   */
  saluti?: LottoSaluti;
}

/**
 * Le fasce orarie del saluto: l'ora la decide il browser dell'utente, il
 * server fornisce solo le frasi per ciascuna. Specchio di `saluto.ts` nel FE.
 */
export const FASCE_SALUTO = ['notte', 'alba', 'mattina', 'pranzo', 'pomeriggio', 'sera'] as const;
export type FasciaSaluto = (typeof FASCE_SALUTO)[number];

export interface LottoSaluti {
  generatoIl: string;
  frasi: Record<FasciaSaluto, string[]>;
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
  'archivio-privato.organizza',
  'mcp.credenziali',
];

export function permessiPerRuolo(ruolo: Identita['ruolo']): Permesso[] {
  /*
   * L'ospite si nomina per primo, e non per ordine alfabetico: scritta come
   * «amministratore oppure operatore», questa funzione avrebbe dato a un
   * cliente dell'agenzia i permessi di un operatore. Ogni ruolo nuovo passa
   * di qui, e il default è nessun permesso.
   */
  if (ruolo === 'ospite') return [];
  return ruolo === 'amministratore' ? PERMESSI_AMMINISTRATORE : PERMESSI_OPERATORE;
}

/**
 * Che cosa vede chi apre il link di una chat cliente: `POST /api/sessione/ospite`.
 *
 * Non è una `Sessione`: non ci sono permessi da elencare (un ospite non ne
 * ha nessuno) e non c'è nessun token da conservare — il token del link è
 * già la credenziale, e resta quello. Qui c'è solo ciò che serve a scrivere
 * la testata della pagina: di chi è l'agenzia, e di che chat si tratta.
 *
 * Le istruzioni della chat **non** escono di qui: sono scritte dall'agenzia
 * per il motore, non per il cliente.
 */
export interface SessioneOspite {
  chat: { id: string; titolo: string };
  ospite: { id: string; nome: string; cognome: string };
  agenzia: { id: string; nome: string; logoUrl?: string };
}

/** Corpo di `POST /api/sessione/ospite`: il segreto che sta nel link. */
export const schemaAccessoOspite = z.object({ token: z.string().min(20).max(200) });

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
