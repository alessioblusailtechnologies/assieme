import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import {
  schemaModificaChatCliente,
  schemaNuovaChatCliente,
  type ChatCliente,
  type LinkChatCliente,
} from '../../contratto/chat-clienti.js';
import { ErroreApi } from '../../contratto/errori.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { clientServizio } from '../../db/supabase.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { impronta, nuovoTokenOspite } from '../sessione/ospite.js';

/**
 * Le chat per i clienti dell'agenzia, dal lato dell'agenzia
 * (`VELIA-piano-chat-clienti.md`, Fase 2).
 *
 * Tutte le rotte sono **da amministratore**: aprire un canale diretto verso
 * un cliente, e decidere che cosa quel canale può leggere, non è
 * un'operazione da tutti i giorni e non è reversibile per chi l'ha già
 * ricevuto — il link resta nel telefono del cliente anche dopo.
 */

export interface OpzioniChatClienti {
  /** La radice dei link mandati ai clienti: `https://app…/c/<token>`. */
  baseLink?: string;
  /** Nei test: crea l'utenza ospite senza passare da Supabase Auth. */
  creaUtenzaOspite?: (email: string) => Promise<string>;
}

interface RigaChat {
  id: string;
  titolo: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  ospite_id: string;
  ospite_nome: string;
  ospite_cognome: string;
  stato: ChatCliente['stato'];
  scade_il: Date | null;
  tetto_domande: number | null;
  domande_fatte: number;
  istruzioni: string | null;
  created_at: Date;
  token: string | null;
}

const SQL_CHAT = `
  select k.id, k.titolo, k.cliente_id, cl.nome as cliente_nome,
         k.ospite_id, u.nome as ospite_nome, u.cognome as ospite_cognome,
         k.stato, k.scade_il, k.tetto_domande, k.domande_fatte, k.istruzioni, k.created_at, k.token
    from velia.chat_clienti k
    join velia.utenti u on u.id = k.ospite_id
    left join velia.clienti cl on cl.id = k.cliente_id`;

/**
 * L'email dell'utenza ospite.
 *
 * Non è un indirizzo a cui si scrive: l'ospite non riceve posta da noi e
 * non fa login con essa — entra dal link. Serve solo perché Supabase Auth
 * pretende un identificatore univoco, e per questo è costruita e non
 * chiesta: chiedere l'email vera del cliente farebbe credere che serva, e
 * la farebbe finire in un posto dove non ha ragione di stare.
 */
const emailOspite = (id: string): string => `ospite+${id}@chat.sonovelia.it`;

async function creaUtenzaSuAuth(email: string): Promise<string> {
  const { data, error } = await clientServizio().auth.admin.createUser({
    email,
    email_confirm: true,
    /* Nessuna password: da questa utenza non si fa mai login. L'unica via
       d'ingresso è il token del link, e la controlla `risolviOspite`. */
  });
  if (error || !data.user) {
    throw new ErroreApi(502, 'OSPITE_NON_CREATO', 'Non è stato possibile creare l’accesso del cliente.');
  }
  return data.user.id;
}

function versoChat(
  riga: RigaChat,
  aggiunti: Array<{ id: string; titolo: string }>,
  esclusi: Array<{ id: string; titolo: string }>,
  costoUsd: number,
  baseLink: string,
): ChatCliente {
  return {
    id: riga.id,
    titolo: riga.titolo,
    clienteId: riga.cliente_id!,
    clienteNome: riga.cliente_nome ?? '',
    ospite: { id: riga.ospite_id, nome: riga.ospite_nome, cognome: riga.ospite_cognome },
    stato: riga.stato,
    ...(riga.scade_il && { scadeIl: riga.scade_il.toISOString() }),
    ...(riga.tetto_domande !== null && { tettoDomande: riga.tetto_domande }),
    domandeFatte: riga.domande_fatte,
    ...(riga.istruzioni && { istruzioni: riga.istruzioni }),
    aggiunti,
    esclusi,
    creataIl: riga.created_at.toISOString(),
    ...(riga.token && { url: `${baseLink}/c/${riga.token}` }),
    costoUsd,
  };
}

/**
 * Quanto è costata ogni chat, con la connessione di sistema.
 *
 * Non si può calcolare nella query dell'elenco: quella gira sotto la RLS
 * con l'identità dell'amministratore, e per arrivare ai consumi bisogna
 * passare da `velia.jobs`, che a `authenticated` è negata. Il risultato
 * non sarebbe un errore ma **zero**, cioè un costo che sembra nullo su una
 * chat che sta spendendo: il genere di bugia che nessuno va a controllare.
 */
