import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { DettaglioDocumento, PaginaDocumenti } from '../src/contratto/documenti.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool } from '../src/db/pool.js';

/**
 * Il dominio documentale contro il progetto vero: la stessa logica dello
 * stub (`mocks/api-stub.mjs`), ora in SQL, verificata sul contratto — e i
 * preferiti per utente, che nel mock non esistevano.
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

const PASSWORD_DEMO = 'assieme-demo-2026!';

async function accedi(app: FastifyInstance, email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/sessione/accesso',
    payload: { email, password: PASSWORD_DEMO },
  });
  return r.json<EsitoAccesso>().tokenAccesso;
}

describe.skipIf(!pronto)('archivio pubblico col progetto Supabase', () => {
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenOperatore: string;

  beforeAll(async () => {
    app = creaApp({ logger: false });
    tokenAdmin = await accedi(app, 'm.ferrero@assicurazionimeridiana.it');
    tokenOperatore = await accedi(app, 'p.ricciardi@assicurazionimeridiana.it');
  });

  afterAll(async () => {
    await chiudiPool();
  });

  const richiedi = (url: string, token: string) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  it('elenco: busta {elementi, totale, pagina, perPagina} con le fixture', async () => {
    const r = await richiedi('/api/documenti', tokenAdmin);
    expect(r.statusCode).toBe(200);
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBe(48);
    expect(pagina.elementi).toHaveLength(20);
    expect(pagina.pagina).toBe(1);
    const primo = pagina.elementi[0]!;
    expect(primo.archivio).toBe('pubblico');
    expect(primo.compagnia.nome).toBeTruthy();
    expect(primo.ramo.codice).toBeTruthy();
    expect(primo.fileUrl).toBe(`/api/documenti/${primo.id}/file`);
  });

  it('ricerca senza accenti, tutte le parole: "autopiu telematica"', async () => {
    const r = await richiedi('/api/documenti?q=autopiu%20telematica', tokenAdmin);
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBeGreaterThan(0);
    for (const d of pagina.elementi) {
      expect(d.prodotto.toLowerCase()).toContain('autopiù');
    }
  });

  it('filtri combinati: compagnia + solo correnti', async () => {
    const r = await richiedi(
      '/api/documenti?compagniaId=cmp-generali&soloCorrenti=true',
      tokenAdmin,
    );
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBeGreaterThan(0);
    for (const d of pagina.elementi) {
      expect(d.compagnia.id).toBe('cmp-generali');
      expect(d.edizione.corrente).toBe(true);
    }
  });

  it('dettaglio: le edizioni sorelle, la corrente in evidenza', async () => {
    const r = await richiedi('/api/documenti/doc-pub-001', tokenAdmin);
    expect(r.statusCode).toBe(200);
    const dettaglio = r.json<DettaglioDocumento>();
    expect(dettaglio.edizioni.length).toBeGreaterThanOrEqual(1);
    expect(dettaglio.edizioni.some((e) => e.corrente)).toBe(true);
    // Ordinate dalla più recente.
    const date = dettaglio.edizioni.map((e) => e.validaDal);
    expect([...date].sort().reverse()).toEqual(date);
  });

  it('il preferito è di chi lo marca, non del documento', async () => {
    // L'operatore marca un documento non ancora suo preferito.
    const marca = await app.inject({
      method: 'PUT',
      url: '/api/documenti/doc-pub-010/preferito',
      headers: { authorization: `Bearer ${tokenOperatore}` },
    });
    expect(marca.statusCode).toBe(200);
    expect(marca.json<{ preferito: boolean }>().preferito).toBe(true);

    // Per l'operatore ora è preferito…
    const suo = await richiedi('/api/documenti/doc-pub-010', tokenOperatore);
    expect(suo.json<{ preferito: boolean }>().preferito).toBe(true);

    // …ma l'amministratore non lo eredita: RF-A-09 è per utente.
    const altrui = await richiedi('/api/documenti/doc-pub-010', tokenAdmin);
    expect(altrui.json<{ preferito: boolean }>().preferito).toBe(false);

    // Pulizia: si smarca.
    const smarca = await app.inject({
      method: 'DELETE',
      url: '/api/documenti/doc-pub-010/preferito',
      headers: { authorization: `Bearer ${tokenOperatore}` },
    });
    expect(smarca.json<{ preferito: boolean }>().preferito).toBe(false);
  });

  it('soloPreferiti restituisce i marcati del seed', async () => {
    const r = await richiedi('/api/documenti?soloPreferiti=true', tokenAdmin);
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBe(6);
    for (const d of pagina.elementi) expect(d.preferito).toBe(true);
  });

  it('il file è un PDF vero', async () => {
    const r = await richiedi('/api/documenti/doc-pub-001/file', tokenAdmin);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('tassonomie: compagnie e rami dal database', async () => {
    const compagnie = await richiedi('/api/compagnie', tokenAdmin);
    expect(compagnie.json<unknown[]>()).toHaveLength(10);
    const rami = await richiedi('/api/rami', tokenAdmin);
    expect(rami.json<unknown[]>()).toHaveLength(8);
  });

  it('documento inesistente: 404 NON_TROVATO', async () => {
    const r = await richiedi('/api/documenti/doc-non-esiste', tokenAdmin);
    expect(r.statusCode).toBe(404);
    expect(r.json<{ codice: string }>().codice).toBe('NON_TROVATO');
  });
});
