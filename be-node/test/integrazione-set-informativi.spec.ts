import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import { ORDINE_TIPOLOGIA, type PaginaSet } from '../src/contratto/documenti.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool } from '../src/db/pool.js';

/**
 * L'archivio raggruppato contro il progetto vero: le righe sono set
 * informativi interi (mai mutilati dai filtri), ordinati come l'elenco,
 * col preferito che sale dal documento al set.
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

describe.skipIf(!pronto)('set informativi col progetto Supabase', () => {
  let app: FastifyInstance;
  let token: string;

  const richiedi = async (url: string, metodo: 'GET' | 'PUT' | 'DELETE' = 'GET') =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` } });

  const elenco = async (query = ''): Promise<PaginaSet> =>
    (await richiedi(`/api/set-informativi${query}`)).json<PaginaSet>();

  beforeAll(async () => {
    app = creaApp({ logger: false });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.uno@collaudo.sonovelia.it', password: 'velia-demo-2026!' },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;
    expect(token).toBeTruthy();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await chiudiPool();
  });

  it('una riga per set: documenti nell’ordine di lettura, chiavi uniche, compagnie in ordine', async () => {
    const pagina = await elenco('?perPagina=100');
    expect(pagina.elementi.length).toBeGreaterThan(0);
    expect(pagina.totale).toBeGreaterThanOrEqual(pagina.elementi.length);

    const chiavi = pagina.elementi.map((s) => s.chiave);
    expect(new Set(chiavi).size).toBe(chiavi.length);

    for (const set of pagina.elementi) {
      expect(set.documenti.length).toBeGreaterThan(0);
      const posizioni = set.documenti.map((d) => ORDINE_TIPOLOGIA.indexOf(d.tipologia));
      expect(posizioni).toEqual([...posizioni].sort((a, b) => a - b));
    }

    const compagnie = pagina.elementi.map((s) => s.compagnia.nome);
    expect(compagnie).toEqual([...compagnie].sort((a, b) => a.localeCompare(b, 'it')));
  });

  it('i filtri: solo correnti, compagnia, e la ricerca che non mutila i set', async () => {
    const correnti = await elenco('?soloCorrenti=true&perPagina=100');
    expect(correnti.elementi.every((s) => s.edizione.corrente)).toBe(true);

    const primo = correnti.elementi[0]!;
    const perCompagnia = await elenco(`?compagniaId=${primo.compagnia.id}&perPagina=100`);
    expect(perCompagnia.elementi.length).toBeGreaterThan(0);
    expect(perCompagnia.elementi.every((s) => s.compagnia.id === primo.compagnia.id)).toBe(true);

    /* Cercando per prodotto il set torna intero, con gli stessi documenti. */
    const cercato = await elenco(`?q=${encodeURIComponent(primo.prodotto)}&perPagina=100`);
    const trovato = cercato.elementi.find((s) => s.chiave === primo.chiave);
    expect(trovato).toBeDefined();
    expect(trovato!.documenti.map((d) => d.id)).toEqual(primo.documenti.map((d) => d.id));
  });

  it('il preferito sale dal documento al set, e «solo preferiti» ragiona per set', async () => {
    const primo = (await elenco('?soloCorrenti=true')).elementi[0]!;
    const documento = primo.documenti[0]!;

    await richiedi(`/api/documenti/${documento.id}/preferito`, 'PUT');
    try {
      const preferiti = await elenco('?soloPreferiti=true&perPagina=100');
      const set = preferiti.elementi.find((s) => s.chiave === primo.chiave);
      expect(set).toBeDefined();
      expect(set!.preferito).toBe(true);
      // Il set resta intero: anche i documenti non marcati ci sono ancora.
      expect(set!.documenti.map((d) => d.id)).toEqual(primo.documenti.map((d) => d.id));
      expect(set!.documenti.find((d) => d.id === documento.id)?.preferito).toBe(true);
    } finally {
      await richiedi(`/api/documenti/${documento.id}/preferito`, 'DELETE');
    }
  });
});
