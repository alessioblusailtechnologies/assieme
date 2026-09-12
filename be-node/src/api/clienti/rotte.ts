import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { cercaCandidati, creaCliente, fondiClienti } from '../../archivio/clienti.js';
import {
  schemaEliminaCliente,
  schemaFiltriClienti,
  schemaFusioneClienti,
  schemaModificheCliente,
  schemaNuovoCliente,
  type Cliente,
  type ModificheCliente,
  type PaginaClienti,
  type SchedaCliente,
} from '../../contratto/clienti.js';
import { ErroreApi } from '../../contratto/errori.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * I clienti (`PIANO-CLIENTI.md`, Fase 1).
 *
 * Le rotte c'erano già, dentro quelle delle cartelle: qui restano loro, e
 * l'albero non c'è più. Quello che cambia è il peso — il cliente non è più
 * il supporto della collocazione automatica, è l'entità attorno a cui gira
 * l'archivio — e le colonne che porta: recapiti, note, etichette, stato.
 *
 * Una regola attraversa tutto il file: **il quasi-doppione si dice prima**.
 * «Rossi M.» accanto a «Rossi Mario» è il modo in cui un'anagrafica si
 * sbriciola, costa una riga fermarlo, ed è un avviso e non un divieto —
 * chi sa quello che fa passa oltre con la fusione.
 */

interface RigaCliente {
  id: string;
  nome: string;
  tipo: 'persona' | 'azienda';
  codice_fiscale: string | null;
  partita_iva: string | null;
  alias: string[];
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  nato_il: string | null;
  note: string | null;
  etichette: string[];
  stato: 'attivo' | 'archiviato';
  documenti: number;
  created_at: Date | string;
}

function versoCliente(r: RigaCliente): Cliente {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    ...(r.codice_fiscale && { codiceFiscale: r.codice_fiscale }),
    ...(r.partita_iva && { partitaIva: r.partita_iva }),
    alias: r.alias ?? [],
    ...(r.email && { email: r.email }),
    ...(r.telefono && { telefono: r.telefono }),
    ...(r.indirizzo && { indirizzo: r.indirizzo }),
    /* Le colonne `date` di pg restano stringhe: non ci passa sopra un
       `new Date()`, che sposterebbe il compleanno di un fuso orario. */
    ...(r.nato_il && { natoIl: String(r.nato_il).slice(0, 10) }),
    ...(r.note && { note: r.note }),
    etichette: r.etichette ?? [],
    stato: r.stato,
    documenti: Number(r.documenti ?? 0),
    creatoIl: new Date(r.created_at).toISOString(),
  };
}

const SQL_CLIENTI = `
  select c.id, c.nome, c.tipo, c.codice_fiscale, c.partita_iva, c.alias,
         c.email, c.telefono, c.indirizzo, c.nato_il, c.note, c.etichette, c.stato,
         c.created_at,
         (select count(*) from velia.documenti d
           where d.tenant_id = c.tenant_id and d.cliente_id = c.id)::int as documenti
  from velia.clienti c
  where c.tenant_id = $1`;

export interface OpzioniClienti {
  /** Lo Storage, per portare via i file quando si elimina un cliente coi suoi documenti. */
  archivio?: ArchivioFile;
}

