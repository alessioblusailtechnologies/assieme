import { z } from 'zod';

import type { ArchivioRiferimento, Citazione } from './conversazioni.js';

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

// ---------------------------------------------------------------------------
// Il globo della memoria (GET /api/ricordi/grafo)
// ---------------------------------------------------------------------------

/**
 * Il grafo che il pannello memoria rende come globo. Due strati, entrambi
 * veri e navigabili:
 *
 *  · **l'archivio**: rami → compagnie → prodotti → documenti (le edizioni
 *    correnti del pubblico) — è la trama fitta del globo, i cluster;
 *  · **il lavoro**: i ricordi legati alle conversazioni da cui sono emersi,
 *    le conversazioni ai passaggi citati (le ancore `[pag. N]`), i passaggi
 *    ai documenti. Un ricordo non porta riferimenti documentali (il
 *    perimetro dell'estrattore li esclude apposta): il ponte è la
 *    conversazione.
 *
 * La visibilità la fa la RLS come ovunque: l'archivio pubblico è di tutti,
 * conversazioni proprie o condivise, ricordi del tenant più i propri
 * personali — il globo di due colleghi può legittimamente differire.
 */

export const TIPI_NODO_GRAFO = [
  'ricordo',
  'conversazione',
  'punto',
  'documento',
  'prodotto',
  'compagnia',
  'ramo',
] as const;
export type TipoNodoGrafo = (typeof TIPI_NODO_GRAFO)[number];

export interface NodoGrafoMemoria {
  /** Chiave unica nel grafo, con prefisso di tipo: `ricordo:<id>`, `punto:<documentoId>@<pagina>`. */
  chiave: string;
  tipo: TipoNodoGrafo;
  etichetta: string;
  /** Quante volte il lavoro l'ha toccato: il raggio del nodo nel globo. */
  peso: number;
  /** L'id dell'entità da aprire (assente per i punti: lì parla `citazione`). */
  id?: string;
  /** Solo documento: in quale archivio sta, per la scheda e per il PDF. */
  archivio?: ArchivioRiferimento;
  /** Solo ricordo: come nell'elenco, per colore e stato. */
  categoria?: CategoriaRicordo;
  ambito?: AmbitoRicordo;
  attivo?: boolean;
  /** Solo ricordo: il testo intero — l'etichetta è accorciata per il disegno. */
  testo?: string;
  /** Solo punto: la citazione completa — estratto, posizione, documento. */
  citazione?: Citazione;
}

export interface LegameGrafoMemoria {
  /** Chiavi dei nodi collegati. */
  da: string;
  a: string;
  /** Quante volte il legame è stato percorso (1 = un tocco). */
  peso: number;
}

export interface GrafoMemoria {
  nodi: NodoGrafoMemoria[];
  legami: LegameGrafoMemoria[];
}
