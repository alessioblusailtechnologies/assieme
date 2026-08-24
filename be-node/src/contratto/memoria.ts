import { z } from 'zod';

/**
 * Memoria (RF-G-01…G-06) — lo specchio di `fe-angular/core/models/memoria.ts`
 * col comportamento fissato da `mocks/memoria.mjs`: solo GET/PATCH/DELETE,
 * nessuna creazione dal client (la registrazione esplicita RF-G-07 è stata
 * rimossa: un ricordo nasce solo dal job di apprendimento).
 */

export const AMBITI_RICORDO = ['tenant', 'personale'] as const;
export const CATEGORIE_RICORDO = ['prassi', 'cliente', 'preferenza', 'decisione', 'altro'] as const;

export type AmbitoRicordo = (typeof AMBITI_RICORDO)[number];
export type CategoriaRicordo = (typeof CATEGORIE_RICORDO)[number];

export interface Ricordo {
  id: string;
  testo: string;
  ambito: AmbitoRicordo;
  categoria: CategoriaRicordo;
  origineConversazioneId?: string;
  creatoIl: string;
  aggiornatoIl: string;
  attivo: boolean;
}

/** Ogni campo è indipendente (mock): si tocca solo ciò che arriva. */
export const schemaModificheRicordo = z.object({
  testo: z.string().trim().min(1).max(1000).optional(),
  ambito: z.enum(AMBITI_RICORDO).optional(),
  categoria: z.enum(CATEGORIE_RICORDO).optional(),
  attivo: z.boolean().optional(),
});

export type ModificheRicordo = z.infer<typeof schemaModificheRicordo>;

/** La forma con cui due testi si confrontano: minuscolo, spazi compressi. */
export function improntaRicordo(testo: string): string {
  return testo.trim().toLowerCase().replace(/\s+/g, ' ');
}
