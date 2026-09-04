import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import { assicuraCartella, percorsoDi, caricaCartelle, indicizza } from '../src/archivio/albero.js';
import { risolviProposta } from '../src/archivio/proposta.js';
import type { Conversazione, EsitoProposta, Messaggio } from '../src/contratto/conversazioni.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';

/**
 * L'assistente propone, l'utente approva (04/09/2026).
 *
 * Quello che questa suite deve dimostrare è una cosa sola, ed è la ragione
 * per cui la funzione esiste: **finché nessuno approva, l'archivio non
 * cambia**. Il motore non ha guadagnato uno strumento di scrittura; ha
 * guadagnato la possibilità di chiedere. Perciò si prova che una proposta
 * depositata non muove niente, che il clic la applica per intero e in ordine,
 * che il secondo clic non la riapplica, e che la proposta di un'altra agenzia
 * non si vede nemmeno.
 *
 * Come le altre suite d'integrazione: **worker di sviluppo fermo**.
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
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';
const EMAIL_ADMIN = 't.uno@collaudo.sonovelia.it';
const ID_DOCUMENTO = 'doc-priv-a1b2c3d4e5f6';

describe.skipIf(!pronto)('il riordino proposto in chat, e chi lo approva', () => {
  const pool = () => poolDb();
  let app: FastifyInstance;
  let token: string;
  let utenteId: string;
  let conversazioneId: string;
  let messaggioId: string;

  const richiedi = (metodo: 'GET' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({
      method: metodo,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload && { payload }),
    });

  async function pulisci(): Promise<void> {
    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.documenti where archivio = 'privato' and tenant_id = $1`, [
      TENANT_COLLAUDO,
    ]);
    await pool().query(`delete from velia.cartelle where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.convenzione_archivio where tenant_id = $1`, [
      TENANT_COLLAUDO,
    ]);
  }

  /** Deposita una proposta come farebbe il worker: connessione di sistema, nessuna scrittura sull'archivio. */
  async function deponi(
    operazioni: unknown,
    motivo = 'Il documento è del cliente, non di chi emette la fattura.',
  ): Promise<string> {
    const r = await pool().query<{ id: string }>(
      `insert into velia.proposte_archivio
         (tenant_id, conversazione_id, messaggio_id, operazioni, motivo)
       values ($1, $2, $3, $4::jsonb, $5) returning id`,
      [TENANT_COLLAUDO, conversazioneId, messaggioId, JSON.stringify(operazioni), motivo],
    );
    return r.rows[0]!.id;
  }

  beforeAll(async () => {
    app = creaApp({ logger: false });
    await app.ready();
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    const esito = accesso.json<EsitoAccesso>();
    token = esito.tokenAccesso;
    utenteId = esito.sessione.utente.id;
    await pulisci();

    /* Un archivio con una cartella «Clienti» e un documento in «Da
       sistemare»: la situazione da cui nasce ogni proposta vera. */
    await assicuraCartella(pool(), TENANT_COLLAUDO, { parentId: null, nome: 'Clienti' });
    await pool().query(
      `insert into velia.documenti (id, archivio, tenant_id, titolo, tipologia, stato,
         caricato_il, dimensione_byte, collocazione_da_confermare)
       values ($1, 'privato', $2, 'Fattura 2026/114', 'altro', 'pronto', now(), 10, true)`,
      [ID_DOCUMENTO, TENANT_COLLAUDO],
    );

    const creata = await app.inject({
      method: 'POST',
      url: '/api/conversazioni',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    conversazioneId = creata.json<Conversazione>().id;
    const m = await pool().query<{ id: string }>(
      `insert into velia.messaggi (conversazione_id, tenant_id, autore, testo)
       values ($1, $2, 'assistente', 'Ti propongo di sistemarla così.') returning id`,
      [conversazioneId, TENANT_COLLAUDO],
    );
    messaggioId = m.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await pulisci();
    await app.close();
    await chiudiPool();
  });

  // -------------------------------------------------------------------------

  it('traduce le parole del modello in operazioni, e rifiuta con un motivo ciò che non torna', async () => {
    const esito = await risolviProposta(pool(), TENANT_COLLAUDO, [
      { azione: 'crea-cartella', nome: 'Wiselyst S.r.l.', dentro: 'Clienti' },
      {
        azione: 'sposta-documento',
        documento: `tenant/documenti/Da sistemare/fattura--${ID_DOCUMENTO}.md`,
        verso: 'Clienti/Wiselyst S.r.l.',
      },
      /* Una cartella che non esiste e che nessuno sta creando: si rifiuta
         subito, così il modello si corregge dentro la stessa risposta invece
         di far vedere all'utente un riordino che non si applica. */
      { azione: 'sposta-documento', documento: ID_DOCUMENTO, verso: 'Compagnie/Zurich' },
      { azione: 'crea-cartella', nome: 'Clienti' },
    ]);

    expect(esito.operazioni).toHaveLength(2);
    expect(esito.operazioni[0]).toMatchObject({ azione: 'crea-cartella', nome: 'Wiselyst S.r.l.' });
    /* La destinazione è la cartella che la prima operazione creerà: niente id,
       si risolve al momento dell'applicazione. */
    expect(esito.operazioni[1]).toMatchObject({
      azione: 'sposta-documento',
      documentoId: ID_DOCUMENTO,
      verso: 'Clienti/Wiselyst S.r.l.',
    });
    expect(esito.operazioni[1]).not.toHaveProperty('versoId');
    expect(esito.rifiutate).toHaveLength(2);
    expect(esito.rifiutate.join(' ')).toContain('Compagnie/Zurich');
    expect(esito.rifiutate.join(' ')).toContain('esiste già');
  });

  it('depositata non muove niente, approvata muove tutto, e non si approva due volte', async () => {
    const risolta = await risolviProposta(pool(), TENANT_COLLAUDO, [
      { azione: 'crea-cartella', nome: 'Wiselyst S.r.l.', dentro: 'Clienti' },
      { azione: 'sposta-documento', documento: ID_DOCUMENTO, verso: 'Clienti/Wiselyst S.r.l.' },
    ]);
    const propostaId = await deponi(risolta.operazioni);

    /* Il punto di tutta la funzione: la proposta è depositata e l'archivio è
       fermo dov'era. */
    const prima = await pool().query<{ cartella_id: string | null }>(
      `select cartella_id from velia.documenti where id = $1`,
      [ID_DOCUMENTO],
    );
    expect(prima.rows[0]!.cartella_id).toBeNull();
    const cartellePrima = await caricaCartelle(pool(), TENANT_COLLAUDO);
    expect(cartellePrima.some((c) => c.nome === 'Wiselyst S.r.l.')).toBe(false);

    // La proposta viaggia col messaggio: chi ricarica la pagina la ritrova.
    const messaggi = (
      await richiedi('GET', `/api/conversazioni/${conversazioneId}/messaggi`)
    ).json<Messaggio[]>();
    expect(messaggi.find((m) => m.id === messaggioId)?.proposta).toMatchObject({
      id: propostaId,
      stato: 'proposta',
    });

    const approvata = await richiedi(
      'PATCH',
      `/api/conversazioni/${conversazioneId}/proposte/${propostaId}`,
      { decisione: 'approva' },
    );
    expect(approvata.statusCode).toBe(200);
    const esito = approvata.json<EsitoProposta>();
    expect(esito).toMatchObject({ fatte: 2, mancate: [] });
    expect(esito.proposta.stato).toBe('applicata');

    /* Applicata in ordine: la cartella creata dalla prima operazione è la
       destinazione della seconda. */
    const righe = await caricaCartelle(pool(), TENANT_COLLAUDO);
    const per = indicizza(righe);
    const dopo = await pool().query<{ cartella_id: string; collocazione_da_confermare: boolean }>(
      `select cartella_id, collocazione_da_confermare from velia.documenti where id = $1`,
      [ID_DOCUMENTO],
    );
    expect(percorsoDi(dopo.rows[0]!.cartella_id, per)).toBe('Clienti/Wiselyst S.r.l.');
    /* Approvare è spostare a mano: la collocazione non torna più in discussione. */
    expect(dopo.rows[0]!.collocazione_da_confermare).toBe(false);

    // Un secondo clic (doppio invio, due schede aperte) non riapplica niente.
    const ancora = await richiedi(
      'PATCH',
      `/api/conversazioni/${conversazioneId}/proposte/${propostaId}`,
      { decisione: 'approva' },
    );
    expect(ancora.statusCode).toBe(409);
    expect(ancora.json<CorpoErroreApi>().codice).toBe('PROPOSTA_GIA_DECISA');

    // E lo stato deciso resta attaccato al messaggio, per chi rilegge.
    const rilette = (
      await richiedi('GET', `/api/conversazioni/${conversazioneId}/messaggi`)
    ).json<Messaggio[]>();
    expect(rilette.find((m) => m.id === messaggioId)?.proposta?.stato).toBe('applicata');
  });

  it('annullata non tocca niente, e resta annullata', async () => {
    const propostaId = await deponi([
      { azione: 'crea-cartella', nome: 'Da non creare mai', dentro: undefined },
    ]);

    const r = await richiedi(
      'PATCH',
      `/api/conversazioni/${conversazioneId}/proposte/${propostaId}`,
      { decisione: 'annulla' },
    );
    expect(r.statusCode).toBe(200);
    expect(r.json<EsitoProposta>()).toMatchObject({ fatte: 0, mancate: [] });

    const righe = await caricaCartelle(pool(), TENANT_COLLAUDO);
    expect(righe.some((c) => c.nome === 'Da non creare mai')).toBe(false);

    const stato = await pool().query<{ stato: string; deciso_da: string | null }>(
      `select stato, deciso_da from velia.proposte_archivio where id = $1`,
      [propostaId],
    );
    expect(stato.rows[0]).toMatchObject({ stato: 'annullata', deciso_da: utenteId });
  });

  it('una proposta di un’altra conversazione non si decide da qui', async () => {
    const propostaId = await deponi([{ azione: 'crea-cartella', nome: 'Estranea' }]);
    const altra = await app.inject({
      method: 'POST',
      url: '/api/conversazioni',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const altraId = altra.json<Conversazione>().id;

    const r = await richiedi('PATCH', `/api/conversazioni/${altraId}/proposte/${propostaId}`, {
      decisione: 'approva',
    });
    expect(r.statusCode).toBe(404);

    const righe = await caricaCartelle(pool(), TENANT_COLLAUDO);
    expect(righe.some((c) => c.nome === 'Estranea')).toBe(false);
  });
});
