import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { ModelloAI } from '../src/contratto/modelli.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';

/**
 * Il pezzo di RF-D-02 che tocca il database: confermare il modello attivo
 * lascia la voce «chi, cosa, quando» nello storico delle impostazioni
 * (oggetto `modello`), sul tenant di collaudo.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

/* Si sceglie Avanzato, che si può scegliere solo con la chiave DeepSeek:
   senza, la PUT risponderebbe 409 e il test non proverebbe la scrittura. */
const pronto = Boolean(
  config?.SUPABASE_JWT_SECRET &&
    config.DATABASE_URL &&
    !config.DATABASE_URL.includes('PASSWORD_MANCANTE') &&
    config.DEEPSEEK_API_KEY,
);

const PASSWORD_DEMO = 'velia-demo-2026!';
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';

describe.skipIf(!pronto)('scelta del modello col progetto Supabase', () => {
  let app: FastifyInstance;
  let tokenAdmin: string;

  const pulizia = async (): Promise<void> => {
    await poolDb().query(
      `delete from velia.impostazioni_storico where tenant_id = $1 and oggetto = 'modello'`,
      [TENANT_COLLAUDO],
    );
    await poolDb().query(`update velia.tenant set modello_motore = null where id = $1`, [TENANT_COLLAUDO]);
  };

  beforeAll(async () => {
    app = creaApp({ logger: false });
    await pulizia();
    const r = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.uno@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    tokenAdmin = r.json<EsitoAccesso>().tokenAccesso;
    expect(tokenAdmin).toBeTruthy();
  }, 60_000);

  afterAll(async () => {
    await pulizia();
    await app.close();
    await chiudiPool();
  });

  it('la scelta è reale: si scrive sul tenant, l’attivo la riflette, lo storico la racconta', async () => {
    const senzaScelta = await app.inject({
      method: 'GET',
      url: '/api/modelli/attivo',
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(senzaScelta.json<ModelloAI>().nome).toBe('Boost'); // il default di piattaforma

    const r = await app.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { modelloId: 'livello-avanzato' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json<ModelloAI>()).toMatchObject({ nome: 'Avanzato', disponibile: true });

    const tenant = await poolDb().query<{ modello_motore: string | null }>(
      `select modello_motore from velia.tenant where id = $1`,
      [TENANT_COLLAUDO],
    );
    /* Sul tenant va il modello, non il livello: è ciò che il worker leggerà a ogni job. */
    expect(tenant.rows[0]!.modello_motore).toBe('deepseek-flash');

    const attivo = await app.inject({
      method: 'GET',
      url: '/api/modelli/attivo',
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(attivo.json<ModelloAI>().nome).toBe('Avanzato');

    const voci = await poolDb().query<{ azione: string; descrizione: string }>(
      `select azione, descrizione from velia.impostazioni_storico
       where tenant_id = $1 and oggetto = 'modello'`,
      [TENANT_COLLAUDO],
    );
    expect(voci.rows).toEqual([{ azione: 'modifica', descrizione: 'Scelto il livello Avanzato' }]);
  });
});
