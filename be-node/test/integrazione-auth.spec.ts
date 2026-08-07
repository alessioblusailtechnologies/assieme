import { afterAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { EsitoAccesso, Sessione } from '../src/contratto/sessione.js';
import { chiudiPool } from '../src/db/pool.js';

/**
 * Accesso e sessione contro il progetto Supabase VERO: login degli utenti
 * demo (seed di `tools/seed-utenti.mjs`), verifica del token col plugin
 * reale, profilo attraverso la RLS. Si salta senza i puntamenti nel .env.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const EMAIL_ADMIN = 'm.ferrero@assicurazionimeridiana.it';
const PASSWORD_DEMO = 'velia-demo-2026!';

const pronto = Boolean(
  config?.SUPABASE_URL &&
    config.SUPABASE_ANON_KEY &&
    config.SUPABASE_JWT_SECRET &&
    config.DATABASE_URL &&
    !config.DATABASE_URL.includes('PASSWORD_MANCANTE'),
);

describe.skipIf(!pronto)('accesso e sessione col progetto Supabase', () => {
  afterAll(async () => {
    await chiudiPool();
  });

  it('accesso con credenziali demo: token + sessione nella forma del contratto', async () => {
    const app = creaApp({ logger: false });
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    expect(risposta.statusCode).toBe(200);
    const esito = risposta.json<EsitoAccesso>();

    expect(esito.tokenAccesso).toBeTruthy();
    expect(esito.tokenAggiornamento).toBeTruthy();
    expect(esito.scadeInSecondi).toBeGreaterThan(0);

    const { sessione } = esito;
    expect(sessione.utente.email).toBe(EMAIL_ADMIN);
    expect(sessione.utente.nome).toBe('Marta');
    expect(sessione.utente.ruolo).toBe('amministratore');
    expect(sessione.utente.tenantId).toBe(TENANT_DEMO);
    expect(sessione.utente.ultimoAccesso).toBeTruthy();
    expect(sessione.tenant).toMatchObject({
      id: TENANT_DEMO,
      nome: 'Assicurazioni Meridiana S.r.l.',
      piano: 'agenzia',
    });
    // Il vocabolario del tipo Permesso del FE, non quello della fixture v0.8.
    expect(sessione.permessi).toContain('utenti.gestisci');
    expect(sessione.permessi).toContain('riferimenti.gestisci');
    expect(sessione.permessi).not.toContain('knowledge-base.gestisci');
  });

  it('password sbagliata: 401 CREDENZIALI_NON_VALIDE, nessun token', async () => {
    const app = creaApp({ logger: false });
    const risposta = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: 'sbagliata' },
    });
    expect(risposta.statusCode).toBe(401);
    expect(risposta.json<{ codice: string }>().codice).toBe('CREDENZIALI_NON_VALIDE');
  });

  it('GET /api/sessione col token: il profilo torna attraverso la RLS', async () => {
    const app = creaApp({ logger: false });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 'p.ricciardi@assicurazionimeridiana.it', password: PASSWORD_DEMO },
    });
    const { tokenAccesso } = accesso.json<EsitoAccesso>();

    const risposta = await app.inject({
      method: 'GET',
      url: '/api/sessione',
      headers: { authorization: `Bearer ${tokenAccesso}` },
    });
    expect(risposta.statusCode).toBe(200);
    const sessione = risposta.json<Sessione>();
    expect(sessione.utente.ruolo).toBe('operatore');
    expect(sessione.permessi).toEqual([
      'archivio-privato.carica',
      'archivio-privato.elimina',
      'agenti.crea',
    ]);
  });

  it('il refresh ruota i token', async () => {
    const app = creaApp({ logger: false });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    const { tokenAggiornamento } = accesso.json<EsitoAccesso>();

    const risposta = await app.inject({
      method: 'POST',
      url: '/api/sessione/aggiorna',
      payload: { tokenAggiornamento },
    });
    expect(risposta.statusCode).toBe(200);
    const nuovi = risposta.json<{ tokenAccesso: string; tokenAggiornamento: string }>();
    expect(nuovi.tokenAccesso).toBeTruthy();
    expect(nuovi.tokenAggiornamento).not.toBe(tokenAggiornamento);
  });

  it('un token manomesso non passa', async () => {
    const app = creaApp({ logger: false });
    app.get('/api/protetta', () => ({ ok: true }));
    const esito = await app.inject({
      method: 'GET',
      url: '/api/protetta',
      // Firma inventata: la verifica HS256 deve rifiutarla.
      headers: { authorization: `Bearer ${config!.SUPABASE_ANON_KEY.slice(0, -5)}XXXXX` },
    });
    expect(esito.statusCode).toBe(401);
  });
});
