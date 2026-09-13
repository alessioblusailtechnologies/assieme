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
    /* 138 Unipol (26 prodotti: i 9 set auto ed. 05/2026 entrati il 12/09/2026, le due edizioni storiche di Km&Servizi Autovetture, Scudo Cyber in due edizioni, 3 Focus Commercio, i 3 set già trascritti entrati il 13/09/2026: Tutela Legale Aziende ed. 03/2026, Unica Infortuni e Unica Casa ed. 10/2025, piu Tutela Legale Professionisti ed. 03/2026 , Unica Famiglia e Unica Mobilita ed. 10/2025, Km&Servizi Monopattini ed. 07/2026 e Navigare Diporto ed. 08/2025: col 13/09 il lotto auto Unipol e completo, 11 set su 11; piu Unica Salute ed. 10/2025, che apre il ramo salute per Unipol, Unica Viaggio ed. 10/2025, che apre viaggi, Unica Cane e Gatto ed. 10/2025 e Condominio Piu ed. 09/2026, terzo prodotto condominio del catalogo) + 3 Cattolica AUTOPIÙ (ed. 07/2025) + 60 Nobis (8 prodotti, 15 edizioni) + 30 Allianz (5 prodotti, 10 edizioni) + 22 AXA (6 set) + 51 Zurich (16 prodotti, 17 edizioni: auto, casa, infortuni, salute, viaggi) + 23 HDI (7 set: i 6 auto piu # Viaggio Singolo ed. 06/2026, entrato il 13/09/2026, che apre il ramo viaggi per HDI) + 34 Generali (9 set: 2 contratti base, Sei in Viaggio, Immagina Strade Nuove e Passione Moto, ViviCondomìnio e i tre moduli di Immagina Adesso - Casa, Armonia e Cucciolo, ognuno con le Norme comuni replicate) + 15 Groupama (5 set auto entrati il 13/09/2026). */
    expect(pagina.totale).toBe(376);
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

  it('filtri combinati: compagnia + ramo + solo correnti = i 61 documenti auto di Unipol', async () => {
    const r = await richiedi(
      '/api/documenti?compagniaId=cmp-unipolsai&ramoId=ram-auto&soloCorrenti=true&perPagina=100',
      tokenAdmin,
    );
    const pagina = r.json<PaginaDocumenti>();
    /* I nove set entrati il 12/09/2026 portano tutti «ed. 05/2026». Fino al
       12/09 il filtro tornava una data sola, ma era un caso: dal 13/09
       Km&Servizi Monopattini entra con «ed. 07/2026» e Navigare Diporto con
       «ed. 08/2025», quindi qui si verifica che il filtro selezioni le
       correnti del ramo, non che siano coetanee. */
    expect(pagina.totale).toBe(61);
    expect(pagina.elementi).toHaveLength(61); // tutte in una pagina sola, altrimenti il giro sotto ne vede 20
    const etichette = new Set<string>();
    for (const d of pagina.elementi) {
      expect(d.compagnia.id).toBe('cmp-unipolsai');
      expect(d.edizione.corrente).toBe(true);
      etichette.add(d.edizione.etichetta);
    }
    expect([...etichette].sort()).toEqual(['ed. 05/2026', 'ed. 07/2026', 'ed. 08/2025']);
  });

  it('dettaglio di un DIP: le tre edizioni vere, dalla più recente', async () => {
    const r = await richiedi(
      '/api/documenti/doc-unipolsai-km-servizi-autovetture-ed-2022-11-dip',
      tokenAdmin,
    );
    expect(r.statusCode).toBe(200);
    const dettaglio = r.json<DettaglioDocumento>();
    /* Dal 12/09/2026 la corrente è la 05/2026: chiesta una storica, si
       vedono tutte e tre, e la 11/2022 dice fin quando è valsa. */
    expect(dettaglio.edizioni).toHaveLength(3);
    expect(dettaglio.edizioni[0]!.corrente).toBe(true);
    expect(dettaglio.edizioni[0]!.validaDal).toBe('2026-05-01');
    expect(dettaglio.edizioni[1]!.validaDal).toBe('2022-11-01');
    expect(dettaglio.edizioni[1]!.validaAl).toBe('2026-04-30');
    expect(dettaglio.edizioni[2]!.validaDal).toBe('2019-01-01');
    // RF-A-04: la storica dichiara fin quando è valsa.
    expect(dettaglio.edizioni[2]!.validaAl).toBe('2022-10-31');
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

  it('soloPreferiti restituisce i marcati del seed (DIP e Condizioni di Km&Servizi)', async () => {
    const r = await richiedi('/api/documenti?soloPreferiti=true', tokenAdmin);
    const pagina = r.json<PaginaDocumenti>();
    expect(pagina.totale).toBe(2);
    for (const d of pagina.elementi) {
      expect(d.preferito).toBe(true);
      /* Il preferito è del documento, non dell'edizione: questi due erano
         correnti quando il seed li ha marcati, e il 12/09/2026 la 05/2026
         li ha superati senza toglierli dai preferiti di nessuno. */
      expect(d.prodotto).toBe('Km&Servizi Autovetture');
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
    expect(compagnie.json<unknown[]>()).toHaveLength(12);
    const rami = await richiedi('/api/rami', tokenAdmin);
    expect(rami.json<unknown[]>()).toHaveLength(10);
  });

  it('documento inesistente: 404 NON_TROVATO', async () => {
    const r = await richiedi('/api/documenti/doc-non-esiste', tokenAdmin);
    expect(r.statusCode).toBe(404);
    expect(r.json<{ codice: string }>().codice).toBe('NON_TROVATO');
  });
});
