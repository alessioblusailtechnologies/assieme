import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { Cliente, PaginaClienti, SchedaCliente } from '../src/contratto/clienti.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import type { PaginaDocumentiPrivati } from '../src/contratto/documenti-privati.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';

/**
 * I clienti contro il progetto vero (`PIANO-CLIENTI.md`, Fase 2): anagrafica,
 * scheda, assegnazione in blocco, etichette ed eliminazione.
 *
 * Quello che si prova davvero è il **giorno dopo l'importazione**: trenta
 * documenti arrivati senza cliente, uno spostato in blocco, un'etichetta
 * scritta male da correggere ovunque, e due clienti sdoppiati da fondere.
 * È lì che questa sezione serve o non serve a niente.
 *
 * Come le altre suite d'integrazione: worker di sviluppo fermo.
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
const TENANT = '22222222-2222-4222-8222-222222222222';
const EMAIL_ADMIN = 't.uno@collaudo.sonovelia.it';

const DOC_A = 'doc-priv-collaudo-cli-a';
const DOC_B = 'doc-priv-collaudo-cli-b';

const pool = () => poolDb();

describe.skipIf(!pronto)('Clienti · l’anagrafica e il lavoro in blocco', () => {
  let app: FastifyInstance;
  let token = '';
  let rossi = '';
  let rossiDoppione = '';

  const chiedi = (metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  beforeAll(async () => {
    app = creaApp({ logger: false });
    await app.ready();
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;

    await pulisci();

    /* Due documenti senza cliente, come escono da un'importazione. */
    for (const [id, titolo] of [
      [DOC_A, 'Polizza auto 2026'],
      [DOC_B, 'Preventivo casa'],
    ] as const) {
      await pool().query(
        `insert into velia.documenti
           (id, archivio, tenant_id, titolo, tipologia, stato, numero_pagine, path_md,
            etichette, caricato_il, dimensione_byte)
         values ($1, 'privato', $2, $3, 'polizza', 'pronto', 1, $4, $5, now(), 1000)`,
        [id, TENANT, titolo, `tenant/${TENANT}/documenti/${id}.md`, ['da rinnovare', 'auto']],
      );
    }
  }, 60_000);

  afterAll(async () => {
    await pulisci();
    await app.close();
    await chiudiPool();
  });

  async function pulisci(): Promise<void> {
    await pool().query(`delete from velia.documenti where id = any($1)`, [[DOC_A, DOC_B]]);
    await pool().query(`delete from velia.clienti where tenant_id = $1`, [TENANT]);
  }

  it('crea un cliente con i suoi recapiti, e avvisa sul quasi-doppione', async () => {
    const creato = await chiedi('POST', '/api/clienti', {
      nome: 'Rossi Mario',
      telefono: '340 1122334',
      etichette: ['in rinnovo'],
    });
    expect(creato.statusCode).toBe(201);
    const cliente = creato.json<Cliente>();
    rossi = cliente.id;
    expect(cliente).toMatchObject({
      nome: 'Rossi Mario',
      tipo: 'persona',
      telefono: '340 1122334',
      stato: 'attivo',
      documenti: 0,
    });
    expect(cliente.etichette).toEqual(['in rinnovo']);

    /* «ROSSI MARIO» è lo stesso cliente scritto in un altro modo: dirlo
       prima è ciò che tiene insieme l'anagrafica. */
    const gemello = await chiedi('POST', '/api/clienti', { nome: 'ROSSI  MARIO' });
    expect(gemello.statusCode).toBe(409);
    expect(gemello.json<CorpoErroreApi>().codice).toBe('CLIENTE_SIMILE');
  });

  it('trova il cliente per alias e per codice fiscale', async () => {
    await chiedi('PATCH', `/api/clienti/${rossi}`, {
      alias: ['ROSSI M.'],
      codiceFiscale: 'RSSMRA78D23F205X',
    });

    const perAlias = await chiedi('GET', '/api/clienti?q=rossi m.');
    expect(perAlias.json<PaginaClienti>().elementi.map((c) => c.id)).toContain(rossi);

    const perCf = await chiedi('GET', '/api/clienti?q=RSSMRA78D23');
    expect(perCf.json<PaginaClienti>().elementi.map((c) => c.id)).toEqual([rossi]);
  });

  it('assegna in blocco: un cliente e un’etichetta su più documenti in un colpo', async () => {
    const esito = await chiedi('POST', '/api/documenti-privati/assegna', {
      documenti: [DOC_A, DOC_B],
      clienteId: rossi,
      aggiungiEtichette: ['2026'],
      togliEtichette: ['da rinnovare'],
    });
    expect(esito.statusCode).toBe(200);
    expect(esito.json<{ toccati: number }>().toccati).toBe(2);

    const elenco = await chiedi('GET', `/api/documenti-privati?clienteId=${rossi}`);
    const documenti = elenco.json<PaginaDocumentiPrivati>().elementi;
    expect(documenti.map((d) => d.id).sort()).toEqual([DOC_A, DOC_B]);
    /* Le etichette si sommano, non si sostituiscono: «auto» non l'aveva
       chiesto nessuno di toglierla. */
    expect(documenti[0]!.etichette.sort()).toEqual(['2026', 'auto']);
    /* Assegnare a mano vale come confermare. */
    expect(documenti[0]!.clienteDaConfermare).toBeUndefined();
  });

  it('confermare in blocco spegne la domanda senza riassegnare', async () => {
    /* È il gesto con cui si svuota la coda delle proposte dopo
       un'importazione: «sì, quelli che hai proposto vanno bene». Senza,
       bisognerebbe riassegnare uno per uno ciò che era già giusto. */
    await pool().query(
      `update velia.documenti set cliente_da_confermare = true where id = any($1)`,
      [[DOC_A, DOC_B]],
    );
    const coda = await chiedi('GET', '/api/documenti-privati?daConfermare=true');
    expect(coda.json<PaginaDocumentiPrivati>().elementi.map((d) => d.id).sort()).toEqual([
      DOC_A,
      DOC_B,
    ]);

    const esito = await chiedi('POST', '/api/documenti-privati/assegna', {
      documenti: [DOC_A, DOC_B],
      confermaCliente: true,
    });
    expect(esito.statusCode).toBe(200);

    const dopo = await chiedi('GET', `/api/documenti-privati?clienteId=${rossi}`);
    const documenti = dopo.json<PaginaDocumentiPrivati>().elementi;
    /* Il cliente resta quello: confermare non riassegna. */
    expect(documenti.every((d) => d.cliente?.id === rossi)).toBe(true);
    expect(documenti.every((d) => !d.clienteDaConfermare)).toBe(true);
  });

  it('«senza cliente» è una vista a sé', async () => {
    const senza = await chiedi('GET', '/api/documenti-privati?senzaCliente=true');
    const ids = senza.json<PaginaDocumentiPrivati>().elementi.map((d) => d.id);
    expect(ids).not.toContain(DOC_A);
  });

  it('rinomina un’etichetta ovunque, e rinominarla in una che c’è già le fonde', async () => {
    const rinomina = await chiedi('PATCH', '/api/etichette/2026', { nome: 'annualità 2026' });
    expect(rinomina.statusCode).toBe(200);
    expect(rinomina.json<{ toccati: number }>().toccati).toBe(2);

    const dopo = await chiedi('GET', `/api/documenti-privati?clienteId=${rossi}`);
    expect(dopo.json<PaginaDocumentiPrivati>().elementi[0]!.etichette).toContain('annualità 2026');

    /* La fusione: «annualità 2026» diventa «auto», che i documenti hanno
       già. Deve restare una voce sola, non due uguali. */
    const fusa = await chiedi('PATCH', '/api/etichette/annualit%C3%A0%202026', { nome: 'auto' });
    expect(fusa.statusCode).toBe(200);
    const finale = await chiedi('GET', `/api/documenti-privati?clienteId=${rossi}`);
    expect(finale.json<PaginaDocumentiPrivati>().elementi[0]!.etichette).toEqual(['auto']);
  });

  it('la scheda racconta il contorno, non i documenti', async () => {
    const scheda = await chiedi('GET', `/api/clienti/${rossi}`);
    expect(scheda.statusCode).toBe(200);
    const dati = scheda.json<SchedaCliente>();
    expect(dati.documenti).toBe(2);
    expect(dati.chat).toEqual({ totale: 0, attive: 0 });
    expect(dati.conversazioni).toEqual([]);
    /* I documenti non stanno nella scheda: si chiedono all'archivio, che sa
       già cercare e paginare. */
    expect(dati).not.toHaveProperty('elementi');
  });

  it('fonde due clienti sdoppiati, e i documenti seguono il vincitore', async () => {
    const doppione = await chiedi('POST', '/api/clienti', { nome: 'Rossi Mario Giuseppe' });
    rossiDoppione = doppione.json<Cliente>().id;
    await chiedi('POST', '/api/documenti-privati/assegna', {
      documenti: [DOC_B],
      clienteId: rossiDoppione,
    });

    const fusione = await chiedi('POST', `/api/clienti/${rossi}/fondi`, { assorbito: rossiDoppione });
    expect(fusione.statusCode).toBe(200);
    expect(fusione.json<Cliente>().documenti).toBe(2);
    expect(fusione.json<Cliente>().alias).toContain('Rossi Mario Giuseppe');

    const sparito = await chiedi('GET', `/api/clienti/${rossiDoppione}`);
    expect(sparito.statusCode).toBe(404);
  });

  it('eliminare dice sempre che fine fanno i documenti', async () => {
    /* Senza dirlo, i documenti restano e diventano «senza cliente»: è il
       default meno distruttivo, ed è dichiarato. */
    const eliminato = await chiedi('DELETE', `/api/clienti/${rossi}`);
    expect(eliminato.statusCode).toBe(204);

    const rimasti = await chiedi('GET', '/api/documenti-privati?senzaCliente=true');
    const ids = rimasti.json<PaginaDocumentiPrivati>().elementi.map((d) => d.id);
    expect(ids).toContain(DOC_A);
    expect(ids).toContain(DOC_B);
  });
});