export function registraRotteClienti(app: FastifyInstance, opzioni: OpzioniClienti = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());

  app.get('/api/clienti', async (richiesta) => {
    const esito = schemaFiltriClienti.safeParse(richiesta.query);
    if (!esito.success) throw ErroreApi.datiNonValidi('Filtri non validi.');
    const filtri = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<PaginaClienti> => {
      const parametri: unknown[] = [richiesta.identita.tenantId];
      let dove = '';
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      if (filtri.q?.trim()) {
        const q = par(filtri.q.trim());
        /* Si cerca sul normalizzato: chi scrive «rossi mario» trova «Rossi
           Mario S.r.l.», ed è il punto di avere una normalizzazione sola.
           Codice fiscale e partita IVA si cercano com'è scritto, che è come
           lo si incolla da un documento. */
        dove += ` and (c.nome_normalizzato like '%' || velia.normalizza_nome(${q}) || '%'
                      or exists (select 1 from unnest(c.alias) a
                                 where velia.normalizza_nome(a) like '%' || velia.normalizza_nome(${q}) || '%')
                      or upper(coalesce(c.codice_fiscale, '')) like '%' || upper(${q}) || '%'
                      or coalesce(c.partita_iva, '') like '%' || ${q} || '%')`;
      }
      if (filtri.etichetta) dove += ` and ${par(filtri.etichetta)} = any(c.etichette)`;
      if (filtri.tipo) dove += ` and c.tipo = ${par(filtri.tipo)}`;
      if (filtri.stato) dove += ` and c.stato = ${par(filtri.stato)}`;

      const conta = await client.query<{ totale: string }>(
        `select count(*) as totale from velia.clienti c where c.tenant_id = $1${dove}`,
        parametri,
      );
      parametri.push(filtri.perPagina, (filtri.pagina - 1) * filtri.perPagina);
      const righe = await client.query<RigaCliente>(
        `${SQL_CLIENTI}${dove} order by c.nome collate "it-x-icu"
         limit $${parametri.length - 1} offset $${parametri.length}`,
        parametri,
      );
      return {
        elementi: righe.rows.map(versoCliente),
        totale: Number(conta.rows[0]?.totale ?? 0),
        pagina: filtri.pagina,
        perPagina: filtri.perPagina,
      };
    });
  });

  /**
   * La scheda: il cliente più ciò che di lui non si vede altrove.
   *
   * I suoi **documenti non stanno qui**: si chiedono all'archivio con
   * `GET /api/documenti-privati?clienteId=`, che ha già ricerca, faccette e
   * paginazione. Una seconda rotta che restituisse gli stessi documenti con
   * meno capacità sarebbe un contratto in più da tenere allineato, e la
   * schermata del cliente finirebbe per essere più povera dell'archivio.
   */
  app.get<{ Params: { id: string } }>('/api/clienti/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<SchedaCliente> => {
      const { tenantId } = richiesta.identita;
      const cliente = await clienteSingolo(client, tenantId, richiesta.params.id);
      if (!cliente) throw ErroreApi.nonTrovato('Cliente inesistente.');

      const [conversazioni, chat, scadenze] = await Promise.all([
        client.query<{ id: string; titolo: string; updated_at: Date }>(
          `select id, titolo, updated_at from velia.conversazioni
           where tenant_id = $1 and cliente_id = $2
           order by updated_at desc limit 20`,
          [tenantId, cliente.id],
        ),
        client.query<{ totale: number; attive: number }>(
          `select count(*)::int as totale,
                  count(*) filter (where stato = 'attiva')::int as attive
             from velia.chat_clienti where tenant_id = $1 and cliente_id = $2`,
          [tenantId, cliente.id],
        ),
        /* Solo quelle che devono ancora arrivare: uno scadenzario che
           comincia dal 2019 non è uno scadenzario. */
        client.query<{ id: string; titolo: string; numero_polizza: string | null; scadenza: string }>(
          `select id, titolo, numero_polizza, to_char(scadenza, 'YYYY-MM-DD') as scadenza
             from velia.documenti
            where tenant_id = $1 and cliente_id = $2 and scadenza is not null
              and scadenza >= current_date
            order by scadenza limit 20`,
          [tenantId, cliente.id],
        ),
      ]);

      return {
        ...cliente,
        conversazioni: conversazioni.rows.map((c) => ({
          id: c.id,
          titolo: c.titolo,
          aggiornataIl: new Date(c.updated_at).toISOString(),
        })),
        chat: {
          totale: chat.rows[0]?.totale ?? 0,
          attive: chat.rows[0]?.attive ?? 0,
        },
        scadenze: scadenze.rows.map((s) => ({
          documentoId: s.id,
          titolo: s.titolo,
          ...(s.numero_polizza && { numeroPolizza: s.numero_polizza }),
          scadenza: s.scadenza,
        })),
      };
    });
  });

  /**
   * L'eliminazione dice sempre che fine fanno i suoi documenti.
   *
   * Non c'è un default a caso: portarsi via i documenti senza dirlo è il
   * modo in cui si perde roba, e lasciarli senza dirlo è il modo in cui si
   * scopre un mese dopo che l'archivio è pieno di orfani. Le sue chat se ne
   * vanno comunque (il `cascade` a database): una chat senza cliente non
   * saprebbe più che cosa leggere.
   */
  app.delete<{ Params: { id: string } }>('/api/clienti/:id', async (richiesta, risposta) => {
    const scelta = schemaEliminaCliente.safeParse(richiesta.query ?? {});
    if (!scelta.success) throw ErroreApi.datiNonValidi('Dire che fine fanno i documenti.');

    const daPulire = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const esiste = await client.query(
        `select 1 from velia.clienti where id = $1 and tenant_id = $2`,
        [richiesta.params.id, tenantId],
      );
      if (!esiste.rowCount) throw ErroreApi.nonTrovato('Cliente inesistente.');

      let percorsi: string[] = [];
      if (scelta.data.documenti === 'elimina') {
        const righe = await client.query<{ path_pdf: string | null; path_md: string | null }>(
          `delete from velia.documenti
            where tenant_id = $1 and cliente_id = $2 and archivio = 'privato'
            returning path_pdf, path_md`,
          [tenantId, richiesta.params.id],
        );
        percorsi = righe.rows.flatMap((r) => [r.path_pdf, r.path_md]).filter((p): p is string => Boolean(p));
      }
      await client.query(`delete from velia.clienti where id = $1 and tenant_id = $2`, [
        richiesta.params.id,
        tenantId,
      ]);
      return percorsi;
    });

    /* Lo Storage si svuota dopo la transazione: se i byte non se ne vanno
       resta qualche file muto, non una riga che punta al nulla. */
    if (daPulire.length) {
      await archivio()
        .elimina(daPulire)
        .catch((e: unknown) => richiesta.log.warn({ err: e }, 'pulizia storage del cliente fallita'));
    }
    return risposta.code(204).send();
  });

  /** Le etichette dei clienti in uso, con quanti clienti le portano. */
  app.get('/api/clienti/etichette', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<{ nome: string; clienti: number }>(
        `select e as nome, count(*)::int as clienti
           from velia.clienti c cross join unnest(c.etichette) as e
          where c.tenant_id = $1
          group by e
          order by count(*) desc, e collate "it-x-icu"`,
        [richiesta.identita.tenantId],
      );
      return righe.rows;
    });
  });

  app.post('/api/clienti', async (richiesta, risposta) => {
    const esito = schemaNuovoCliente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Dati del cliente non validi.');
    const dati = esito.data;

    const creato = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const simili = await cercaCandidati(client, tenantId, dati.nome);
      const gemello = simili.find((s) => s.somiglianza >= 0.85);
      if (gemello) {
        throw ErroreApi.conflitto(
          'CLIENTE_SIMILE',
          `C'è già «${gemello.nome}»: se è lo stesso cliente usa quello, altrimenti aggiungi qualcosa che li distingua.`,
        );
      }
      const cliente = await creaCliente(client, tenantId, dati.nome, {
        tipo: dati.tipo,
        codiceFiscale: dati.codiceFiscale ?? null,
        partitaIva: dati.partitaIva ?? null,
      });
      await applicaModifiche(client, tenantId, cliente.id, dati);
      return clienteSingolo(client, tenantId, cliente.id);
    });
    void risposta.code(201);
    return creato;
  });

  app.patch<{ Params: { id: string } }>('/api/clienti/:id', async (richiesta) => {
    const esito = schemaModificheCliente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al cliente non valide.');

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const toccate = await applicaModifiche(client, tenantId, richiesta.params.id, esito.data);
      if (toccate === 0) throw ErroreApi.nonTrovato('Cliente inesistente.');
      const cliente = await clienteSingolo(client, tenantId, richiesta.params.id);
      if (!cliente) throw ErroreApi.nonTrovato('Cliente inesistente.');
      return cliente;
    });
  });

  /**
   * La fusione: serve il giorno dopo l'importazione, non un mese dopo,
   * perché la prima cosa che un'agenzia vede è un paio di clienti sdoppiati.
   */
  app.post<{ Params: { id: string } }>('/api/clienti/:id/fondi', async (richiesta) => {
    const esito = schemaFusioneClienti.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Indicare il cliente da assorbire.');
    if (esito.data.assorbito === richiesta.params.id) {
      throw ErroreApi.datiNonValidi('Un cliente non si fonde con sé stesso.');
    }

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const esistono = await client.query(
        `select id from velia.clienti where tenant_id = $1 and id = any($2)`,
        [tenantId, [richiesta.params.id, esito.data.assorbito]],
      );
      if (esistono.rowCount !== 2) throw ErroreApi.nonTrovato('Cliente inesistente.');
      await fondiClienti(client, tenantId, richiesta.params.id, esito.data.assorbito);
      const cliente = await clienteSingolo(client, tenantId, richiesta.params.id);
      if (!cliente) throw ErroreApi.nonTrovato('Cliente inesistente.');
      return cliente;
    });
  });
}

