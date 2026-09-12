import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { cercaCandidati, creaCliente, fondiClienti } from '../../archivio/clienti.js';
import {
  schemaFiltriClienti,
  schemaFusioneClienti,
  schemaModificheCliente,
  schemaNuovoCliente,
  type Cliente,
  type ModificheCliente,
  type PaginaClienti,
} from '../../contratto/clienti.js';
import { ErroreApi } from '../../contratto/errori.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';

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

export function registraRotteClienti(app: FastifyInstance): void {
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

  app.get<{ Params: { id: string } }>('/api/clienti/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const cliente = await clienteSingolo(client, richiesta.identita.tenantId, richiesta.params.id);
      if (!cliente) throw ErroreApi.nonTrovato('Cliente inesistente.');
      return cliente;
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
