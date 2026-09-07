import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { ChatCliente, LinkChatCliente } from '../src/contratto/chat-clienti.js';
import type { EsitoAccesso, SessioneOspite } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { clientServizio } from '../src/db/supabase.js';

/**
 * Il giro dell'agenzia: creare una chat per un cliente, comporne il cono,
 * ottenere il link, entrarci, e revocarlo.
 *
 * L'utenza dell'ospite qui si crea in locale invece che su Supabase Auth
 * (`creaUtenzaOspite`): la suite non deve lasciare utenti veri dietro di sé
 * in un progetto condiviso, e ciò che si vuole provare è il comportamento
 * dell'API, non l'Admin API di Supabase.
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
const BASE = 'https://prova.sonovelia.it';

const pool = () => poolDb();

describe.skipIf(!pronto)('Chat cliente · il giro dell’agenzia', () => {
  let app: FastifyInstance;
  let token = '';
  let cartellaRossi = '';
  let cartellaBianchi = '';
  let pubblico = '';
  /** Le utenze finte create dai test, da ripulire alla fine. */
  const ospitiCreati: string[] = [];

  const comeAgenzia = (metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = creaApp({
      logger: false,
      chatClienti: {
        baseLink: BASE,
        /* L'utenza si crea per davvero, con l'Admin API: `velia.utenti` ha
           una chiave esterna su `auth.users`, e il pool dell'applicazione
           su quella tabella non ha permessi (giustamente). Si tiene nota
           degli id per cancellarli alla fine. */
        creaUtenzaOspite: async (email) => {
          const { data, error } = await clientServizio().auth.admin.createUser({
            email,
            email_confirm: true,
          });
          if (error || !data.user) throw error ?? new Error('utenza ospite non creata');
          ospitiCreati.push(data.user.id);
          return data.user.id;
        },
      },
    });
    await app.ready();
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;

    await pulisci();
    const rossi = await pool().query<{ id: string }>(
      `insert into velia.cartelle (tenant_id, nome, slug) values ($1, 'Rossi Mario', 'rossi-api') returning id`,
      [TENANT],
    );
    cartellaRossi = rossi.rows[0]!.id;
    const bianchi = await pool().query<{ id: string }>(
      `insert into velia.cartelle (tenant_id, nome, slug) values ($1, 'Bianchi Luigi', 'bianchi-api') returning id`,
      [TENANT],
    );
    cartellaBianchi = bianchi.rows[0]!.id;
    const doc = await pool().query<{ id: string }>(
      `select id from velia.documenti where archivio = 'pubblico' order by id limit 1`,
    );
    pubblico = doc.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await pulisci();
    await app.close();
    await chiudiPool();
  });

  async function pulisci(): Promise<void> {
    await pool().query(`delete from velia.chat_clienti where tenant_id = $1`, [TENANT]);
    await pool().query(`delete from velia.utenti where tenant_id = $1 and ruolo = 'ospite'`, [TENANT]);
    for (const id of ospitiCreati) {
      await clientServizio()
        .auth.admin.deleteUser(id)
        .catch(() => undefined);
    }
    ospitiCreati.length = 0;
    await pool().query(`delete from velia.cartelle where tenant_id = $1`, [TENANT]);
  }

  it('crea la chat, il cono e il link in un colpo solo', async () => {
    const creata = await comeAgenzia('POST', '/api/chat-clienti', {
      titolo: 'Mario Rossi — polizza auto',
      nome: 'Mario',
      cognome: 'Rossi',
      istruzioni: 'È cliente dal 1998: dagli del tu.',
      cartelle: [cartellaRossi],
      documenti: [pubblico],
    });
    expect(creata.statusCode).toBe(201);
    const link = creata.json<LinkChatCliente>();
    expect(link.url.startsWith(`${BASE}/c/`)).toBe(true);

    /* Il link apre la chat, e dice di chi è l'agenzia. */
    const ingresso = await app.inject({
      method: 'POST',
      url: '/api/sessione/ospite',
      payload: { token: link.url.split('/c/')[1] },
    });
    expect(ingresso.statusCode).toBe(200);
    const sessione = ingresso.json<SessioneOspite>();
    expect(sessione.ospite.nome).toBe('Mario');
    expect(sessione.agenzia.nome).toContain('Collaudo');
    expect(sessione.chat.id).toBe(link.chatId);
  });

  it('l’elenco mostra il cono come l’agenzia l’ha composto', async () => {
    const elenco = await comeAgenzia('GET', '/api/chat-clienti');
    expect(elenco.statusCode).toBe(200);
    const chat = elenco.json<ChatCliente[]>()[0]!;
    expect(chat.cartelle.map((c) => c.percorso)).toEqual(['Rossi Mario']);
    expect(chat.documenti.map((d) => d.id)).toEqual([pubblico]);
    expect(chat.domandeFatte).toBe(0);
    expect(chat.costoUsd).toBe(0);
    /* Le istruzioni tornano all'agenzia, che le ha scritte: è al cliente
       che non si mostrano. */
    expect(chat.istruzioni).toContain('cliente dal 1998');
  });

  it('rifiuta una cartella che non è dell’agenzia', async () => {
    const elenco = await comeAgenzia('GET', '/api/chat-clienti');
    const chat = elenco.json<ChatCliente[]>()[0]!;
    const esito = await comeAgenzia('PATCH', `/api/chat-clienti/${chat.id}`, {
      cartelle: [randomUUID()],
    });
    /* Un 400 dice all'agenzia che ha sbagliato; la RLS da sola avrebbe
       fatto sparire la riga in silenzio. */
    expect(esito.statusCode).toBe(400);
  });

  it('rigenerare il link spegne il precedente', async () => {
    const creata = await comeAgenzia('POST', '/api/chat-clienti', {
      titolo: 'Luigi Bianchi',
      nome: 'Luigi',
      cognome: 'Bianchi',
      cartelle: [cartellaBianchi],
    });
    const vecchio = creata.json<LinkChatCliente>();
    const nuovo = await comeAgenzia('POST', `/api/chat-clienti/${vecchio.chatId}/link`);
    expect(nuovo.statusCode).toBe(200);

    const conVecchio = await app.inject({
      method: 'POST',
      url: '/api/sessione/ospite',
      payload: { token: vecchio.url.split('/c/')[1] },
    });
    expect(conVecchio.statusCode).toBe(401);

    const conNuovo = await app.inject({
      method: 'POST',
      url: '/api/sessione/ospite',
      payload: { token: nuovo.json<LinkChatCliente>().url.split('/c/')[1] },
    });
    expect(conNuovo.statusCode).toBe(200);
  });

  it('sospendere chiude la porta senza cancellare niente', async () => {
    const creata = await comeAgenzia('POST', '/api/chat-clienti', {
      titolo: 'Da sospendere',
      nome: 'Anna',
      cognome: 'Verdi',
    });
    const link = creata.json<LinkChatCliente>();
    await comeAgenzia('PATCH', `/api/chat-clienti/${link.chatId}`, { stato: 'sospesa' });

    const dopo = await app.inject({
      method: 'POST',
      url: '/api/sessione/ospite',
      payload: { token: link.url.split('/c/')[1] },
    });
    expect(dopo.statusCode).toBe(401);

    /* La chat resta, con la sua corrispondenza: sospendere non è eliminare. */
    const elenco = await comeAgenzia('GET', '/api/chat-clienti');
    expect(elenco.json<ChatCliente[]>().some((c) => c.id === link.chatId)).toBe(true);
  });

  it('un operatore non crea chat per i clienti', async () => {
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.due@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    const esito = await app.inject({
      method: 'POST',
      url: '/api/chat-clienti',
      headers: { authorization: `Bearer ${accesso.json<EsitoAccesso>().tokenAccesso}` },
      payload: { titolo: 'Abusiva', nome: 'X', cognome: 'Y' },
    });
    /* Aprire un canale verso un cliente, e decidere che cosa può leggere,
       non è un'operazione da tutti i giorni. */
    expect(esito.statusCode).toBe(403);
  });
});