/** Le colonne scrivibili, in un posto solo: creazione e modifica le condividono. */
async function applicaModifiche(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
  m: ModificheCliente,
): Promise<number> {
  const assegnazioni: string[] = [];
  const parametri: unknown[] = [id, tenantId];
  const par = (v: unknown): string => {
    parametri.push(v);
    return `$${parametri.length}`;
  };
  if (m.nome !== undefined) assegnazioni.push(`nome = ${par(m.nome)}`);
  if (m.tipo !== undefined) assegnazioni.push(`tipo = ${par(m.tipo)}`);
  if (m.codiceFiscale !== undefined) assegnazioni.push(`codice_fiscale = ${par(m.codiceFiscale || null)}`);
  if (m.partitaIva !== undefined) assegnazioni.push(`partita_iva = ${par(m.partitaIva || null)}`);
  if (m.alias !== undefined) assegnazioni.push(`alias = ${par([...new Set(m.alias)])}::text[]`);
  if (m.email !== undefined) assegnazioni.push(`email = ${par(m.email || null)}`);
  if (m.telefono !== undefined) assegnazioni.push(`telefono = ${par(m.telefono || null)}`);
  if (m.indirizzo !== undefined) assegnazioni.push(`indirizzo = ${par(m.indirizzo || null)}`);
  if (m.natoIl !== undefined) assegnazioni.push(`nato_il = ${par(m.natoIl || null)}::date`);
  if (m.note !== undefined) assegnazioni.push(`note = ${par(m.note || null)}`);
  if (m.etichette !== undefined) {
    assegnazioni.push(`etichette = ${par([...new Set(m.etichette)])}::text[]`);
  }
  if (m.stato !== undefined) assegnazioni.push(`stato = ${par(m.stato)}`);

  /* Niente da scrivere: si conferma solo che il cliente esista, o una PATCH
     vuota risponderebbe 200 su un id inventato. */
  if (!assegnazioni.length) {
    const r = await client.query(`select 1 from velia.clienti where id = $1 and tenant_id = $2`, [
      id,
      tenantId,
    ]);
    return r.rowCount ?? 0;
  }
  const r = await client.query(
    `update velia.clienti set ${assegnazioni.join(', ')} where id = $1 and tenant_id = $2`,
    parametri,
  );
  return r.rowCount ?? 0;
}

async function clienteSingolo(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<Cliente | undefined> {
  const r = await client.query<RigaCliente>(`${SQL_CLIENTI} and c.id = $2`, [tenantId, id]);
  const riga = r.rows[0];
  return riga ? versoCliente(riga) : undefined;
}
