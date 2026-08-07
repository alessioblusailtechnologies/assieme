import pg from 'pg';

import { configurazione } from '../config.js';

/*
 * Le colonne `date` restano stringhe 'YYYY-MM-DD': lasciarle diventare Date
 * JavaScript significa passare dalla mezzanotte locale, e con un fuso a est
 * di Greenwich ogni data scivola al giorno prima appena la si serializza.
 * Una data di validità non ha ore: non deve averne nemmeno in transito.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (valore) => valore);

let istanza: pg.Pool | undefined;

/**
 * Il pool Postgres condiviso del processo (API o worker).
 *
 * La connessione va al progetto Supabase online: TLS obbligatorio. Verso
 * un Postgres locale (test in CI) il TLS si disattiva da solo.
 */
function urlDb(): string {
  const url = configurazione().DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL mancante in .env: serve la connessione Postgres diretta (vedi .env.example).');
  }
  return url;
}

export function poolDb(): pg.Pool {
  if (!istanza) {
    const url = urlDb();
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
  const url = urlDb();
  const locale = url.includes('localhost') || url.includes('127.0.0.1');
  return new pg.Client({
    connectionString: url,
    ...(locale ? {} : { ssl: { rejectUnauthorized: false } }),
  });
}
