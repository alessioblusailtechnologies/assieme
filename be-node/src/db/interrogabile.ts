import type pg from 'pg';

/**
 * Tutto quello che serve a chi interroga il database senza sapere da dove
 * arriva la connessione: un `Pool` (il worker, che legge e scrive con la
 * connessione di sistema) oppure un client dentro una transazione con
 * identità (le rotte, che passano dalla RLS). Chiedere `pg.ClientBase`
 * escluderebbe il primo senza guadagnare niente.
 *
 * Stava in `archivio/albero.ts` fino al 12/09/2026: se n'è andato con
 * l'albero, ma non era mai stato un concetto dell'archivio.
 */
export interface Interrogabile {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    testo: string,
    valori?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}
