import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { CATALOGO_MODELLI, modelloAttivo, versoModello, type ModelloAI } from '../src/contratto/modelli.js';

/**
 * Modello e provider (RF-D-02/03), il contratto: il catalogo dice la verità
 * — l'attivo è il modello che il motore usa davvero — e la scelta tiene i
 * codici del mock (404, 409 NON_DISPONIBILE, 403 per l'operatore).
 */

const verifica =
  (ruolo: 'operatore' | 'amministratore'): NonNullable<OpzioniApp['verificaToken']> =>
  () =>
    Promise.resolve({
      sub: '00000000-0000-4000-8000-00000000000a',
      app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo },
    });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('il catalogo', () => {
  it("l'attivo è il modello configurato; un id sperimentale fuori catalogo non rompe la scheda", () => {
    expect(modelloAttivo('claude-opus-5').id).toBe('mod-claude-opus-5');
    expect(modelloAttivo('claude-sonnet-5').id).toBe('mod-claude-sonnet-5');
    expect(modelloAttivo('un-modello-di-prova').disponibile).toBe(true);
  });

  it("la forma pubblica non espone l'id SDK, che è architettura", () => {
    for (const voce of CATALOGO_MODELLI) {
      expect(versoModello(voce)).not.toHaveProperty('sdk');
    }
  });
});

describe('le rotte', () => {
  const daOperatore = creaApp({ logger: false, verificaToken: verifica('operatore') });
  const daAmministratore = creaApp({ logger: false, verificaToken: verifica('amministratore') });

  it('GET: il catalogo intero — gli Anthropic selezionabili, i provider terzi non ancora', async () => {
    const elenco = await daOperatore.inject({ method: 'GET', url: '/api/modelli', headers: autenticato });
    expect(elenco.statusCode).toBe(200);
    const modelli = elenco.json<ModelloAI[]>();
    expect(modelli.length).toBeGreaterThanOrEqual(5);
    expect(modelli.filter((m) => m.disponibile).map((m) => m.nome)).toEqual([
      'Claude Opus 5',
      'Claude Sonnet 5',
      'Claude Haiku 4.5',
    ]);
    expect(modelli.filter((m) => !m.disponibile).map((m) => m.provider)).toEqual(['OpenAI', 'Mistral']);
  });

  it('PUT: 403 per l’operatore, 400 senza modello, 404 sull’ignoto, 409 sul non disponibile', async () => {
    const negato = await daOperatore.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: autenticato,
      payload: { modelloId: 'mod-claude-opus-5' },
    });
    expect(negato.statusCode).toBe(403);

    const vuoto = await daAmministratore.inject({ method: 'PUT', url: '/api/modelli/attivo', headers: autenticato, payload: {} });
    expect(vuoto.statusCode).toBe(400);

    const ignoto = await daAmministratore.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: autenticato,
      payload: { modelloId: 'mod-mai-visto' },
    });
    expect(ignoto.statusCode).toBe(404);
    expect(ignoto.json()).toMatchObject({ messaggio: 'Modello inesistente.' });

    const nonDisponibile = await daAmministratore.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: autenticato,
      payload: { modelloId: 'mod-gpt-5-2' },
    });
    expect(nonDisponibile.statusCode).toBe(409);
    expect(nonDisponibile.json()).toMatchObject({ codice: 'NON_DISPONIBILE' });
  });

  it('senza token → 401', async () => {
    for (const url of ['/api/modelli', '/api/modelli/attivo']) {
      const r = await daOperatore.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});
