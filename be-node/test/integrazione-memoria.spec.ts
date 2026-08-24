import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { Ricordo } from '../src/contratto/memoria.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { gestori } from '../src/worker/gestori.js';
import type { EsitoEstrazione, EstrattoreRicordi, ScambioConversazione } from '../src/worker/memoria/estrattore.js';
import { creaGestoreMemoria } from '../src/worker/memoria/gestore.js';
import type { CandidatoRicordo } from '../src/worker/memoria/perimetro.js';

/**
 * La memoria per intero contro il progetto vero (tenant di collaudo,
 * estrattore finto): il tick che accoda solo le conversazioni concluse con
 * risposte non ancora apprese, il job che valida (perimetro GDPR, doppioni)
 * e persiste con origine e consumi, la separazione degli ambiti fatta dal
 * server (RF-G-02), il governo dal pannello (RF-G-03: correzione,
 * sospensione, spostamento, cancellazione effettiva), la retention.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const pronto = Boolean(
  config?.SUPABASE_JWT_SECRET &&
    config.DATABASE_URL &&
    !config.DATABASE_URL.includes('PASSWORD_MANCANTE'),
);

const PASSWORD_DEMO = 'velia-demo-2026!';
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';

class EstrattoreFinto implements EstrattoreRicordi {
  chiamate: Array<{ scambi: ScambioConversazione[]; giaNoti: string[] }> = [];
  candidati: CandidatoRicordo[] = [];
  estrai(scambi: ScambioConversazione[], giaNoti: string[]): Promise<EsitoEstrazione> {
    this.chiamate.push({ scambi, giaNoti });
    return Promise.resolve({
      candidati: this.candidati,
      modello: 'finto',
      token: { input: 100, output: 20 },
      costoUsd: 0.0002,
    });
  }
}

describe.skipIf(!pronto)('memoria col progetto Supabase (estrattore finto)', () => {
  const pool = () => poolDb();
  const estrattore = new EstrattoreFinto();
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenOperatore: string;
  let idAdmin: string;
  let convId: string;
  let attesaOriginale: number;

  const richiedi = (metodo: 'GET' | 'PATCH' | 'DELETE', url: string, token: string, payload?: Record<string, unknown>) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });

  const elenco = async (token: string): Promise<Ricordo[]> => (await richiedi('GET', '/api/ricordi', token)).json<Ricordo[]>();

  async function lavoraTutto(): Promise<void> {
    while (await lavoraUno(pool(), { visibilitaSecondi: 30 })) {
      /* ancora */
    }
  }

  /** Il tick è globale (accoda anche le conversazioni ferme degli altri tenant): si contano i job della nostra. */
  async function accodaTick(): Promise<number> {
    const conteggio = async (): Promise<number> => {
      const r = await pool().query<{ n: string }>(
        `select count(*) as n from velia.jobs where tipo = 'memoria' and payload->>'conversazioneId' = $1`,
        [convId],
      );
      return Number(r.rows[0]!.n);
    };
    const prima = await conteggio();
    await pool().query(`select velia.accoda_apprendimento()`);
    return (await conteggio()) - prima;
  }

  async function messaggio(autore: 'utente' | 'assistente', testo: string): Promise<void> {
    await pool().query(
      `insert into velia.messaggi (conversazione_id, tenant_id, autore, utente_id, testo)
       values ($1, $2, $3, $4, $5)`,
      [convId, TENANT_COLLAUDO, autore, idAdmin, testo],
    );
  }

  /** «Ferma da dieci minuti»: i messaggi si retrodatano, il tick guarda loro. */
  async function retrodata(): Promise<void> {
    await pool().query(`update velia.messaggi set inviato_il = inviato_il - interval '10 minutes' where conversazione_id = $1 and inviato_il > now() - interval '5 minutes'`, [convId]);
  }

  const pulizia = async (): Promise<void> => {
    await pool().query(`delete from velia.ricordi where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.jobs where tipo = 'memoria' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.consumi where tenant_id = $1`, [TENANT_COLLAUDO]);
  };

  beforeAll(async () => {
    app = creaApp({ logger: false });
    await pulizia();

    const admin = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.uno@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    tokenAdmin = admin.json<EsitoAccesso>().tokenAccesso;
    idAdmin = admin.json<EsitoAccesso>().sessione.utente.id;
    const operatore = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.due@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    tokenOperatore = operatore.json<EsitoAccesso>().tokenAccesso;
    expect(tokenAdmin).toBeTruthy();
    expect(tokenOperatore).toBeTruthy();

    /* Il cron accoda anche le conversazioni ferme degli ALTRI tenant, e
       `lavoraTutto` le pescherebbe con l'estrattore finto: quelle si lasciano
       stare (il tick le riaccoderà domani per il worker vero). */
    const gestoreVero = creaGestoreMemoria({ estrattore });
    gestori.memoria = async (job, strumenti) => {
      if (job.tenant_id !== TENANT_COLLAUDO) return;
      await gestoreVero(job, strumenti);
    };

    const t = await pool().query<{ memoria_attesa_minuti: number }>(
      `select memoria_attesa_minuti from velia.tenant where id = $1`,
      [TENANT_COLLAUDO],
    );
    attesaOriginale = t.rows[0]!.memoria_attesa_minuti;
    /* Nei test la «fine conversazione» arriva subito: un minuto di attesa,
       e i messaggi si retrodatano a mano. */
    await pool().query(`update velia.tenant set memoria_attiva = true, memoria_retention_giorni = null, memoria_attesa_minuti = 1 where id = $1`, [TENANT_COLLAUDO]);

    const conv = await pool().query<{ id: string }>(
      `insert into velia.conversazioni (tenant_id, autore_id, titolo) values ($1, $2, 'Flotta Bianchi') returning id`,
      [TENANT_COLLAUDO, idAdmin],
    );
    convId = conv.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await pool().query(`update velia.tenant set memoria_attesa_minuti = $2, memoria_retention_giorni = null where id = $1`, [TENANT_COLLAUDO, attesaOriginale]);
    await pulizia();
    await app.close();
    await chiudiPool();
  });

  it('il tick ignora una conversazione ancora viva o senza risposte', async () => {
    await messaggio('utente', 'Come gestiamo le franchigie per le flotte?');
    expect(await accodaTick()).toBe(0);

    await messaggio('assistente', 'Per le flotte la vostra agenzia privilegia le franchigie fisse.');
    // Appena risposto: non è ancora «conclusa».
    expect(await accodaTick()).toBe(0);
  });

  it('conclusa, il tick la accoda una volta sola e il job impara applicando il perimetro', async () => {
    await retrodata();
    expect(await accodaTick()).toBe(1);
    expect(await accodaTick()).toBe(0); // già accodata

    estrattore.candidati = [
      { testo: 'Per le flotte l’agenzia privilegia le franchigie fisse rispetto agli scoperti percentuali.', categoria: 'prassi', ambito: 'tenant' },
      { testo: 'Il titolare della ditta Bianchi è malato di cuore e non guida più.', categoria: 'cliente', ambito: 'tenant' },
      { testo: 'Vuole i riepiloghi con una tabella breve e la sintesi in testa.', categoria: 'preferenza', ambito: 'tenant' },
      { testo: 'per le flotte l’agenzia privilegia le franchigie fisse rispetto agli scoperti percentuali.', categoria: 'prassi', ambito: 'tenant' },
    ];
    await lavoraTutto();

    const job = await pool().query<{ stato: string; id: string }>(
      `select id, stato from velia.jobs where tipo = 'memoria' and payload->>'conversazioneId' = $1 order by created_at desc limit 1`,
      [convId],
    );
    expect(job.rows[0]!.stato).toBe('completato');
    const eventi = await pool().query<{ tipo: string; dati: { motivo?: string; appresi?: number } }>(
      `select tipo, dati from velia.eventi_job where job_id = $1 order by id`,
      [job.rows[0]!.id],
    );
    const scarti = eventi.rows.filter((e) => e.tipo === 'candidato-scartato').map((e) => e.dati.motivo);
    expect(scarti).toEqual([expect.stringContaining('art. 9'), 'già noto']);
    expect(eventi.rows.find((e) => e.tipo === 'fine')?.dati.appresi).toBe(2);

    const perAdmin = await elenco(tokenAdmin);
    expect(perAdmin).toHaveLength(2);
    expect(perAdmin.every((r) => r.origineConversazioneId === convId && r.attivo)).toBe(true);
    expect(perAdmin.find((r) => r.categoria === 'preferenza')?.ambito).toBe('personale');
    expect(perAdmin.find((r) => r.categoria === 'prassi')?.ambito).toBe('tenant');
    // Il testo vietato non è finito da nessuna parte.
    const tutti = await pool().query<{ testo: string }>(`select testo from velia.ricordi where tenant_id = $1`, [TENANT_COLLAUDO]);
    expect(tutti.rows.some((r) => r.testo.includes('malato'))).toBe(false);

    const consumi = await pool().query(`select 1 from velia.consumi where job_id = $1 and modello = 'finto'`, [job.rows[0]!.id]);
    expect(consumi.rowCount).toBe(1);
    expect(estrattore.chiamate.at(-1)?.scambi.map((s) => s.autore)).toEqual(['utente', 'assistente']);
  });

  it('gli scambi già appresi non tornano al modello; con scambi nuovi i noti gli si elencano', async () => {
    const stato = await pool().query<{ appresa_fino_a: Date | null; accodato_il: Date | null }>(
      `select appresa_fino_a, accodato_il from velia.apprendimenti where conversazione_id = $1`,
      [convId],
    );
    expect(stato.rows[0]!.appresa_fino_a).not.toBeNull();
    expect(stato.rows[0]!.accodato_il).toBeNull();
    await retrodata();
    expect(await accodaTick()).toBe(0);

    await messaggio('utente', 'E la ditta Bianchi?');
    await messaggio('assistente', 'La ditta Bianchi rinnova a dicembre.');
    await retrodata();
    expect(await accodaTick()).toBe(1);
    estrattore.candidati = [
      { testo: 'La ditta Bianchi rinnova sempre a dicembre e chiede il riepilogo entro fine novembre.', categoria: 'cliente', ambito: 'tenant' },
    ];
    await lavoraTutto();
    const ultima = estrattore.chiamate.at(-1)!;
    expect(ultima.scambi.map((s) => s.testo)).toEqual(['E la ditta Bianchi?', 'La ditta Bianchi rinnova a dicembre.']);
    expect(ultima.giaNoti).toHaveLength(2);
    expect(await elenco(tokenAdmin)).toHaveLength(3);
  });

  it('RF-G-02: il collega vede i ricordi del tenant, mai i personali altrui', async () => {
    const perOperatore = await elenco(tokenOperatore);
    expect(perOperatore.map((r) => r.ambito)).toEqual(['tenant', 'tenant']);
    const personale = (await elenco(tokenAdmin)).find((r) => r.ambito === 'personale')!;
    const tentativo = await richiedi('PATCH', `/api/ricordi/${personale.id}`, tokenOperatore, { attivo: false });
    expect(tentativo.statusCode).toBe(404);
    expect(tentativo.json<CorpoErroreApi>().codice).toBe('NON_TROVATO');
  });

  it('RF-G-03: correzione, categoria, sospensione, spostamento personale⇄tenant', async () => {
    const personale = (await elenco(tokenAdmin)).find((r) => r.ambito === 'personale')!;

    const corretto = await richiedi('PATCH', `/api/ricordi/${personale.id}`, tokenAdmin, {
      testo: 'Vuole i riepiloghi con una tabella breve, la sintesi in testa e niente premesse.',
      categoria: 'altro',
      attivo: false,
    });
    expect(corretto.statusCode).toBe(200);
    expect(corretto.json<Ricordo>()).toMatchObject({ categoria: 'altro', attivo: false, ambito: 'personale' });
    expect(corretto.json<Ricordo>().testo).toContain('niente premesse');

    // Condiviso: ora lo vede anche il collega…
    const condiviso = await richiedi('PATCH', `/api/ricordi/${personale.id}`, tokenAdmin, { ambito: 'tenant' });
    expect(condiviso.json<Ricordo>().ambito).toBe('tenant');
    expect((await elenco(tokenOperatore)).map((r) => r.id)).toContain(personale.id);

    // …che se lo prende: diventa suo, e l’admin non lo vede più.
    const preso = await richiedi('PATCH', `/api/ricordi/${personale.id}`, tokenOperatore, { ambito: 'personale' });
    expect(preso.statusCode).toBe(200);
    expect((await elenco(tokenAdmin)).map((r) => r.id)).not.toContain(personale.id);
    const proprietario = await pool().query<{ utente_id: string }>(`select utente_id from velia.ricordi where id = $1`, [personale.id]);
    expect(proprietario.rows[0]!.utente_id).not.toBe(idAdmin);
  });

  it('la cancellazione è effettiva e i ricordi sospesi restano fuori dal DNA', async () => {
    const prassi = (await elenco(tokenAdmin)).find((r) => r.categoria === 'prassi')!;
    await richiedi('PATCH', `/api/ricordi/${prassi.id}`, tokenAdmin, { attivo: false });
    const attivi = await pool().query(`select 1 from velia.ricordi where id = $1 and attivo`, [prassi.id]);
    expect(attivi.rowCount).toBe(0);

    const cancellato = await richiedi('DELETE', `/api/ricordi/${prassi.id}`, tokenAdmin);
    expect(cancellato.statusCode).toBe(204);
    const resta = await pool().query(`select 1 from velia.ricordi where id = $1`, [prassi.id]);
    expect(resta.rowCount).toBe(0);
    expect((await richiedi('DELETE', `/api/ricordi/${prassi.id}`, tokenAdmin)).statusCode).toBe(404);
  });

  it('la retention cancella davvero, e la memoria spenta non impara', async () => {
    await pool().query(`update velia.tenant set memoria_retention_giorni = 30 where id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`update velia.ricordi set updated_at = now() - interval '31 days' where tenant_id = $1 and categoria = 'cliente'`, [TENANT_COLLAUDO]);
    const scaduti = await pool().query<{ n: number }>(`select velia.scada_ricordi() as n`);
    expect(Number(scaduti.rows[0]!.n)).toBe(1);
    await pool().query(`update velia.tenant set memoria_retention_giorni = null where id = $1`, [TENANT_COLLAUDO]);

    await pool().query(`update velia.tenant set memoria_attiva = false where id = $1`, [TENANT_COLLAUDO]);
    await messaggio('utente', 'Altro?');
    await messaggio('assistente', 'Altro.');
    await retrodata();
    expect(await accodaTick()).toBe(0);
    await pool().query(`update velia.tenant set memoria_attiva = true where id = $1`, [TENANT_COLLAUDO]);
  });
});
