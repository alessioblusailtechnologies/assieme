import pg from 'pg';

import { configurazione } from '../config.js';

let istanza: pg.Pool | undefined;

/**
 * Il pool Postgres condiviso del processo (API o worker).
 *
 * La connessione va al progetto Supabase online: TLS obbligatorio. Verso
 * un Postgres locale (test in CI) il TLS si disattiva da solo.
 */
export function poolDb(): pg.Pool {
  if (!istanza) {
    const url = configurazione().DATABASE_URL;
    const locale = url.includes('localhost') || url.includes('127.0.0.1');
    istanza = new pg.Pool({
      connectionString: url,
      ...(locale ? {} : { ssl: { rejectUnauthorized: false } }),
      max: 10,
    });
  }
  return istanza;
}

export async function chiudiPool(): Promise<void> {
  await istanza?.end();
  istanza = undefined;
}

/**
 * Un client fuori dal pool, per chi tiene la connessione occupata a vita:
 * l'ascolto LISTEN/NOTIFY. Stessa configurazione TLS del pool.
 */
export function creaClientDedicato(): pg.Client {
  const url = configurazione().DATABASE_URL;
  const locale = url.includes('localhost') || url.includes('127.0.0.1');
  return new pg.Client({
    connectionString: url,
    ...(locale ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}
