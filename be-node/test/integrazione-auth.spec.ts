import { afterAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import {
  ServizioSuggerimenti,
  type ContestoSuggerimenti,
  type GeneratoreSuggerimenti,
} from '../src/api/conversazioni/suggeritore.js';
import { ServizioSaluti, type GeneratoreSaluti } from '../src/api/sessione/saluti.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { EsitoAccesso, Sessione } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';

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
    // I lotti finti non devono restare: la home degli utenti li leggerebbe.
    await poolDb().query(`delete from velia.saluti where modello = 'finto'`);
    await poolDb().query(
      `delete from velia.suggerimenti where utente_id = (select id from velia.utenti where email = $1)`,
      ['p.ricciardi@assicurazionimeridiana.it'],
    );
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

  it('i saluti della home viaggiano con la sessione: lotto generato in background, letto attraverso la RLS', async () => {
    const generatore: GeneratoreSaluti = {
      genera: () =>
        Promise.resolve({
          mattina: ['Prova {nome}, su cosa lavoriamo?', 'senza segnaposto', 'Prova {nome} — dimmi tu'],
          sera: ['Buonasera {nome}, chiudiamo bene?'],
        }),
    };
    const saluti = new ServizioSaluti({ generatore, pool: poolDb, oreValidita: 24, adesso: () => new Date() });
    const app = creaApp({ logger: false, sessione: { saluti } });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 'p.ricciardi@assicurazionimeridiana.it', password: PASSWORD_DEMO },
    });
    expect(accesso.statusCode).toBe(200);
    const { tokenAccesso } = accesso.json<EsitoAccesso>();

    // Il lotto in tabella (di un altro test, o del modello vero) potrebbe essere
    // fresco: per provare la generazione la si forza con un servizio scaduto.
    const forzato = new ServizioSaluti({ generatore, pool: poolDb, oreValidita: 0.000001 });
    const appForzata = creaApp({ logger: false, sessione: { saluti: forzato } });
    const prima = await appForzata.inject({
      method: 'GET',
      url: '/api/sessione',
      headers: { authorization: `Bearer ${tokenAccesso}` },
    });
    expect(prima.statusCode).toBe(200);
    await forzato.attendi();

    const dopo = await app.inject({
      method: 'GET',
      url: '/api/sessione',
      headers: { authorization: `Bearer ${tokenAccesso}` },
    });
    const sessione = dopo.json<Sessione>();
    expect(sessione.saluti).toBeDefined();
    expect(sessione.saluti!.frasi.mattina).toEqual([
      'Prova {nome}, su cosa lavoriamo?',
      'Prova {nome} - dimmi tu',
    ]);
    expect(sessione.saluti!.frasi.sera).toEqual(['Buonasera {nome}, chiudiamo bene?']);
    expect(sessione.saluti!.frasi.notte).toEqual([]);
    expect(Date.now() - Date.parse(sessione.saluti!.generatoIl)).toBeLessThan(60_000);
  });

  it('i suggerimenti della home: contesto letto attraverso la RLS, lotto per utente generato in background', async () => {
    let contestoVisto: ContestoSuggerimenti | undefined;
    const generatore: GeneratoreSuggerimenti = {
      genera: (contesto) => {
        contestoVisto = contesto;
        return Promise.resolve([
          'Confronta le franchigie furto di AUTOPIÙ e Km&Servizi',
          '"Che massimali ha la Kasko?"',
          'Confronta le franchigie furto di AUTOPIÙ e Km&Servizi',
        ]);
      },
    };
    const servizio = new ServizioSuggerimenti({ generatore, pool: poolDb, oreValidita: 0.000001 });
    const app = creaApp({ logger: false, conversazioni: { suggerimenti: servizio } });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 'p.ricciardi@assicurazionimeridiana.it', password: PASSWORD_DEMO },
    });
    const { tokenAccesso, sessione } = accesso.json<EsitoAccesso>();

    const prima = await app.inject({
      method: 'GET',
      url: '/api/suggerimenti',
      headers: { authorization: `Bearer ${tokenAccesso}` },
    });
    expect(prima.statusCode).toBe(200);
    await servizio.attendi(sessione.utente.id);

    expect(contestoVisto).toBeDefined();
    // L'archivio pubblico è popolato nel progetto vero: la sezione arriva compilata.
    expect(contestoVisto!.archivioPubblico.length).toBeGreaterThan(0);
    expect(contestoVisto!.archivioPubblico[0]).toMatch(/^.+ - .+ \(.+\)$/);

    const dopo = await app.inject({
      method: 'GET',
      url: '/api/suggerimenti',
      headers: { authorization: `Bearer ${tokenAccesso}` },
    });
    expect(dopo.json<string[]>()).toEqual([
      'Confronta le franchigie furto di AUTOPIÙ e Km&Servizi',
      'Che massimali ha la Kasko?',
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