async function costiPerChat(tenantId: string): Promise<Map<string, number>> {
  const righe = await poolDb().query<{ chat_cliente_id: string; costo: string }>(
    `select v.chat_cliente_id, coalesce(sum(c.costo_usd), 0) as costo
       from velia.consumi c
       join velia.jobs j on j.id = c.job_id
       join velia.conversazioni v on v.id = (j.payload ->> 'conversazioneId')::uuid
      where c.tenant_id = $1 and v.chat_cliente_id is not null
      group by v.chat_cliente_id`,
    [tenantId],
  );
  return new Map(righe.rows.map((r) => [r.chat_cliente_id, Number(r.costo)]));
}

/**
 * Il cono di una o più chat: **gli extra**, non il cono intero.
 *
 * Dal 12/09/2026 il cono è il cliente — i suoi documenti, calcolati ogni
 * volta — e quello che si conserva qui sono gli scostamenti: i documenti
 * aggiunti a mano (i prodotti pubblici che lo riguardano, un documento
 * privato di un altro fascicolo) e quelli tolti a mano (una perizia
 * interna). L'elenco dei documenti del cliente non si scrive da nessuna
 * parte, perché cambia da sé quando l'agenzia ne carica uno nuovo.
 */
async function coniDi(
  client: pg.ClientBase,
  chatIds: string[],
): Promise<{
  aggiunti: Map<string, Array<{ id: string; titolo: string }>>;
  esclusi: Map<string, Array<{ id: string; titolo: string }>>;
}> {
  const aggiunti = new Map<string, Array<{ id: string; titolo: string }>>();
  const esclusi = new Map<string, Array<{ id: string; titolo: string }>>();
  if (!chatIds.length) return { aggiunti, esclusi };

  const d = await client.query<{
    chat_id: string;
    documento_id: string;
    titolo: string;
    escluso: boolean;
  }>(
    `select cd.chat_id, cd.documento_id, d.titolo, cd.escluso
       from velia.chat_clienti_documenti cd
       join velia.documenti d on d.id = cd.documento_id
      where cd.chat_id = any($1)`,
    [chatIds],
  );
  for (const r of d.rows) {
    const dove = r.escluso ? esclusi : aggiunti;
    const elenco = dove.get(r.chat_id) ?? [];
    elenco.push({ id: r.documento_id, titolo: r.titolo });
    dove.set(r.chat_id, elenco);
  }
  return { aggiunti, esclusi };
}

/**
 * Riscrive gli scostamenti del cono di una chat.
 *
 * Cancella e reinserisce invece di calcolare le differenze: sono poche
 * voci, e la sostituzione in blocco non lascia stati intermedi in cui il
 * cliente vedrebbe un cono a metà.
 */
async function scriviCono(
  client: pg.ClientBase,
  chatId: string,
  tenantId: string,
  aggiunti: string[] | undefined,
  esclusi: string[] | undefined,
): Promise<void> {
  if (!aggiunti && !esclusi) return;

  /* I documenti devono essere leggibili da questa agenzia: un pubblico
     qualsiasi, o un privato suo. Un id di un altro tenant qui dentro
     sarebbe una fuga scritta a mano; la RLS lo impedirebbe già, ma un 400
     dice all'agenzia che ha sbagliato invece di far sparire una riga in
     silenzio. */
  const controlla = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const valide = await client.query<{ n: string }>(
      `select count(*) as n from velia.documenti
        where id = any($1) and (archivio = 'pubblico' or tenant_id = $2)`,
      [ids, tenantId],
    );
    if (Number(valide.rows[0]?.n ?? 0) !== new Set(ids).size) {
      throw ErroreApi.datiNonValidi('Uno dei documenti scelti non esiste.');
    }
  };
  await controlla(aggiunti ?? []);
  await controlla(esclusi ?? []);

  const doppi = (aggiunti ?? []).filter((id) => (esclusi ?? []).includes(id));
  if (doppi.length) {
    throw ErroreApi.datiNonValidi('Un documento non può essere insieme aggiunto ed escluso.');
  }

  await client.query(`delete from velia.chat_clienti_documenti where chat_id = $1`, [chatId]);
  for (const id of new Set(aggiunti ?? [])) {
    await client.query(
      `insert into velia.chat_clienti_documenti (chat_id, documento_id, escluso)
       values ($1, $2, false)`,
      [chatId, id],
    );
  }
  for (const id of new Set(esclusi ?? [])) {
    await client.query(
      `insert into velia.chat_clienti_documenti (chat_id, documento_id, escluso)
       values ($1, $2, true)`,
      [chatId, id],
    );
  }
}


