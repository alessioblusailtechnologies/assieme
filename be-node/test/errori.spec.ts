import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { ErroreApi, schemaErroreApi } from '../src/contratto/errori.js';

/** Un verificatore finto: qualunque token vale, identità di prova. */
const verificaFinta: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: 'utn-prova',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

/**
 * Il contratto degli errori è quello dei mock: {codice, messaggio} sempre,
 * ritentaTraSecondi solo sui 429, mai uno stack trace verso il client.
 */
describe('gestore errori', () => {
  it('risponde alla sonda di vita', async () => {
    const app = creaApp({ logger: false, verificaToken: verificaFinta });
    const risposta = await app.inject({ method: 'GET', url: '/api/salute' });
    expect(risposta.statusCode).toBe(200);
    expect(risposta.json()).toEqual({ stato: 'ok' });
  });

  it('una rotta inesistente risponde 404 NON_TROVATO', async () => {
    const app = creaApp({ logger: false, verificaToken: verificaFinta });
    const risposta = await app.inject({ method: "GET", url: "/api/inesistente", headers: autenticato });
    expect(risposta.statusCode).toBe(404);
    expect(risposta.json()).toEqual({
      codice: 'NON_TROVATO',
      messaggio: 'Risorsa non trovata.',
    });
  });

  it('un ErroreApi esce col suo stato e il suo corpo', async () => {
    const app = creaApp({ logger: false, verificaToken: verificaFinta });
    app.get('/api/prova-403', () => {
      throw ErroreApi.permessoNegato();
    });
    const risposta = await app.inject({ method: 'GET', url: '/api/prova-403', headers: autenticato });
    expect(risposta.statusCode).toBe(403);
    expect(risposta.json()).toEqual({
      codice: 'PERMESSO_NEGATO',
      messaggio: "L'utente non dispone dei permessi necessari per questa operazione.",
    });
  });

  it('il 429 porta ritentaTraSecondi, come nel mock', async () => {
    const app = creaApp({ logger: false, verificaToken: verificaFinta });
    app.get('/api/prova-429', () => {
      throw ErroreApi.quotaSuperata(45);
    });
    const risposta = await app.inject({ method: 'GET', url: '/api/prova-429', headers: autenticato });
    expect(risposta.statusCode).toBe(429);
    const corpo: unknown = risposta.json();
    expect(schemaErroreApi.parse(corpo)).toEqual({
      codice: 'QUOTA_SUPERATA',
      messaggio: 'Limite di richieste del piano raggiunto.',
      ritentaTraSecondi: 45,
    });
  });

  it('un errore inatteso diventa 500 ERRORE_INTERNO senza dettagli', async () => {
    const app = creaApp({ logger: false, verificaToken: verificaFinta });
    app.get('/api/prova-500', () => {
      throw new Error('dettaglio interno che non deve uscire');
    });
    const risposta = await app.inject({ method: 'GET', url: '/api/prova-500', headers: autenticato });
    expect(risposta.statusCode).toBe(500);
    const corpo = risposta.json<{ codice: string; messaggio: string }>();
    expect(corpo.codice).toBe('ERRORE_INTERNO');
    expect(JSON.stringify(corpo)).not.toContain('dettaglio interno');
  });
});
