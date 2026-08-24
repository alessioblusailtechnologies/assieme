import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { RiepilogoCrediti } from '../src/contratto/crediti.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { ModelloAI } from '../src/contratto/modelli.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { addebitaCrediti } from '../src/worker/crediti.js';

/**
 * I crediti contro il progetto vero (tenant di collaudo): il saldo dice
 * inclusi e pacchetti, il listino arriva dal db, l'addebito pesa il modello,
 * a credito esaurito la chat risponde 429 CREDITI_ESAURITI, un pacchetto
 * riapre le porte. Nessun job vero: l'addebito si chiama come lo chiama il
 * worker.
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

describe.skipIf(!pronto)('crediti col progetto Supabase', () => {
  const pool = () => poolDb();
  let app: FastifyInstance;
  let token: string;
  let inclusiOriginali: number;
  let convId: string;

  const richiedi = (metodo: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });

  const riepilogo = async (): Promise<RiepilogoCrediti> => (await richiedi('GET', '/api/crediti')).json<RiepilogoCrediti>();

  beforeAll(async () => {
    app = creaApp({ logger: false });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.uno@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;
    expect(token).toBeTruthy();

    const t = await pool().query<{ crediti_inclusi: number }>(`select crediti_inclusi from velia.tenant where id = $1`, [TENANT_COLLAUDO]);
    inclusiOriginali = t.rows[0]!.crediti_inclusi;
    await pool().query(`delete from velia.crediti_movimenti where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    const conv = await richiedi('POST', '/api/conversazioni', {});
    convId = conv.json<{ id: string }>().id;
  }, 60_000);

  afterAll(async () => {
    await pool().query(`update velia.tenant set crediti_inclusi = $2 where id = $1`, [TENANT_COLLAUDO, inclusiOriginali]);
    await pool().query(`delete from velia.crediti_movimenti where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.jobs where tipo = 'interrogazione' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await app.close();
    await chiudiPool();
  });

  it('il saldo parte dagli inclusi del canone, col listino dal db e il catalogo che dice il peso', async () => {
    await pool().query(`update velia.tenant set crediti_inclusi = 600 where id = $1`, [TENANT_COLLAUDO]);
    const r = await riepilogo();
    expect(r.saldo).toEqual({ inclusi: 600, inclusiUsati: 0, acquistati: 0, acquistatiUsati: 0, disponibili: 600 });
    expect(r.pesi).toEqual({ opus: 10, sonnet: 5, haiku: 3, open: 2, conversione: 1, perUsd: 25 });
    expect(r.movimenti).toEqual([]);

    const modelli = (await richiedi('GET', '/api/modelli')).json<ModelloAI[]>();
    expect(modelli.find((m) => m.nome === 'Claude Opus 5')?.creditiPerRisposta).toBe(10);
    expect(modelli.find((m) => m.nome === 'GLM 5.2')?.creditiPerRisposta).toBe(2);
    expect(modelli.find((m) => m.nome === 'GPT-5.2')?.creditiPerRisposta).toBeUndefined();
  });

  it('l’addebito segue il costo della sessione (minimo 1), la conversione è fissa, il mese lo racconta', async () => {
    // Un confronto documentale con Opus (~0,40 $) → 10; un «ciao» (~0,03 $) → 1; open a tariffa (~0,004 $) → 1.
    expect(await addebitaCrediti(pool(), { tenantId: TENANT_COLLAUDO, operazione: 'risposta', modello: 'claude-opus-5', costoUsd: 0.4, descrizione: 'confronto' })).toBe(10);
    expect(await addebitaCrediti(pool(), { tenantId: TENANT_COLLAUDO, operazione: 'risposta', modello: 'claude-opus-5', costoUsd: 0.03, descrizione: 'ciao' })).toBe(1);
    expect(await addebitaCrediti(pool(), { tenantId: TENANT_COLLAUDO, operazione: 'risposta', modello: 'zai-org/GLM-5.2', costoUsd: 0.0037, descrizione: 'open' })).toBe(1);
    expect(await addebitaCrediti(pool(), { tenantId: TENANT_COLLAUDO, operazione: 'tabella', modello: 'claude-sonnet-5', costoUsd: 0.17, descrizione: 'riga' })).toBe(5);
    // Senza costo vale il «tipico» della classe.
    expect(await addebitaCrediti(pool(), { tenantId: TENANT_COLLAUDO, operazione: 'agente', modello: 'claude-sonnet-5', descrizione: 'senza costo' })).toBe(5);
    expect(await addebitaCrediti(pool(), { tenantId: TENANT_COLLAUDO, operazione: 'conversione', descrizione: 'prova conversione' })).toBe(1);

    const r = await riepilogo();
    expect(r.saldo.inclusiUsati).toBe(23);
    expect(r.saldo.disponibili).toBe(577);
    expect(r.meseCorrente).toEqual({ risposta: 12, tabella: 5, agente: 5, conversione: 1 });
    expect(r.movimenti[0]).toMatchObject({ tipo: 'addebito', crediti: -1, operazione: 'conversione' });
    expect(r.movimenti).toHaveLength(6);
  });

  it('oltre gli inclusi si intaccano i pacchetti; senza nulla la chat risponde 429 CREDITI_ESAURITI', async () => {
    await pool().query(`update velia.tenant set crediti_inclusi = 20 where id = $1`, [TENANT_COLLAUDO]);
    // 23 addebitati con 20 inclusi: 3 sono usciti dai pacchetti (che non ci sono) → sotto zero.
    let r = await riepilogo();
    expect(r.saldo).toMatchObject({ inclusi: 20, inclusiUsati: 20, acquistati: 0, acquistatiUsati: 3, disponibili: -3 });

    const negata = await richiedi('POST', `/api/conversazioni/${convId}/messaggi`, { testo: 'Ci sei?', documentiReferenziati: [] });
    expect(negata.statusCode).toBe(429);
    expect(negata.json<CorpoErroreApi>().codice).toBe('CREDITI_ESAURITI');
    expect(negata.json<CorpoErroreApi>().messaggio).toContain('ricarica');

    await pool().query(
      `insert into velia.crediti_movimenti (tenant_id, tipo, crediti, descrizione) values ($1, 'pacchetto', 100, 'Pacchetto di prova')`,
      [TENANT_COLLAUDO],
    );
    r = await riepilogo();
    expect(r.saldo).toMatchObject({ acquistati: 100, acquistatiUsati: 3, disponibili: 97 });
    expect(r.movimenti[0]).toMatchObject({ tipo: 'pacchetto', crediti: 100 });

    /* Con credito la domanda parte: la rotta SSE accoda il job e resta
       aperta finché non lo si lavora — qui basta sapere che non è più 429. */
    const ok = await pool().query<{ disponibili: number }>(`select disponibili from velia.saldo_crediti($1)`, [TENANT_COLLAUDO]);
    expect(ok.rows[0]!.disponibili).toBe(97);
  });
});
