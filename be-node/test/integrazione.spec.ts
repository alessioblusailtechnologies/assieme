import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configurazione, type Configurazione } from '../src/config.js';
import { conIdentita } from '../src/db/identita.js';
import { chiudiPool, creaClientDedicato, poolDb } from '../src/db/pool.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { accoda, type Job } from '../src/worker/coda.js';
import { ascoltaEventi, type PuntatoreEvento } from '../src/worker/eventi.js';

/**
 * Questi test parlano col database vero (il progetto Supabase del .env, o
 * lo stack effimero in CI). Senza configurazione si saltano: il resto della
 * suite resta eseguibile ovunque.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

/** Serve la connessione Postgres vera, con la password compilata. */
const dbPronto = Boolean(config?.DATABASE_URL && !config.DATABASE_URL.includes('PASSWORD_MANCANTE'));

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!dbPronto)('integrazione col database', () => {
  const pool = () => poolDb();
  const creati: { tenantA?: string; tenantB?: string } = {};

  beforeAll(async () => {
    const righe = await pool().query<{ id: string }>(
      `insert into velia.tenant (nome) values ('Tenant A (test)'), ('Tenant B (test)') returning id`,
    );
    creati.tenantA = righe.rows[0]!.id;
    creati.tenantB = righe.rows[1]!.id;
  });

  afterAll(async () => {
    await pool().query(`delete from velia.jobs where tipo = 'prova'`);
    // Solo i tenant creati QUI: una pulizia per nome ('%(test)') si era
    // portata via il tenant di collaudo, utenti compresi (24/08).
    await pool().query(`delete from velia.tenant where id = any($1)`, [
      [creati.tenantA, creati.tenantB].filter(Boolean),
    ]);
    await chiudiPool();
  });

  // -------------------------------------------------------------------------
  // RLS: RF-B-01 dimostrato, non promesso
  // -------------------------------------------------------------------------

  it('un utente del tenant A vede solo il tenant A', async () => {
    const visibili = await conIdentita(
      pool(),
      { utenteId: crypto.randomUUID(), tenantId: creati.tenantA!, ruolo: 'operatore' },
      async (client) => {
        const r = await client.query<{ id: string }>('select id from velia.tenant');
        return r.rows.map((riga) => riga.id);
      },
    );
    expect(visibili).toContain(creati.tenantA);
    expect(visibili).not.toContain(creati.tenantB);
  });

  it('con identità utente le scritture su tenant non toccano alcuna riga', async () => {
    // Senza policy di scrittura la RLS non lancia un errore: filtra. Un
    // UPDATE da authenticated deve toccare zero righe, anche sul proprio
    // tenant — verificato anche sul progetto online via Management API.
    const esito = await conIdentita(
      pool(),
      { utenteId: crypto.randomUUID(), tenantId: creati.tenantA!, ruolo: 'amministratore' },
      (client) =>
        client.query(`update velia.tenant set nome = 'violazione' where id = $1 returning id`, [
          creati.tenantA,
        ]),
    );
    expect(esito.rowCount).toBe(0);

    // E il nome, riletto dal sistema, è rimasto quello vero.
    const riga = await pool().query<{ nome: string }>(
      'select nome from velia.tenant where id = $1',
      [creati.tenantA],
    );
    expect(riga.rows[0]!.nome).toBe('Tenant A (test)');
  });

  it('i job non sono leggibili con identità utente (RLS senza policy)', async () => {
    const righe = await conIdentita(
      pool(),
      { utenteId: crypto.randomUUID(), tenantId: creati.tenantA!, ruolo: 'amministratore' },
      async (client) => (await client.query<Record<string, unknown>>('select * from velia.jobs')).rows,
    );
    expect(righe).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Coda: accoda → worker → eventi → LISTEN, il giro completo
  // -------------------------------------------------------------------------

  it('un job di prova percorre coda, worker, eventi e NOTIFY', async () => {
    const ricevuti: PuntatoreEvento[] = [];
    const ferma = await ascoltaEventi(creaClientDedicato, (p) => ricevuti.push(p));

    try {
      const jobId = await accoda(pool(), 'prova', { passi: 2 }, { tenantId: creati.tenantA! });

      let lavorato = false;
      for (let i = 0; i < 10 && !lavorato; i++) {
        lavorato = await lavoraUno(pool(), { visibilitaSecondi: 30 });
        if (!lavorato) await attendi(200);
      }
      expect(lavorato).toBe(true);

      const job = (
        await pool().query<Job>('select * from velia.jobs where id = $1', [jobId])
      ).rows[0]!;
      expect(job.stato).toBe('completato');

      const eventi = await pool().query<{ tipo: string }>(
        'select tipo from velia.eventi_job where job_id = $1 order by id',
        [jobId],
      );
      expect(eventi.rows.map((e) => e.tipo)).toEqual([
        'inizio',
        'avanzamento',
        'avanzamento',
        'fine',
      ]);

      // La spinta in tempo reale: i puntatori arrivano al LISTEN.
      for (let i = 0; i < 25 && ricevuti.filter((p) => p.jobId === jobId).length < 4; i++) {
        await attendi(200);
      }
      const tipiRicevuti = ricevuti.filter((p) => p.jobId === jobId).map((p) => p.tipo);
      expect(tipiRicevuti).toEqual(['inizio', 'avanzamento', 'avanzamento', 'fine']);
    } finally {
      await ferma();
    }
  });

  it('un job che fallisce sempre diventa `fallito` dopo i tentativi massimi', async () => {
    const jobId = await accoda(
      pool(),
      'prova',
      { fallisci: true },
      { tenantId: creati.tenantA! },
    );

    // visibilità 1s: il messaggio ricompare in fretta per il tentativo dopo.
    let stato = '';
    for (let i = 0; i < 30 && stato !== 'fallito'; i++) {
      await lavoraUno(pool(), { visibilitaSecondi: 1, tentativiMassimi: 2 });
      stato = (
        await pool().query<{ stato: string }>('select stato from velia.jobs where id = $1', [jobId])
      ).rows[0]!.stato;
      if (stato !== 'fallito') await attendi(400);
    }

    const job = (
      await pool().query<Job>('select * from velia.jobs where id = $1', [jobId])
    ).rows[0]!;
    expect(job.stato).toBe('fallito');
    expect(job.tentativi).toBe(2);
    expect(job.errore).toContain('fallimento richiesto');

    // Il retry è raccontato: l'evento `nuovo-tentativo` sta nel canale.
    const eventi = await pool().query<{ tipo: string }>(
      'select tipo from velia.eventi_job where job_id = $1 order by id',
      [jobId],
    );
    expect(eventi.rows.map((e) => e.tipo)).toContain('nuovo-tentativo');
    expect(eventi.rows.map((e) => e.tipo)).toContain('errore');
  });
});
