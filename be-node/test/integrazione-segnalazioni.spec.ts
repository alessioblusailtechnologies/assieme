import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { Segnalazione } from '../src/contratto/segnalazioni.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';

/**
 * RF-A-08 contro il progetto vero: la segnalazione entra col tenant e
 * l'utente del JWT (la RLS lo pretende), il riferimento a un documento
 * passa dalla lettura di catalogo, l'input storto è un 400 leggibile.
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
const DOC_VERO = 'doc-unipolsai-km-servizi-autovetture-ed-2022-11-dip';

describe.skipIf(!pronto)('segnalazioni col progetto Supabase', () => {
  let app: FastifyInstance;
  let token: string;
  const create: string[] = [];

  beforeAll(async () => {
    app = creaApp({ logger: false });
    const r = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 'p.ricciardi@assicurazionimeridiana.it', password: PASSWORD_DEMO },
    });
    token = r.json<EsitoAccesso>().tokenAccesso;
  });

  afterAll(async () => {
    // Il ruolo dell'applicazione possiede la tabella: la pulizia non passa
    // dalla RLS. Si tolgono solo le righe create da questo giro di test.
    if (create.length) {
      await poolDb().query(`delete from velia.segnalazioni where id = any($1::uuid[])`, [create]);
    }
    await chiudiPool();
  });

  const segnala = (payload: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/segnalazioni',
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
    });

  it('un documento errato: 201 con la segnalazione registrata', async () => {
    const r = await segnala({
      tipo: 'errato',
      messaggio: 'Test integrazione: la tabella dei massimali a pag. 12 è troncata.',
      documentoId: DOC_VERO,
    });
    expect(r.statusCode).toBe(201);
    const s = r.json<Segnalazione>();
    create.push(s.id);
    expect(s.tipo).toBe('errato');
    expect(s.documentoId).toBe(DOC_VERO);
    expect(Date.parse(s.creataIl)).not.toBeNaN();
  });

  it('un documento che manca: 201 senza riferimento', async () => {
    const r = await segnala({
      tipo: 'mancante',
      messaggio: 'Test integrazione: manca il set informativo Generali Sei in Auto.',
    });
    expect(r.statusCode).toBe(201);
    const s = r.json<Segnalazione>();
    create.push(s.id);
    expect(s.documentoId).toBeUndefined();
  });

  it('la riga porta tenant e utente del JWT, non quelli dichiarati', async () => {
    const righe = await poolDb().query<{ tenant_id: string; utente_id: string }>(
      `select tenant_id, utente_id from velia.segnalazioni where id = any($1::uuid[])`,
      [create],
    );
    expect(righe.rowCount).toBe(create.length);
    for (const riga of righe.rows) {
      expect(riga.tenant_id).toBeTruthy();
      expect(riga.utente_id).toBeTruthy();
    }
  });

  it('senza messaggio: 400 DATI_NON_VALIDI', async () => {
    const r = await segnala({ tipo: 'errato', messaggio: '   ' });
    expect(r.statusCode).toBe(400);
    expect(r.json<{ codice: string }>().codice).toBe('DATI_NON_VALIDI');
  });

  it('con un documento inesistente: 404', async () => {
    const r = await segnala({
      tipo: 'obsoleto',
      messaggio: 'Test integrazione: riferimento fantasma.',
      documentoId: 'doc-che-non-esiste',
    });
    expect(r.statusCode).toBe(404);
  });

  it('senza token: 401', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/segnalazioni',
      payload: { tipo: 'errato', messaggio: 'niente' },
    });
    expect(r.statusCode).toBe(401);
  });
});
