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

const PASSWORD_DEMO = 'velia-demo-2026!';

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
    const r = await richiedi('/api/documenti?perPagina=100', tokenAdmin);
    expect(r.statusCode).toBe(200);
    const pagina = r.json<PaginaDocumenti>();
    /* 10 UnipolSai Km&Servizi (due edizioni) + 3 Cattolica AUTOPIÙ (ed. 07/2025) + 60 Nobis (8 prodotti, 15 edizioni) + 30 Allianz (5 prodotti, 10 edizioni) + 22 AXA (6 set). */
    expect(pagina.totale).toBe(125);
    expect(pagina.elementi).toHaveLength(100); // perPagina è tappato a 100
    expect(pagina.pagina).toBe(1);
    const primo = pagina.elementi[0]!;
    expect(primo.archivio).toBe('pubblico');
    expect(primo.compagnia.nome).toBeTruthy();
    expect(primo.ramo.codice).toBeTruthy();
    expect(primo.fileUrl).toBe(`/api/documenti/${primo.id}/file`);
  });

  it('ricerca senza accenti e simboli banali: "km servizi" trova Km&Servizi', async () => {
    const r = await richiedi('/api/documenti?q=km%20servizi%20dip', tokenAdmin);
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBeGreaterThan(0);
    for (const d of pagina.elementi) {
      expect(d.prodotto).toContain('Km&Servizi');
    }
  });

  it('filtri combinati: compagnia + solo correnti = i 5 documenti ed. 11/2022', async () => {
    const r = await richiedi(
      '/api/documenti?compagniaId=cmp-unipolsai&soloCorrenti=true',
      tokenAdmin,
    );
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBe(5);
    for (const d of pagina.elementi) {
      expect(d.compagnia.id).toBe('cmp-unipolsai');
      expect(d.edizione.corrente).toBe(true);
      expect(d.edizione.etichetta).toBe('ed. 11/2022');
    }
  });

  it('dettaglio del DIP corrente: le due edizioni vere, dalla più recente', async () => {
    const r = await richiedi(
      '/api/documenti/doc-unipolsai-km-servizi-autovetture-ed-2022-11-dip',
      tokenAdmin,
    );
    expect(r.statusCode).toBe(200);
    const dettaglio = r.json<DettaglioDocumento>();
    expect(dettaglio.edizioni).toHaveLength(2);
    expect(dettaglio.edizioni[0]!.corrente).toBe(true);
    expect(dettaglio.edizioni[0]!.validaDal).toBe('2022-11-01');
    expect(dettaglio.edizioni[1]!.validaDal).toBe('2019-01-01');
    // RF-A-04: la storica dichiara fin quando è valsa.
    expect(dettaglio.edizioni[1]!.validaAl).toBe('2022-10-31');
    // Il DIP comincia in copertina…
    expect(dettaglio.paginaInizio).toBe(1);
  });

  it('le Condizioni si aprono dove cominciano nel PDF del set (pag. 37)', async () => {
    const r = await richiedi(
      '/api/documenti/doc-unipolsai-km-servizi-autovetture-ed-2022-11-condizioni-di-assicurazione',
      tokenAdmin,
    );
    expect(r.json<DettaglioDocumento>().paginaInizio).toBe(37);
  });

  const DOC_STORICO = 'doc-unipolsai-km-servizi-autovetture-ed-2019-01-dip';

  it('il preferito è di chi lo marca, non del documento', async () => {
    // L'operatore marca un documento non ancora suo preferito.
    const marca = await app.inject({
      method: 'PUT',
      url: `/api/documenti/${DOC_STORICO}/preferito`,
      headers: { authorization: `Bearer ${tokenOperatore}` },
    });
    expect(marca.statusCode).toBe(200);
    expect(marca.json<{ preferito: boolean }>().preferito).toBe(true);

    // Per l'operatore ora è preferito…
    const suo = await richiedi(`/api/documenti/${DOC_STORICO}`, tokenOperatore);
    expect(suo.json<{ preferito: boolean }>().preferito).toBe(true);

    // …ma l'amministratore non lo eredita: RF-A-09 è per utente.
    const altrui = await richiedi(`/api/documenti/${DOC_STORICO}`, tokenAdmin);
    expect(altrui.json<{ preferito: boolean }>().preferito).toBe(false);

    // Pulizia: si smarca.
    const smarca = await app.inject({
      method: 'DELETE',
      url: `/api/documenti/${DOC_STORICO}/preferito`,
      headers: { authorization: `Bearer ${tokenOperatore}` },
    });
    expect(smarca.json<{ preferito: boolean }>().preferito).toBe(false);
  });

  it('soloPreferiti restituisce i marcati del seed (DIP e Condizioni correnti)', async () => {
    const r = await richiedi('/api/documenti?soloPreferiti=true', tokenAdmin);
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBe(2);
    for (const d of pagina.elementi) {
      expect(d.preferito).toBe(true);
      expect(d.edizione.corrente).toBe(true);
    }
  });

  /* In CI il catalogo c'è ma lo Storage è vuoto: i byte dei documenti veri
     non stanno nel repository (punto aperto §6.2 sulla ridistribuzione). */
  it.skipIf(process.env.CI)('il file è il PDF originale dallo Storage', async () => {
    const r = await richiedi(
      '/api/documenti/doc-unipolsai-km-servizi-autovetture-ed-2022-11-dip/file',
      tokenAdmin,
    );
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // Il set 11/2022 pesa ~2 MB: se arriva poco, è il segnaposto di qualcosa.
    expect(r.rawPayload.length).toBeGreaterThan(1_000_000);
  });

  it('tassonomie: compagnie e rami dal database', async () => {
    const compagnie = await richiedi('/api/compagnie', tokenAdmin);
    expect(compagnie.json<unknown[]>()).toHaveLength(11);
    const rami = await richiedi('/api/rami', tokenAdmin);
    expect(rami.json<unknown[]>()).toHaveLength(8);
  });

  it('documento inesistente: 404 NON_TROVATO', async () => {
    const r = await richiedi('/api/documenti/doc-non-esiste', tokenAdmin);
    expect(r.statusCode).toBe(404);
    expect(r.json<{ codice: string }>().codice).toBe('NON_TROVATO');
  });
});
