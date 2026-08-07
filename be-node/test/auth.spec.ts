import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { richiediAmministratore } from '../src/api/plugins/auth.js';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';

function verificatore(ruolo: 'operatore' | 'amministratore'): NonNullable<OpzioniApp['verificaToken']> {
  return () =>
    Promise.resolve({
      sub: 'utn-prova',
      app_metadata: { tenant_id: TENANT_A, ruolo },
    });
}

describe('autenticazione', () => {
  it('senza token: 401, tranne la sonda di vita', async () => {
    const app = creaApp({ logger: false, verificaToken: verificatore('operatore') });
    app.get('/api/protetta', () => ({ ok: true }));

    const salute = await app.inject({ method: 'GET', url: '/api/salute' });
    expect(salute.statusCode).toBe(200);

    const protetta = await app.inject({ method: 'GET', url: '/api/protetta' });
    expect(protetta.statusCode).toBe(401);
    expect(protetta.json<{ codice: string }>().codice).toBe('NON_AUTENTICATO');
  });

  it('un token che non verifica: 401', async () => {
    const app = creaApp({
      logger: false,
      verificaToken: () => Promise.reject(new Error('firma non valida')),
    });
    app.get('/api/protetta', () => ({ ok: true }));
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/protetta',
      headers: { authorization: 'Bearer token-scaduto' },
    });
    expect(risposta.statusCode).toBe(401);
  });

  it('un token valido ma senza tenant o ruolo: 403', async () => {
    const app = creaApp({
      logger: false,
      verificaToken: () => Promise.resolve({ sub: 'utn-prova', app_metadata: {} }),
    });
    app.get('/api/protetta', () => ({ ok: true }));
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/protetta',
      headers: { authorization: 'Bearer token-senza-metadata' },
    });
    expect(risposta.statusCode).toBe(403);
  });

  it("l'identità arriva alla rotta", async () => {
    const app = creaApp({ logger: false, verificaToken: verificatore('operatore') });
    app.get('/api/chi-sono', (richiesta) => richiesta.identita);
    const risposta = await app.inject({
      method: 'GET',
      url: '/api/chi-sono',
      headers: { authorization: 'Bearer token' },
    });
    expect(risposta.json()).toEqual({
      utenteId: 'utn-prova',
      tenantId: TENANT_A,
      ruolo: 'operatore',
    });
  });

  it("richiediAmministratore: 403 per l'operatore, passa per l'amministratore", async () => {
    for (const [ruolo, statoAtteso] of [
      ['operatore', 403],
      ['amministratore', 200],
    ] as const) {
      const app = creaApp({ logger: false, verificaToken: verificatore(ruolo) });
      app.post('/api/solo-admin', (richiesta) => {
        richiediAmministratore(richiesta);
        return { ok: true };
      });
      const risposta = await app.inject({
        method: 'POST',
        url: '/api/solo-admin',
        headers: { authorization: 'Bearer token' },
      });
      expect(risposta.statusCode, `ruolo ${ruolo}`).toBe(statoAtteso);
    }
  });
});
