import type pg from 'pg';

/** La coda pgmq unica dei lavori; il tipo sta nel job, il worker smista. */
export const CODA_LAVORI = 'lavori';

export type TipoJob = 'prova' | 'ingestion' | 'interrogazione' | 'tabella' | 'agente' | 'memoria';

export interface Job {
  id: string;
  tenant_id: string | null;
  tipo: TipoJob;
  payload: Record<string, unknown>;
  stato: 'in-coda' | 'in-esecuzione' | 'completato' | 'fallito' | 'annullato';
  tentativi: number;
  errore: string | null;
}

/** Un messaggio pescato dalla coda: il puntatore pgmq più la riga di dominio. */
export interface MessaggioJob {
  msgId: number;
  /** Quante volte è stato consegnato (1 alla prima): la base del retry. */
  consegne: number;
  job: Job;
}

/**
 * Accoda un job: riga di dominio + messaggio pgmq, nella stessa transazione.
 * Se una delle due scritture fallisce non esiste né l'una né l'altro.
 */
export async function accoda(
  db: pg.Pool | pg.ClientBase,
  tipo: TipoJob,
  payload: Record<string, unknown> = {},
  opzioni: { tenantId?: string; utenteId?: string } = {},
): Promise<string> {
  const client = 'connect' in db ? await (db as pg.Pool).connect() : (db as pg.ClientBase);
  const daRilasciare = 'connect' in db;
  try {
    await client.query('begin');
    const inserito = await client.query<{ id: string }>(
      `insert into velia.jobs (tipo, payload, tenant_id, utente_id)
       values ($1, $2, $3, $4) returning id`,
      [tipo, payload, opzioni.tenantId ?? null, opzioni.utenteId ?? null],
    );
    const jobId = inserito.rows[0]!.id;
    await client.query('select pgmq.send($1, $2)', [CODA_LAVORI, JSON.stringify({ jobId })]);
    await client.query('commit');
    return jobId;
  } catch (errore) {
    await client.query('rollback').catch(() => undefined);
    throw errore;
  } finally {
    if (daRilasciare) (client as pg.PoolClient).release();
  }
}

/**
 * Pesca il prossimo messaggio, invisibile agli altri consumer per
 * `visibilitaSecondi`: se il worker muore senza confermare, il messaggio
 * ricompare da solo — è il retry di pgmq.
 */
export async function prossimo(
  db: pg.Pool,
  visibilitaSecondi = 60,
): Promise<MessaggioJob | undefined> {
  /* Un messaggio orfano (job cancellato) si archivia e si passa al
     successivo nello stesso giro: un orfano in testa alla coda non deve
     costare un tick di attesa ai job veri dietro di lui. */
  for (let tentativi = 0; tentativi < 20; tentativi++) {
    const letti = await db.query<{
      msg_id: string;
      read_ct: number;
      message: { jobId: string };
    }>('select msg_id, read_ct, message from pgmq.read($1, $2, 1)', [
      CODA_LAVORI,
      visibilitaSecondi,
    ]);
    const messaggio = letti.rows[0];
    if (!messaggio) return undefined;

    const righe = await db.query<Job>('select * from velia.jobs where id = $1', [
      messaggio.message.jobId,
    ]);
    const job = righe.rows[0];
    if (job) return { msgId: Number(messaggio.msg_id), consegne: messaggio.read_ct, job };
    await archivia(db, Number(messaggio.msg_id));
  }
  return undefined;
}

/** Toglie il messaggio dalla coda conservandolo nell'archivio pgmq. */
export async function archivia(db: pg.Pool | pg.ClientBase, msgId: number): Promise<void> {
  await db.query('select pgmq.archive($1, $2::bigint)', [CODA_LAVORI, msgId]);
}

export async function aggiornaStatoJob(
  db: pg.Pool | pg.ClientBase,
  jobId: string,
  stato: Job['stato'],
  campi: { tentativi?: number; errore?: string | null } = {},
): Promise<void> {
  await db.query(
    `update velia.jobs
     set stato = $2,
         tentativi = coalesce($3, tentativi),
         errore = $4
     where id = $1`,
    [jobId, stato, campi.tentativi ?? null, campi.errore ?? null],
  );
}
