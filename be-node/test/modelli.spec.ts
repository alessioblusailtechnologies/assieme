import { describe, expect, it, vi } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import {
  LIVELLI,
  livelloAttivo,
  modelloDelLivello,
  modelloDelTenant,
  servitoDaAnthropic,
  versoPubblico,
  type ModelloAI,
} from '../src/contratto/modelli.js';

/**
 * Modello e provider (RF-D-02/03), il contratto: il tenant sceglie un
 * livello, non un modello; l'attivo è il livello che il motore usa davvero,
 * e la scelta tiene i codici del mock (404, 409 NON_DISPONIBILE, 403 per
 * l'operatore).
 */

/* Qui la chiave AKI manca, come su una piattaforma che non l'ha ancora
   configurata: il livello Avanzato si vede ma non si sceglie. Prima di ogni
   import, perché `configurazione()` legge l'ambiente una volta sola e il
   .env non sovrascrive una variabile che c'è già. */
vi.hoisted(() => {
  process.env['AKI_API_KEY'] = '';
});

const verifica =
  (ruolo: 'operatore' | 'amministratore'): NonNullable<OpzioniApp['verificaToken']> =>
  () =>
    Promise.resolve({
      sub: '00000000-0000-4000-8000-00000000000a',
      app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo },
    });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('i livelli', () => {
  it("l'attivo è il livello del modello configurato; un id che nessun livello serve si presenta col più potente", () => {
    expect(livelloAttivo('claude-opus-5').id).toBe('livello-boost');
    expect(livelloAttivo('deepseek-v4-flash-0731-284b').id).toBe('livello-avanzato');
    expect(livelloAttivo('claude-sonnet-5').id).toBe('livello-medio');
    expect(livelloAttivo('un-modello-di-prova').id).toBe('livello-boost');
  });

  it('una scelta rimasta su un modello che nessun livello serve non vale più: si torna al default', () => {
    expect(modelloDelTenant('claude-opus-5')).toBe('claude-opus-5');
    expect(modelloDelTenant('deepseek-v4-flash-0731-284b')).toBe('deepseek-v4-flash-0731-284b');
    expect(modelloDelTenant('glm5.3-754b')).toBeUndefined();
    expect(modelloDelTenant(null)).toBeUndefined();
  });

  it('il livello scelto in chat porta al suo modello; la sandbox prende solo quelli di Anthropic', () => {
    expect(modelloDelLivello('livello-medio')).toBe('claude-sonnet-5');
    expect(modelloDelLivello('livello-inventato')).toBeUndefined();
    expect(modelloDelLivello(undefined)).toBeUndefined();
    expect(servitoDaAnthropic('claude-sonnet-5')).toBe(true);
    expect(servitoDaAnthropic('deepseek-v4-flash-0731-284b')).toBe(false);
  });

  it('la forma pubblica non dice che modello c’è dietro', () => {
    for (const livello of LIVELLI) expect(versoPubblico(livello)).not.toHaveProperty('sdk');
    const pubblico = JSON.stringify(LIVELLI.map(versoPubblico));
    expect(pubblico).not.toMatch(/\b(claude|opus|sonnet|anthropic|deepseek|aki)\b/i);
  });
});

describe('le rotte', () => {
  const daOperatore = creaApp({ logger: false, verificaToken: verifica('operatore') });
  const daAmministratore = creaApp({ logger: false, verificaToken: verifica('amministratore') });

  it('GET: i livelli in ordine, ciascuno selezionabile solo se il suo fornitore è configurato', async () => {
    const elenco = await daOperatore.inject({ method: 'GET', url: '/api/modelli', headers: autenticato });
    expect(elenco.statusCode).toBe(200);
    expect(elenco.json<ModelloAI[]>().map((m) => [m.nome, m.disponibile])).toEqual([
      ['Medio', true],
      ['Avanzato', false],
      ['Boost', true],
    ]);
  });

  it('PUT: 403 per l’operatore, 400 senza livello, 404 sull’ignoto, 409 sul non disponibile', async () => {
    const negato = await daOperatore.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: autenticato,
      payload: { modelloId: 'livello-boost' },
    });
    expect(negato.statusCode).toBe(403);

    const vuoto = await daAmministratore.inject({ method: 'PUT', url: '/api/modelli/attivo', headers: autenticato, payload: {} });
    expect(vuoto.statusCode).toBe(400);

    /* Anche l'id di una scheda di prima dei livelli: non esiste più. */
    const ignoto = await daAmministratore.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: autenticato,
      payload: { modelloId: 'mod-claude-sonnet-5' },
    });
    expect(ignoto.statusCode).toBe(404);
    expect(ignoto.json()).toMatchObject({ messaggio: 'Livello inesistente.' });

    const nonDisponibile = await daAmministratore.inject({
      method: 'PUT',
      url: '/api/modelli/attivo',
      headers: autenticato,
      payload: { modelloId: 'livello-avanzato' },
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
