import type pg from 'pg';

/** Il canale NOTIFY su cui l'API ascolta gli avanzamenti dei job. */
export const CANALE_EVENTI = 'eventi_job';

/**
 * Ciò che viaggia dentro NOTIFY: solo il puntatore. Il payload vero sta
 * nella riga di `eventi_job` (il limite di NOTIFY è 8000 byte, un evento
 * con testo di risposta lo sfonderebbe).
 */
export interface PuntatoreEvento {
  jobId: string;
  eventoId: number;
  tipo: string;
}

/**
 * Emette un evento di avanzamento: riga in `eventi_job` (persistenza e
 * replay per l'audit) + NOTIFY col puntatore (la spinta in tempo reale
 * verso lo stream SSE dell'API).
 */
export async function emettiEvento(
  db: pg.Pool | pg.ClientBase,
  jobId: string,
  tipo: string,
  dati: Record<string, unknown> = {},
): Promise<number> {
  const inserito = await db.query<{ id: string }>(
    `insert into velia.eventi_job (job_id, tipo, dati)
     values ($1, $2, $3) returning id`,
    [jobId, tipo, dati],
  );
  const eventoId = Number(inserito.rows[0]!.id);
  const puntatore: PuntatoreEvento = { jobId, eventoId, tipo };
  await db.query('select pg_notify($1, $2)', [CANALE_EVENTI, JSON.stringify(puntatore)]);
  return eventoId;
}

/**
 * Apre una connessione dedicata in LISTEN sul canale eventi e consegna i
 * puntatori man mano che arrivano. È il lato API del ponte SSE (§3.1 del
 * piano): una connessione per processo, non per richiesta — lo smistamento
 * per job lo fa chi consuma.
 *
 * Restituisce la funzione di chiusura.
 */
export async function ascoltaEventi(
  creaClient: () => pg.Client,
  consegna: (puntatore: PuntatoreEvento) => void,
): Promise<() => Promise<void>> {
  const client = creaClient();
  await client.connect();
  client.on('notification', (n) => {
    if (n.channel !== CANALE_EVENTI || !n.payload) return;
    try {
      consegna(JSON.parse(n.payload) as PuntatoreEvento);
    } catch {
      // Un payload malformato non deve far cadere l'ascolto.
    }
  });
  await client.query(`listen ${CANALE_EVENTI}`);
  return async () => {
    await client.query(`unlisten ${CANALE_EVENTI}`).catch(() => undefined);
    await client.end();
  };
}
