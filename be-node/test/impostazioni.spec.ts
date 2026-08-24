import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import {
  colonneAmbito,
  schemaAmbito,
  schemaModificheRiferimento,
  schemaNuovaRegola,
  versoAmbito,
} from '../src/contratto/impostazioni.js';
import { schemaNuovoUtente } from '../src/contratto/utenti.js';

/**
 * Il resto della Fase 6 senza database: gli schemi Zod di regole, ambiti,
 * riferimenti e utenti, e le risposte che le rotte danno prima di toccare
 * il db — la guardia da amministratore su ogni scrittura.
 */

const verifica =
  (ruolo: 'operatore' | 'amministratore'): NonNullable<OpzioniApp['verificaToken']> =>
  () =>
    Promise.resolve({
      sub: '00000000-0000-4000-8000-00000000000a',
      app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo },
    });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('schemi del contratto', () => {
  it('una regola pretende titolo e testo; l’ambito manca → generale', () => {
    expect(schemaNuovaRegola.safeParse({ titolo: ' ', testo: 'x' }).success).toBe(false);
    expect(schemaNuovaRegola.parse({ titolo: 'Infortuni', testo: 'Non segnalare…' }).ambito).toEqual({
      tipo: 'generale',
    });
  });

  it('l’ambito è una unione discriminata: ramo senza ramoId non passa', () => {
    expect(schemaAmbito.safeParse({ tipo: 'ramo' }).success).toBe(false);
    expect(schemaAmbito.safeParse({ tipo: 'ramo', ramoId: 'ram-auto' }).success).toBe(true);
    expect(schemaAmbito.safeParse({ tipo: 'boh' }).success).toBe(false);
  });

  it('l’ambito va e torna dalle colonne senza perdere pezzi', () => {
    for (const ambito of [
      { tipo: 'generale' as const },
      { tipo: 'ramo' as const, ramoId: 'ram-auto' },
      { tipo: 'compagnia' as const, compagniaId: 'cmp-unipolsai' },
    ]) {
      const colonne = colonneAmbito(ambito);
      expect(
        versoAmbito({
          ambito_tipo: colonne.tipo,
          ambito_ramo_id: colonne.ramoId,
          ambito_compagnia_id: colonne.compagniaId,
        }),
      ).toEqual(ambito);
    }
  });

  it('il PATCH del riferimento accetta solo governo, mai contenuto', () => {
    expect(schemaModificheRiferimento.safeParse({ attivo: false }).success).toBe(true);
    expect(schemaModificheRiferimento.parse({ titolo: 'X' })).toEqual({});
  });

  it('l’invito pretende un’email vera e il ruolo cade su operatore', () => {
    expect(schemaNuovoUtente.safeParse({ nome: 'A', cognome: 'B', email: 'non-email' }).success).toBe(false);
    expect(schemaNuovoUtente.parse({ nome: 'A', cognome: 'B', email: 'a@b.it' }).ruolo).toBe('operatore');
  });
});

describe('le rotte prima del database', () => {
  const daOperatore = creaApp({ logger: false, verificaToken: verifica('operatore') });
  const daAmministratore = creaApp({ logger: false, verificaToken: verifica('amministratore') });

  it('le scritture (e l’elenco utenti) sono da amministratore: 403 per l’operatore', async () => {
    const casi = [
      { method: 'POST' as const, url: '/api/istruzioni/regole' },
      { method: 'PATCH' as const, url: '/api/istruzioni/regole/x' },
      { method: 'DELETE' as const, url: '/api/istruzioni/regole/x' },
      { method: 'POST' as const, url: '/api/istruzioni/riferimenti' },
      { method: 'PATCH' as const, url: '/api/istruzioni/riferimenti/x' },
      { method: 'DELETE' as const, url: '/api/istruzioni/riferimenti/x' },
      { method: 'GET' as const, url: '/api/utenti' },
      { method: 'POST' as const, url: '/api/utenti' },
      { method: 'PATCH' as const, url: '/api/utenti/x' },
    ];
    for (const caso of casi) {
      const r = await daOperatore.inject({ ...caso, headers: autenticato });
      expect(r.statusCode, `${caso.method} ${caso.url}`).toBe(403);
    }
  });

  it('regola senza testo → 400 REGOLA_VUOTA; riferimenti senza multipart → 400; invito monco → 400 DATI_MANCANTI', async () => {
    const regola = await daAmministratore.inject({
      method: 'POST',
      url: '/api/istruzioni/regole',
      headers: autenticato,
      payload: { titolo: 'Solo titolo' },
    });
    expect(regola.statusCode).toBe(400);
    expect(regola.json()).toMatchObject({ codice: 'REGOLA_VUOTA' });

    const riferimenti = await daAmministratore.inject({
      method: 'POST',
      url: '/api/istruzioni/riferimenti',
      headers: autenticato,
      payload: { file: 'no' },
    });
    expect(riferimenti.statusCode).toBe(400);

    const invito = await daAmministratore.inject({
      method: 'POST',
      url: '/api/utenti',
      headers: autenticato,
      payload: { nome: 'Solo nome' },
    });
    expect(invito.statusCode).toBe(400);
    expect(invito.json()).toMatchObject({ codice: 'DATI_MANCANTI' });

    const utenteIgnoto = await daAmministratore.inject({
      method: 'PATCH',
      url: '/api/utenti/non-uuid',
      headers: autenticato,
      payload: { ruolo: 'operatore' },
    });
    expect(utenteIgnoto.statusCode).toBe(404);
  });

  it('senza token → 401 su ogni rotta del dominio', async () => {
    for (const url of ['/api/istruzioni/regole', '/api/istruzioni/riferimenti', '/api/impostazioni/storico', '/api/utenti']) {
      const r = await daOperatore.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});