export function registraRotteChatClienti(app: FastifyInstance, opzioni: OpzioniChatClienti = {}): void {
  const creaUtenza = opzioni.creaUtenzaOspite ?? creaUtenzaSuAuth;
  const baseLink = opzioni.baseLink ?? process.env['BASE_LINK_CHAT'] ?? 'https://app-dev.sonovelia.it';

  /** L'elenco, con il cono di ciascuna e quanto è costata. */
  app.get('/api/chat-clienti', async (richiesta) => {
    richiediAmministratore(richiesta);
    const costi = await costiPerChat(richiesta.identita.tenantId);
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<ChatCliente[]> => {
      const righe = await client.query<RigaChat>(
        `${SQL_CHAT} where k.tenant_id = $1 order by k.created_at desc`,
        [richiesta.identita.tenantId],
      );
      const coni = await coniDi(
        client,
        righe.rows.map((r) => r.id),
      );
      return righe.rows.map((r) =>
        versoChat(
          r,
          coni.aggiunti.get(r.id) ?? [],
          coni.esclusi.get(r.id) ?? [],
          costi.get(r.id) ?? 0,
          baseLink,
        ),
      );
    });
  });

  /**
   * Crea la chat, l'utenza dell'ospite e il link, in quest'ordine.
   *
   * L'utenza su Supabase Auth si crea **prima** della transazione, perché
   * vive fuori dal database e non partecipa al rollback. Se poi la
   * transazione fallisce si rimuove a mano: un'utenza orfana non è un buco
   * di sicurezza (non ha chat, quindi non ha cono e non vede niente), ma è
   * sporcizia, e la sporcizia in un elenco di accessi è il modo in cui poi
   * nessuno guarda più quell'elenco.
   */
  app.post('/api/chat-clienti', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    const dati = schemaNuovaChatCliente.safeParse(richiesta.body ?? {});
    if (!dati.success) {
      throw ErroreApi.datiNonValidi('Servono almeno un titolo e il nome del cliente.');
    }

    const idOspite = randomUUID();
    const utenteAuth = await creaUtenza(emailOspite(idOspite));
    const token = nuovoTokenOspite();

    try {
      /* Il profilo si scrive con la connessione di sistema, come fa già
         l'invito di un collega (`utenti/rotte.ts`): `velia.utenti` non ha
         policy di scrittura, gli utenti li crea l'API. Il tenant lo mette
         lei, dall'identità di chi ha chiesto. */
      await poolDb().query(
        `insert into velia.utenti (id, tenant_id, nome, cognome, email, ruolo, stato)
         values ($1, $2, $3, $4, $5, 'ospite', 'attivo')`,
        [
          utenteAuth,
          richiesta.identita.tenantId,
          dati.data.nome,
          dati.data.cognome,
          emailOspite(idOspite),
        ],
      );

      const creata = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const chat = await client.query<{ id: string }>(
          `insert into velia.chat_clienti
             (tenant_id, cliente_id, ospite_id, titolo, istruzioni, token_hash, token,
              scade_il, tetto_domande, creata_da)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           returning id`,
          [
            richiesta.identita.tenantId,
            dati.data.clienteId ?? null,
            utenteAuth,
            dati.data.titolo,
            dati.data.istruzioni ?? null,
            impronta(token),
            token,
            dati.data.scadeIl ?? null,
            dati.data.tettoDomande ?? null,
            richiesta.identita.utenteId,
          ],
        );
        const chatId = chat.rows[0]!.id;
        await scriviCono(
          client,
          chatId,
          richiesta.identita.tenantId,
          dati.data.aggiunti,
          dati.data.esclusi,
        );
        return chatId;
      });

     const esito: LinkChatCliente = { chatId: creata, url: `${baseLink}/c/${token}` };
      return await risposta.code(201).send(esito);
    } catch (errore) {
      /* La transazione è andata indietro; il profilo e l'utenza su Auth no,
         perché stanno fuori. Si rimuovono a mano, nell'ordine inverso. */
      await poolDb()
        .query(`delete from velia.utenti where id = $1`, [utenteAuth])
        .catch(() => undefined);
      await clientServizio()
        .auth.admin.deleteUser(utenteAuth)
        .catch(() => undefined);
      throw errore;
    }
  });

  /** Modifica: titolo, istruzioni, tetti, stato e cono. */
  app.patch('/api/chat-clienti/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const { id } = richiesta.params as { id: string };
    const dati = schemaModificaChatCliente.safeParse(richiesta.body ?? {});
    if (!dati.success) throw ErroreApi.datiNonValidi('Modifiche non valide.');

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<ChatCliente> => {
      const campi: string[] = [];
      const valori: unknown[] = [id];
      const aggiungi = (colonna: string, valore: unknown): void => {
        valori.push(valore);
        campi.push(`${colonna} = $${valori.length}`);
      };
      if (dati.data.titolo !== undefined) aggiungi('titolo', dati.data.titolo);
      if (dati.data.istruzioni !== undefined) aggiungi('istruzioni', dati.data.istruzioni);
      if (dati.data.scadeIl !== undefined) aggiungi('scade_il', dati.data.scadeIl);
      if (dati.data.tettoDomande !== undefined) aggiungi('tetto_domande', dati.data.tettoDomande);
      if (dati.data.stato !== undefined) aggiungi('stato', dati.data.stato);

      if (campi.length) {
        const esito = await client.query(
          `update velia.chat_clienti set ${campi.join(', ')} where id = $1`,
          valori,
        );
        if (!esito.rowCount) throw ErroreApi.nonTrovato('Questa chat non esiste.');
      }
      await scriviCono(
        client,
        id,
        richiesta.identita.tenantId,
        dati.data.aggiunti,
        dati.data.esclusi,
      );

      const righe = await client.query<RigaChat>(`${SQL_CHAT} where k.id = $1`, [id]);
      const riga = righe.rows[0];
      if (!riga) throw ErroreApi.nonTrovato('Questa chat non esiste.');
      const coni = await coniDi(client, [id]);
      const costi = await costiPerChat(richiesta.identita.tenantId);
      return versoChat(
        riga,
        coni.aggiunti.get(id) ?? [],
        coni.esclusi.get(id) ?? [],
        costi.get(id) ?? 0,
        baseLink,
      );
    });
  });

  /**
   * Rigenera il link: il vecchio smette di funzionare all'istante.
   *
   * È la via d'uscita quando un link finisce dove non doveva — inoltrato,
   * dimenticato su un computer condiviso. Sospendere spegne la chat per
   * tutti; rigenerare la tiene viva per chi riceverà il link nuovo.
   */
  app.post('/api/chat-clienti/:id/link', async (richiesta) => {
    richiediAmministratore(richiesta);
    const { id } = richiesta.params as { id: string };
    const token = nuovoTokenOspite();
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<LinkChatCliente> => {
      const esito = await client.query(
        `update velia.chat_clienti set token_hash = $2, token = $3 where id = $1`,
        [id, impronta(token), token],
      );
      if (!esito.rowCount) throw ErroreApi.nonTrovato('Questa chat non esiste.');
      return { chatId: id, url: `${baseLink}/c/${token}` };
    });
  });

  /**
   * Elimina la chat, e con lei l'utenza dell'ospite.
   *
   * Le conversazioni se ne vanno in cascata: sono la corrispondenza con
   * quel cliente su quel canale, e tenerle senza la chat vorrebbe dire
   * righe che nessuno sa più a chi appartengono. Chi vuole conservarle
   * sospende invece di eliminare.
   */
  app.delete('/api/chat-clienti/:id', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    const { id } = richiesta.params as { id: string };
    const ospite = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<{ ospite_id: string }>(
        `delete from velia.chat_clienti where id = $1 returning ospite_id`,
        [id],
      );
      const riga = righe.rows[0];
      if (!riga) throw ErroreApi.nonTrovato('Questa chat non esiste.');
      return riga.ospite_id;
    });
    /* Profilo e utenza stanno fuori dalla transazione, come alla creazione:
       `velia.utenti` non ha policy di scrittura, gli utenti li scrive l'API. */
    await poolDb().query(`delete from velia.utenti where id = $1`, [ospite]);
    await clientServizio()
      .auth.admin.deleteUser(ospite)
      .catch(() => undefined);
    return risposta.code(204).send();
  });
}
