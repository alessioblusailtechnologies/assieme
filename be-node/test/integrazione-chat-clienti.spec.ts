import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configurazione, type Configurazione } from '../src/config.js';
import { conIdentita } from '../src/db/identita.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { impronta, nuovoTokenOspite, risolviOspite } from '../src/api/sessione/ospite.js';
import { MARCATORE_CITAZIONI, promptSistemaCliente } from '../src/worker/motore/regole.js';
import { documentiPerWorkspace } from '../src/worker/motore/workspace.js';

/**
 * Il confine della chat cliente, provato dal lato che conta: quello di chi
 * tenta di attraversarlo.
 *
 * Un ospite ha un `tenant_id` come tutti, e tutte le policy scritte prima
 * del 07/09/2026 dicono «questo tenant». Se le policy restrittive della
 * migrazione `20260907160000_chat_clienti` non funzionano, un cliente legge
 * l'agenzia intera: gli altri clienti, le istruzioni, gli utenti, l'archivio.
 *
 * Perciò qui non si prova che l'ospite veda il suo cono — quello è il caso
 * facile, e c'è. Si prova soprattutto **tutto ciò che non deve vedere**.
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
  config?.DATABASE_URL && !config.DATABASE_URL.includes('PASSWORD_MANCANTE'),
);

const TENANT = '22222222-2222-4222-8222-222222222222';
const EMAIL_OSPITE = 't.due@collaudo.sonovelia.it';
const EMAIL_AGENZIA = 't.uno@collaudo.sonovelia.it';

const DOC_ROSSI = 'doc-collaudo-cono-rossi';
const DOC_ROSSI_SOTTO = 'doc-collaudo-cono-rossi-sotto';
const DOC_BIANCHI = 'doc-collaudo-cono-bianchi';
const DOC_SENZA_CARTELLA = 'doc-collaudo-cono-orfano';

const pool = () => poolDb();

describe.skipIf(!pronto)('Chat cliente · il cono di lettura', () => {
  let ospiteId = '';
  let agenziaId = '';
  let chatId = '';
  let cartellaRossi = '';
  let cartellaBianchi = '';
  let pubblicoNelCono = '';
  let pubblicoFuori = '';
  let ruoloOriginale = 'operatore';

  /** L'identità che la RLS vede: i claim li costruisce `conIdentita`. */
  const ospite = () => ({ utenteId: ospiteId, tenantId: TENANT, ruolo: 'ospite' as const });

  beforeAll(async () => {
    const utenti = await pool().query<{ id: string; email: string; ruolo: string }>(
      `select id, email, ruolo from velia.utenti where email = any($1)`,
      [[EMAIL_OSPITE, EMAIL_AGENZIA]],
    );
    ospiteId = utenti.rows.find((u) => u.email === EMAIL_OSPITE)!.id;
    agenziaId = utenti.rows.find((u) => u.email === EMAIL_AGENZIA)!.id;
    ruoloOriginale = utenti.rows.find((u) => u.email === EMAIL_OSPITE)!.ruolo;
    await pool().query(`update velia.utenti set ruolo = 'ospite' where id = $1`, [ospiteId]);

    await pulisci();

    /* Due clienti dell'agenzia, con una cartella a testa; sotto Rossi una
       sottocartella, perché il cono è «la cartella e quello che c'è sotto». */
    const rossi = await pool().query<{ id: string }>(
      `insert into velia.cartelle (tenant_id, nome, slug) values ($1, 'Rossi Mario', 'rossi-mario') returning id`,
      [TENANT],
    );
    cartellaRossi = rossi.rows[0]!.id;
    const sotto = await pool().query<{ id: string }>(
      `insert into velia.cartelle (tenant_id, parent_id, nome, slug)
       values ($1, $2, 'Sinistri', 'sinistri') returning id`,
      [TENANT, cartellaRossi],
    );
    const bianchi = await pool().query<{ id: string }>(
      `insert into velia.cartelle (tenant_id, nome, slug) values ($1, 'Bianchi Luigi', 'bianchi-luigi') returning id`,
      [TENANT],
    );
    cartellaBianchi = bianchi.rows[0]!.id;

    const doc = (id: string, titolo: string, cartella: string | null) =>
      pool().query(
        `insert into velia.documenti
           (id, archivio, tenant_id, titolo, tipologia, stato, numero_pagine, path_md,
            cartella_id, caricato_il, dimensione_byte)
         values ($1, 'privato', $2, $3, 'polizza', 'pronto', 1, $4, $5, now(), 1000)`,
        [id, TENANT, titolo, `tenant/${TENANT}/documenti/${id}.md`, cartella],
      );
    await doc(DOC_ROSSI, 'Polizza auto Rossi', cartellaRossi);
    await doc(DOC_ROSSI_SOTTO, 'Sinistro 2026 Rossi', sotto.rows[0]!.id);
    await doc(DOC_BIANCHI, 'Polizza auto Bianchi', cartellaBianchi);
    await doc(DOC_SENZA_CARTELLA, 'Documento mai collocato', null);

    /* Due documenti pubblici veri: uno entra nel cono, l'altro no. */
    const pubblici = await pool().query<{ id: string }>(
      `select id from velia.documenti where archivio = 'pubblico' order by id limit 2`,
    );
    pubblicoNelCono = pubblici.rows[0]!.id;
    pubblicoFuori = pubblici.rows[1]!.id;

    const chat = await pool().query<{ id: string }>(
      `insert into velia.chat_clienti (tenant_id, ospite_id, titolo, token_hash, creata_da)
       values ($1, $2, 'Rossi Mario — polizza auto', 'hash-di-collaudo', $3) returning id`,
      [TENANT, ospiteId, agenziaId],
    );
    chatId = chat.rows[0]!.id;
    await pool().query(
      `insert into velia.chat_clienti_cartelle (chat_id, cartella_id) values ($1, $2)`,
      [chatId, cartellaRossi],
    );
    await pool().query(
      `insert into velia.chat_clienti_documenti (chat_id, documento_id) values ($1, $2)`,
      [chatId, pubblicoNelCono],
    );
  }, 60_000);

  afterAll(async () => {
    await pulisci();
    await pool().query(`update velia.utenti set ruolo = $2 where id = $1`, [ospiteId, ruoloOriginale]);
    await chiudiPool();
  });

  async function pulisci(): Promise<void> {
    await pool().query(`delete from velia.chat_clienti where tenant_id = $1`, [TENANT]);
    await pool().query(`delete from velia.documenti where id = any($1)`, [
      [DOC_ROSSI, DOC_ROSSI_SOTTO, DOC_BIANCHI, DOC_SENZA_CARTELLA],
    ]);
    await pool().query(`delete from velia.cartelle where tenant_id = $1`, [TENANT]);
  }

  /** Che cosa vede l'ospite in una tabella, con la sua identità. */
  const visti = (sql: string, parametri: unknown[] = []): Promise<Array<{ id: string }>> =>
    conIdentita(pool(), ospite(), async (c) => (await c.query<{ id: string }>(sql, parametri)).rows);

  // --- Quello che deve vedere ---------------------------------------------

  it('vede i documenti del cono, sottocartelle comprese', async () => {
    const righe = await visti(`select id from velia.documenti where archivio = 'privato' order by id`);
    expect(righe.map((r) => r.id)).toEqual([DOC_ROSSI, DOC_ROSSI_SOTTO]);
  });

  it('vede il documento pubblico scelto, e non gli altri', async () => {
    const righe = await visti(`select id from velia.documenti where archivio = 'pubblico'`);
    const ids = righe.map((r) => r.id);
    expect(ids).toContain(pubblicoNelCono);
    expect(ids).not.toContain(pubblicoFuori);
    /* L'Archivio Pubblico ha 175 documenti: al cliente ne arriva uno. */
    expect(ids).toHaveLength(1);
  });

  // --- Quello che NON deve vedere -----------------------------------------

  it('non vede i documenti di un altro cliente della stessa agenzia', async () => {
    const righe = await visti(`select id from velia.documenti where id = $1`, [DOC_BIANCHI]);
    expect(righe).toHaveLength(0);
  });

  it('non vede un documento privato che non è in nessuna cartella', async () => {
    /* Il default sicuro: ciò che non è stato messo da nessuna parte non è
       stato dato a nessuno. */
    const righe = await visti(`select id from velia.documenti where id = $1`, [DOC_SENZA_CARTELLA]);
    expect(righe).toHaveLength(0);
  });

  it('non vede la cartella di un altro cliente', async () => {
    const righe = await visti(`select id from velia.cartelle order by nome`);
    const ids = righe.map((r) => r.id);
    expect(ids).toContain(cartellaRossi);
    expect(ids).not.toContain(cartellaBianchi);
  });

  it('non vede l’anagrafica clienti, le istruzioni, gli utenti, i template', async () => {
    for (const tabella of ['clienti', 'istruzioni', 'utenti', 'template', 'agenti', 'segnalazioni']) {
      const righe = await visti(`select 1 from velia.${tabella}`);
      expect(righe, `l’ospite legge velia.${tabella}`).toHaveLength(0);
    }
  });

  it('non vede la memoria dell’agenzia', async () => {
    /* La policy dei ricordi passa per `ambito = 'tenant'`: senza la
       restrittiva, un ospite leggerebbe tutto ciò che l'agenzia ha imparato. */
    const righe = await visti(`select 1 from velia.ricordi`);
    expect(righe).toHaveLength(0);
  });

  it('non vede le conversazioni condivise dell’agenzia', async () => {
    const conv = await pool().query<{ id: string }>(
      `insert into velia.conversazioni (tenant_id, autore_id, titolo, condivisa)
       values ($1, $2, 'Riunione interna', true) returning id`,
      [TENANT, agenziaId],
    );
    try {
      /* La policy esistente dice «le mie **oppure** quelle condivise»: è la
         riga da cui un ospite entrerebbe nel lavoro interno dell'agenzia. */
      const righe = await visti(`select id from velia.conversazioni where id = $1`, [conv.rows[0]!.id]);
      expect(righe).toHaveLength(0);
    } finally {
      await pool().query(`delete from velia.conversazioni where id = $1`, [conv.rows[0]!.id]);
    }
  });

  it('non vede le tabelle di analisi condivise', async () => {
    const righe = await visti(`select 1 from velia.tabelle`);
    expect(righe).toHaveLength(0);
  });

  it('non può scrivere niente nell’archivio', async () => {
    await expect(
      conIdentita(pool(), ospite(), (c) =>
        c.query(
          `insert into velia.cartelle (tenant_id, nome, slug) values ($1, 'Abusiva', 'abusiva')`,
          [TENANT],
        ),
      ),
    ).rejects.toThrow();
  });

  // --- Il cono si chiude ---------------------------------------------------

  it('sospendere la chat svuota il cono all’istante', async () => {
    await pool().query(`update velia.chat_clienti set stato = 'sospesa' where id = $1`, [chatId]);
    try {
      const righe = await visti(`select id from velia.documenti where archivio = 'privato'`);
      expect(righe).toHaveLength(0);
    } finally {
      await pool().query(`update velia.chat_clienti set stato = 'attiva' where id = $1`, [chatId]);
    }
  });

  it('una chat scaduta non dà più niente', async () => {
    await pool().query(`update velia.chat_clienti set scade_il = now() - interval '1 minute' where id = $1`, [chatId]);
    try {
      const righe = await visti(`select id from velia.documenti where archivio = 'privato'`);
      expect(righe).toHaveLength(0);
    } finally {
      await pool().query(`update velia.chat_clienti set scade_il = null where id = $1`, [chatId]);
    }
  });

  // --- Il presidio fisico: la workspace del worker -------------------------

  it('la workspace di una chat cliente contiene solo il cono', async () => {
    /*
     * Il gemello del test sulla RLS, e il più importante dei due: il worker
     * parla al database con la connessione di sistema e **non passa dalla
     * RLS**. Se questa query sbaglia, non c'è una seconda rete sotto.
     *
     * Si prova la query di `materializzaWorkspace` così com'è, invece del
     * risultato su disco, perché è lì che sta la decisione: quello che la
     * query non restituisce non viene scritto, e quello che non è scritto il
     * motore non lo trova — ha Read, Grep e Glob confinati alla directory.
     */
    const dentro = await documentiPerWorkspace(pool(), {
      tenantId: TENANT,
      contestoIds: [],
      chatClienteId: chatId,
    });
    const ids = dentro.rows.map((r) => r.id).sort();

    expect(ids).toContain(DOC_ROSSI);
    expect(ids).toContain(DOC_ROSSI_SOTTO);
    expect(ids).toContain(pubblicoNelCono);
    expect(ids).not.toContain(DOC_BIANCHI);
    expect(ids).not.toContain(DOC_SENZA_CARTELLA);
    expect(ids).not.toContain(pubblicoFuori);
    expect(ids).toHaveLength(3);
  });

  it('senza chat cliente la workspace resta quella dell’agenzia', async () => {
    /* La stessa query, senza cono: l'agenzia continua a vedere tutto il
       proprio archivio e tutto il pubblico. Serve a garantire che il ramo
       nuovo non abbia cambiato il comportamento di sempre. */
    const tutto = await documentiPerWorkspace(pool(), { tenantId: TENANT, contestoIds: [] });
    const ids = tutto.rows.map((r) => r.id);
    expect(ids).toContain(DOC_BIANCHI);
    expect(ids).toContain(DOC_SENZA_CARTELLA);
    expect(ids).toContain(pubblicoFuori);
    expect(ids.length).toBeGreaterThan(100);
  });

  // --- L'ingresso dal link -------------------------------------------------

  it('il token del link apre la chat, e non vale più quando la si sospende', async () => {
    const token = nuovoTokenOspite();
    await pool().query(`update velia.chat_clienti set token_hash = $2 where id = $1`, [
      chatId,
      impronta(token),
    ]);

    const aperta = await risolviOspite(pool(), token);
    expect(aperta.chatId).toBe(chatId);
    expect(aperta.identita).toEqual({ utenteId: ospiteId, tenantId: TENANT, ruolo: 'ospite' });

    /* Revoca: la richiesta successiva non trova più un'identità da
       costruire. Effetto immediato, non a scadenza — è tutto il senso di
       non aver emesso nessun token. */
    await pool().query(`update velia.chat_clienti set stato = 'sospesa' where id = $1`, [chatId]);
    await expect(risolviOspite(pool(), token)).rejects.toThrow();
    await pool().query(`update velia.chat_clienti set stato = 'attiva' where id = $1`, [chatId]);
  });

  it('un token inventato non dice se la chat esista o no', async () => {
    /* Stesso errore per ogni ragione: chi ha in mano un link revocato non
       deve poter distinguere «non è mai esistito» da «è scaduto ieri». */
    await expect(risolviOspite(pool(), nuovoTokenOspite())).rejects.toThrow(
      /non è più valido/,
    );
  });

  it('finite le domande il link si chiude', async () => {
    const token = nuovoTokenOspite();
    await pool().query(
      `update velia.chat_clienti set token_hash = $2, tetto_domande = 3, domande_fatte = 3 where id = $1`,
      [chatId, impronta(token)],
    );
    try {
      await expect(risolviOspite(pool(), token)).rejects.toThrow();
    } finally {
      await pool().query(
        `update velia.chat_clienti set tetto_domande = null, domande_fatte = 0 where id = $1`,
        [chatId],
      );
    }
  });

  // --- Il prompt del cliente ------------------------------------------------

  it('il prompt del cliente non è quello dell’agenzia', () => {
    const cliente = promptSistemaCliente(null);

    /* Il registro: `REGOLE_MOTORE` si apre dichiarando che si risponde «per
       un professionista del settore», ed è la riga da cui discende tutto il
       resto. Qui dall'altra parte c'è chi la polizza la subisce. */
    expect(cliente).not.toContain('professionista del settore');
    expect(cliente).toContain('dando del lei');
    expect(cliente).toContain('Non sei un consulente');

    /* Il blocco che il validatore legge deve esserci, o ogni risposta
       verrebbe scartata senza che nessuno capisca perché. */
    expect(cliente).toContain(MARCATORE_CITAZIONI);
  });

  it('le istruzioni della chat entrano nel prompt, quelle dell’agenzia no', () => {
    const cliente = promptSistemaCliente('Al signor Rossi diamo del tu: è cliente dal 1998.');
    expect(cliente).toContain('cliente dal 1998');
    /* Il DNA d'Agenzia non compare: istruzioni e ricordi sono scritti per il
       lavoro interno e possono contenere criteri commerciali. */
    expect(cliente).not.toContain('DNA d’Agenzia');
  });

  // --- La guardia per il futuro -------------------------------------------

  it('ogni tabella dello schema appartiene a velia_app', async () => {
    /*
     * Non è pignoleria sui permessi: è la trappola in cui questa
     * funzionalità è già caduta una volta.
     *
     * `tools/applica-migrazione.mjs` passa dalla Management API, che esegue
     * come `postgres`: una tabella creata da una migrazione nasce di
     * `postgres`, mentre tutte le altre sono di `velia_app` — il ruolo con
     * cui l'applicazione si connette. Un proprietario non è soggetto alle
     * proprie policy, ed è così che il worker legge l'archivio con la
     * connessione di sistema; su una tabella altrui, invece, `velia_app` è
     * un utente qualsiasi e le policy scritte `to authenticated` non lo
     * riguardano. Risultato: zero righe, in silenzio.
     *
     * Si era manifestato come «il link del cliente non vale mai».
     */
    const straniere = await pool().query<{ relname: string; proprietario: string }>(
      `select c.relname, pg_get_userbyid(c.relowner) as proprietario
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'velia' and c.relkind = 'r'
          and pg_get_userbyid(c.relowner) <> 'velia_app'`,
    );
    expect(
      straniere.rows.map((r) => `${r.relname} (${r.proprietario})`),
      'tabelle non di velia_app: aggiungi «alter table … owner to velia_app» alla migrazione',
    ).toEqual([]);
  });

  it('ogni tabella nuova nasce negata all’ospite', async () => {
    /*
     * Questo test non prova la funzionalità: protegge la prossima persona.
     * Le policy restrittive coprono le tabelle esistenti al 07/09/2026; una
     * tabella aggiunta domani sarebbe aperta all'ospite in silenzio, perché
     * la policy la deve scrivere qualcuno. Qui il silenzio diventa rosso.
     */
    const senzaGuardia = await pool().query<{ relname: string }>(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_policy p on p.polrelid = c.oid and p.polpermissive = false
        where n.nspname = 'velia' and c.relkind = 'r'
        group by c.relname
       having count(p.oid) = 0`,
    );
    expect(
      senzaGuardia.rows.map((r) => r.relname),
      'tabelle senza policy restrittiva: decidi che cosa ne vede un ospite',
    ).toEqual([]);
  });
});
