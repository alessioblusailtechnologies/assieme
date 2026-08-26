import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { Ricordo } from '../src/contratto/memoria.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { accoda } from '../src/worker/coda.js';
import { gestori } from '../src/worker/gestori.js';
import type {
  EsitoEstrazione,
  EstrattoreRicordi,
  OpzioniEstrazione,
  ScambioConversazione,
} from '../src/worker/memoria/estrattore.js';
import { creaGestoreMemoria } from '../src/worker/memoria/gestore.js';
import type { CandidatoRicordo } from '../src/worker/memoria/perimetro.js';

/**
 * La memoria per intero contro il progetto vero (tenant di collaudo,
 * estrattore finto): il job accodato a ogni risposta (l'accodamento dal
 * gestore della chat è provato in `integrazione-conversazioni`) che valida
 * (perimetro GDPR, doppioni) e persiste con origine, modello del tenant e
 * consumi; solo gli scambi nuovi al giro dopo; la separazione degli ambiti
 * fatta dal server (RF-G-02); il governo dal pannello (RF-G-03:
 * correzione, sospensione, spostamento, cancellazione effettiva); la
 * retention e l'interruttore.
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
  chiamate: Array<{ scambi: ScambioConversazione[]; giaNoti: string[]; opzioni: OpzioniEstrazione }> = [];
  candidati: CandidatoRicordo[] = [];
  estrai(scambi: ScambioConversazione[], giaNoti: string[], opzioni: OpzioniEstrazione = {}): Promise<EsitoEstrazione> {
    this.chiamate.push({ scambi, giaNoti, opzioni });
    return Promise.resolve({
      candidati: this.candidati,
      modello: opzioni.modello ?? 'claude-sonnet-5',
      token: { input: 100, output: 20, cacheLettura: 0, cacheScrittura: 0 },
      costoUsd: 0.002,
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
  let modelloOriginale: string | null;

  const richiedi = (metodo: 'GET' | 'PATCH' | 'DELETE', url: string, token: string, payload?: Record<string, unknown>) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });

  const elenco = async (token: string): Promise<Ricordo[]> => (await richiedi('GET', '/api/ricordi', token)).json<Ricordo[]>();

  async function lavoraTutto(): Promise<void> {
    while (await lavoraUno(pool(), { visibilitaSecondi: 30 })) {
      /* ancora */
    }
  }

  /** Ciò che fa il gestore della chat a ogni risposta. */
  const accodaMemoria = (): Promise<string> =>
    accoda(pool(), 'memoria', { conversazioneId: convId }, { tenantId: TENANT_COLLAUDO, utenteId: idAdmin });

  async function messaggio(autore: 'utente' | 'assistente', testo: string): Promise<void> {
    await pool().query(
      `insert into velia.messaggi (conversazione_id, tenant_id, autore, utente_id, testo)
       values ($1, $2, $3, $4, $5)`,
      [convId, TENANT_COLLAUDO, autore, idAdmin, testo],
    );
  }

  async function statoJob(jobId: string): Promise<string> {
    const r = await pool().query<{ stato: string }>(`select stato from velia.jobs where id = $1`, [jobId]);
    return r.rows[0]!.stato;
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

    /* Un worker dev acceso o un'altra suite possono lasciare job di altri
       tenant in coda: `lavoraTutto` li pescherebbe con l'estrattore finto.
       Quelli si lasciano stare. */
    const gestoreVero = creaGestoreMemoria({ estrattore });
    gestori.memoria = async (job, strumenti) => {
      if (job.tenant_id !== TENANT_COLLAUDO) return;
      await gestoreVero(job, strumenti);
    };

    const t = await pool().query<{ modello_motore: string | null }>(
      `select modello_motore from velia.tenant where id = $1`,
      [TENANT_COLLAUDO],
    );
    modelloOriginale = t.rows[0]!.modello_motore;
    await pool().query(
      `update velia.tenant set memoria_attiva = true, memoria_retention_giorni = null, modello_motore = 'claude-sonnet-5' where id = $1`,
      [TENANT_COLLAUDO],
    );

    const conv = await pool().query<{ id: string }>(
      `insert into velia.conversazioni (tenant_id, autore_id, titolo) values ($1, $2, 'Flotta Bianchi') returning id`,
      [TENANT_COLLAUDO, idAdmin],
    );
    convId = conv.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await pool().query(
      `update velia.tenant set memoria_attiva = true, memoria_retention_giorni = null, modello_motore = $2 where id = $1`,
      [TENANT_COLLAUDO, modelloOriginale],
    );
    await pulizia();
    await app.close();
    await chiudiPool();
  });

  it('senza una risposta dell’assistente il job si chiude senza chiamare il motore', async () => {
    await messaggio('utente', 'Come gestiamo le franchigie per le flotte?');
    const jobId = await accodaMemoria();
    await lavoraTutto();
    expect(await statoJob(jobId)).toBe('completato');
    expect(estrattore.chiamate).toHaveLength(0);
  });

  it('a risposta data il job impara col modello del tenant, applicando il perimetro e scartando i doppioni', async () => {
    await messaggio('assistente', 'Per le flotte la vostra agenzia privilegia le franchigie fisse.');
    estrattore.candidati = [
      { testo: 'Per le flotte l’agenzia privilegia le franchigie fisse rispetto agli scoperti percentuali.', categoria: 'prassi', ambito: 'tenant' },
      { testo: 'Il titolare della ditta Bianchi è malato di cuore e non guida più.', categoria: 'cliente', ambito: 'tenant' },
      { testo: 'Vuole i riepiloghi con una tabella breve e la sintesi in testa.', categoria: 'preferenza', ambito: 'tenant' },
      { testo: 'per le flotte l’agenzia privilegia le franchigie fisse rispetto agli scoperti percentuali.', categoria: 'prassi', ambito: 'tenant' },
    ];
    const jobId = await accodaMemoria();
    await lavoraTutto();
    expect(await statoJob(jobId)).toBe('completato');

    const eventi = await pool().query<{ tipo: string; dati: { motivo?: string; appresi?: number } }>(
      `select tipo, dati from velia.eventi_job where job_id = $1 order by id`,
      [jobId],
    );
    const scarti = eventi.rows.filter((e) => e.tipo === 'candidato-scartato').map((e) => e.dati.motivo);
    expect(scarti).toHaveLength(2);
    expect(scarti[0]).toContain('art. 9');
    expect(scarti[1]).toBe('già noto');
    expect(eventi.rows.find((e) => e.tipo === 'fine')?.dati.appresi).toBe(2);

    // Il modello è quello dell'estrattore (MODELLO_MEMORIA), non quello del tenant.
    expect(estrattore.chiamate.at(-1)?.opzioni.modello).toBeUndefined();
    expect(estrattore.chiamate.at(-1)?.scambi.map((s) => s.autore)).toEqual(['utente', 'assistente']);

    const perAdmin = await elenco(tokenAdmin);
    expect(perAdmin).toHaveLength(2);
    expect(perAdmin.every((r) => r.origineConversazioneId === convId && r.attivo)).toBe(true);
    expect(perAdmin.find((r) => r.categoria === 'preferenza')?.ambito).toBe('personale');
    expect(perAdmin.find((r) => r.categoria === 'prassi')?.ambito).toBe('tenant');
    // Il testo vietato non è finito da nessuna parte.
    const tutti = await pool().query<{ testo: string }>(`select testo from velia.ricordi where tenant_id = $1`, [TENANT_COLLAUDO]);
    expect(tutti.rows.some((r) => r.testo.includes('malato'))).toBe(false);

    const consumi = await pool().query(`select 1 from velia.consumi where job_id = $1 and modello = 'claude-sonnet-5'`, [jobId]);
    expect(consumi.rowCount).toBe(1);
  });

  it('un secondo giro senza scambi nuovi non chiama il motore; con scambi nuovi riceve solo quelli e i ricordi noti', async () => {
    const chiamatePrima = estrattore.chiamate.length;
    const ripetuto = await accodaMemoria();
    await lavoraTutto();
    expect(await statoJob(ripetuto)).toBe('completato');
    expect(estrattore.chiamate).toHaveLength(chiamatePrima);

    await messaggio('utente', 'E la ditta Bianchi?');
    await messaggio('assistente', 'La ditta Bianchi rinnova a dicembre.');
    estrattore.candidati = [
      { testo: 'La ditta Bianchi rinnova sempre a dicembre e chiede il riepilogo entro fine novembre.', categoria: 'cliente', ambito: 'tenant' },
    ];
    await accodaMemoria();
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
    const chiamatePrima = estrattore.chiamate.length;
    const jobId = await accodaMemoria();
    await lavoraTutto();
    expect(await statoJob(jobId)).toBe('completato');
    expect(estrattore.chiamate).toHaveLength(chiamatePrima);
    await pool().query(`update velia.tenant set memoria_attiva = true where id = $1`, [TENANT_COLLAUDO]);
  });
});
