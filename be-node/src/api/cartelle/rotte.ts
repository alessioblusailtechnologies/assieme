import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import {
  assicuraCartella,
  caricaCartelle,
  conteggiPerCartella,
  costruisciAlbero,
  eDiscendente,
  indicizza,
  percorsoDi,
  segnaDaRicalcolare,
  slugCartella,
} from '../../archivio/albero.js';
import { convenzioneEffettiva } from '../../archivio/convenzione.js';
import { cercaCandidati, creaCliente, fondiClienti } from '../../archivio/clienti.js';
import {
  schemaEliminaCartella,
  schemaFiltriClienti,
  schemaFusioneClienti,
  schemaModificheCartella,
  schemaModificheCliente,
  schemaModificheConvenzione,
  schemaNuovaCartella,
  schemaNuovoCliente,
  type AlberoCartelle,
  type Cartella,
  type Cliente,
  type Convenzione,
  type PaginaClienti,
} from '../../contratto/cartelle.js';
import { ErroreApi } from '../../contratto/errori.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { richiediAmministratore } from '../plugins/auth.js';

/**
 * Fase 10 — le cartelle, i clienti, la convenzione.
 *
 * L'albero è libero e l'utente ne è padrone: crea, rinomina, sposta, annida.
 * Quello che il sistema si riserva è di **osservare** la forma che ne esce e
 * di scriverla (`velia.convenzione_archivio`), per poi passarla al modello
 * quando deve collocare e quando deve cercare.
 *
 * Due regole attraversano tutte le rotte qui sotto:
 *
 * 1. **La mano vince.** Una descrizione scritta da un umano non viene mai
 *    sovrascritta dal ricalcolo; uno spostamento fatto a mano fissa la
 *    collocazione e nessun ricalcolo la rimette in discussione.
 * 2. **Il ricalcolo scatta sulla struttura, non sui documenti.** Creare,
 *    rinominare, spostare o eliminare una cartella marca la convenzione da
 *    rifare; caricare il duecentesimo preventivo dentro una cartella di
 *    preventivi non cambia niente e non ricalcola niente.
 */

interface RigaCliente {
  id: string;
  nome: string;
  tipo: 'persona' | 'azienda';
  codice_fiscale: string | null;
  partita_iva: string | null;
  alias: string[];
  documenti: number;
  cartella_id: string | null;
  totale?: string;
}

function versoCliente(r: RigaCliente): Cliente {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    ...(r.codice_fiscale && { codiceFiscale: r.codice_fiscale }),
    ...(r.partita_iva && { partitaIva: r.partita_iva }),
    alias: r.alias ?? [],
    documenti: Number(r.documenti ?? 0),
    ...(r.cartella_id && { cartellaId: r.cartella_id }),
  };
}

const SQL_CLIENTI = `
  select c.id, c.nome, c.tipo, c.codice_fiscale, c.partita_iva, c.alias,
         (select count(*) from velia.documenti d
           where d.tenant_id = c.tenant_id and d.cliente_id = c.id)::int as documenti,
         (select f.id from velia.cartelle f
           where f.tenant_id = c.tenant_id and f.cliente_id = c.id limit 1) as cartella_id
  from velia.clienti c
  where c.tenant_id = $1`;

export function registraRotteCartelle(app: FastifyInstance): void {
  // -------------------------------------------------------------------------
  // Cartelle
  // -------------------------------------------------------------------------

  /** L'albero intero: è piccolo (cartelle, non documenti) e il FE lo tiene aperto. */
  app.get('/api/cartelle', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<AlberoCartelle> => {
      const { tenantId } = richiesta.identita;
      const [righe, conteggi, daSistemare] = await Promise.all([
        caricaCartelle(client, tenantId),
        conteggiPerCartella(client, tenantId),
        client.query<{ quanti: number }>(
          `select count(*)::int as quanti from velia.documenti
           where archivio = 'privato' and tenant_id = $1 and cartella_id is null`,
          [tenantId],
        ),
      ]);
      return {
        radici: costruisciAlbero(righe, conteggi),
        daSistemare: daSistemare.rows[0]?.quanti ?? 0,
      };
    });
  });

  app.post('/api/cartelle', async (richiesta, risposta) => {
    const esito = schemaNuovaCartella.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Dati della cartella non validi.');
    const dati = esito.data;

    const creata = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      if (dati.parentId) await esisteCartella(client, tenantId, dati.parentId);

      /* Il quasi-duplicato fra sorelle si dice **prima**, non dopo: creare
         «Rossi M.» accanto a «Rossi Mario» è il modo in cui un albero libero
         si sbriciola, e costa una riga fermarlo. */
      const gemella = dati.consentiSimile
        ? null
        : await sorellaSimile(client, tenantId, dati.parentId ?? null, dati.nome);
      if (gemella) {
        throw ErroreApi.conflitto(
          'CARTELLA_SIMILE',
          `Qui accanto c'è già «${gemella}»: se è la stessa cosa usa quella, altrimenti dai un nome che le distingua.`,
        );
      }

      const id = await assicuraCartella(client, tenantId, {
        parentId: dati.parentId ?? null,
        nome: dati.nome,
        ...(dati.descrizione && { descrizione: dati.descrizione }),
      });
      if (dati.descrizione) {
        await client.query(
          `update velia.cartelle set descrizione = $2, descrizione_da_utente = true where id = $1`,
          [id, dati.descrizione],
        );
      }
      await segnaDaRicalcolare(client, tenantId);
      return cartellaSingola(client, tenantId, id);
    });
    void risposta.code(201);
    return creata;
  });

  /** Rinomina, sposta, descrivi: le tre cose che si fanno a una cartella. */
  app.patch<{ Params: { id: string } }>('/api/cartelle/:id', async (richiesta) => {
    const esito = schemaModificheCartella.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche alla cartella non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const righe = await caricaCartelle(client, tenantId);
      const per = indicizza(righe);
      if (!per.has(richiesta.params.id)) throw ErroreApi.nonTrovato('Cartella inesistente.');

      const assegnazioni: string[] = [];
      const parametri: unknown[] = [richiesta.params.id, tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };

      if (m.nome !== undefined) {
        assegnazioni.push(`nome = ${par(m.nome)}`, `slug = ${par(slugCartella(m.nome))}`);
      }
      if (m.parentId !== undefined) {
        if (m.parentId) {
          if (!per.has(m.parentId)) throw ErroreApi.datiNonValidi('Cartella di destinazione inesistente.');
          /* Una cartella dentro sé stessa taglia via il suo sottoalbero
             dall'albero: l'unico modo di perdere documenti senza cancellarli. */
          if (eDiscendente(m.parentId, richiesta.params.id, per)) {
            throw ErroreApi.conflitto(
              'DESTINAZIONE_INTERNA',
              'Non si può spostare una cartella dentro sé stessa o dentro una sua sottocartella.',
            );
          }
        }
        assegnazioni.push(`parent_id = ${par(m.parentId)}`);
      }
      if (m.descrizione !== undefined) {
        /* Scritta da un umano: da adesso il ricalcolo non la tocca più.
           Svuotarla la restituisce all'osservazione. */
        assegnazioni.push(
          `descrizione = ${par(m.descrizione || null)}`,
          `descrizione_da_utente = ${par(Boolean(m.descrizione))}`,
        );
      }
      if (!assegnazioni.length) return cartellaSingola(client, tenantId, richiesta.params.id);

      try {
        await client.query(
          `update velia.cartelle set ${assegnazioni.join(', ')} where id = $1 and tenant_id = $2`,
          parametri,
        );
      } catch (errore) {
        if ((errore as { code?: string }).code === '23505') {
          throw ErroreApi.conflitto(
            'CARTELLA_ESISTENTE',
            'Lì dentro c\'è già una cartella con questo nome.',
          );
        }
        throw errore;
      }
      if (m.nome !== undefined || m.parentId !== undefined) {
        await segnaDaRicalcolare(client, tenantId);
      }
      return cartellaSingola(client, tenantId, richiesta.params.id);
    });
  });

  /**
   * L'eliminazione dice sempre che fine fanno i documenti: `da-sistemare`
   * (predefinito) o `al-padre`. Una cartella che sparisce portandosi via
   * quello che aveva dentro senza dirlo è il modo in cui si perde roba.
   */
  app.delete<{ Params: { id: string } }>('/api/cartelle/:id', async (richiesta, risposta) => {
    const esito = schemaEliminaCartella.safeParse(richiesta.query ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Parametri di eliminazione non validi.');

    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const righe = await caricaCartelle(client, tenantId);
      const per = indicizza(righe);
      const cartella = per.get(richiesta.params.id);
      if (!cartella) throw ErroreApi.nonTrovato('Cartella inesistente.');

      // Il sottoalbero se ne va con lei (`on delete cascade`): i documenti
      // dentro vanno spostati prima, tutti, non solo quelli del primo livello.
      const dentro = righe
        .filter((r) => eDiscendente(r.id, richiesta.params.id, per))
        .map((r) => r.id);
      const destinazione = esito.data.documenti === 'al-padre' ? cartella.parent_id : null;
      await client.query(
        `update velia.documenti
         set cartella_id = $3, collocazione_da_confermare = false
         where tenant_id = $1 and cartella_id = any($2)`,
        [tenantId, dentro, destinazione],
      );
      await client.query(`delete from velia.cartelle where id = $1 and tenant_id = $2`, [
        richiesta.params.id,
        tenantId,
      ]);
      await segnaDaRicalcolare(client, tenantId);
    });
    return risposta.code(204).send();
  });

  // -------------------------------------------------------------------------
  // Clienti
  // -------------------------------------------------------------------------

  app.get('/api/clienti', async (richiesta) => {
    const esito = schemaFiltriClienti.safeParse(richiesta.query);
    if (!esito.success) throw ErroreApi.datiNonValidi('Filtri non validi.');
    const filtri = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<PaginaClienti> => {
      const parametri: unknown[] = [richiesta.identita.tenantId];
      let dove = '';
      if (filtri.q?.trim()) {
        parametri.push(filtri.q.trim());
        /* Si cerca sul normalizzato: chi scrive «rossi mario» trova «Rossi
           Mario S.r.l.», ed è il punto di avere una normalizzazione sola. */
        dove = ` and (c.nome_normalizzato like '%' || velia.normalizza_nome($2) || '%'
                      or exists (select 1 from unnest(c.alias) a
                                 where velia.normalizza_nome(a) like '%' || velia.normalizza_nome($2) || '%'))`;
      }
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

  app.post('/api/clienti', async (richiesta, risposta) => {
    const esito = schemaNuovoCliente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Dati del cliente non validi.');
    const dati = esito.data;

    const creato = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      /* Anche qui il quasi-duplicato si dice prima: è il posto in cui
         nascono i «Rossi Mario» in tre forme. */
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
      if (dati.alias?.length) {
        await client.query(`update velia.clienti set alias = $2::text[] where id = $1`, [
          cliente.id,
          [...new Set(dati.alias)],
        ]);
      }
      return clienteSingolo(client, tenantId, cliente.id);
    });
    void risposta.code(201);
    return creato;
  });

  app.patch<{ Params: { id: string } }>('/api/clienti/:id', async (richiesta) => {
    const esito = schemaModificheCliente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al cliente non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const assegnazioni: string[] = [];
      const parametri: unknown[] = [richiesta.params.id, tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      if (m.nome !== undefined) assegnazioni.push(`nome = ${par(m.nome)}`);
      if (m.tipo !== undefined) assegnazioni.push(`tipo = ${par(m.tipo)}`);
      if (m.codiceFiscale !== undefined) assegnazioni.push(`codice_fiscale = ${par(m.codiceFiscale || null)}`);
      if (m.partitaIva !== undefined) assegnazioni.push(`partita_iva = ${par(m.partitaIva || null)}`);
      if (m.alias !== undefined) assegnazioni.push(`alias = ${par([...new Set(m.alias)])}::text[]`);

      if (assegnazioni.length) {
        const r = await client.query(
          `update velia.clienti set ${assegnazioni.join(', ')} where id = $1 and tenant_id = $2`,
          parametri,
        );
        if (!r.rowCount) throw ErroreApi.nonTrovato('Cliente inesistente.');
      }
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

  // -------------------------------------------------------------------------
  // Convenzione
  // -------------------------------------------------------------------------

  /**
   * Come è organizzato questo archivio, per come il sistema l'ha osservato.
   * Non è un form da compilare: è una frase da confermare o correggere.
   */
  app.get('/api/convenzione', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<Convenzione> => {
      const r = await client.query<{
        testo: string;
        testo_utente: string | null;
        calcolata_il: Date | null;
        da_ricalcolare: boolean;
      }>(
        `select testo, testo_utente, calcolata_il, da_ricalcolare
         from velia.convenzione_archivio where tenant_id = $1`,
        [richiesta.identita.tenantId],
      );
      const riga = r.rows[0];
      const effettiva = await convenzioneEffettiva(client, richiesta.identita.tenantId);
      return {
        testo: riga?.testo ?? '',
        ...(riga?.testo_utente && { testoUtente: riga.testo_utente }),
        effettiva,
        ...(riga?.calcolata_il && { calcolataIl: riga.calcolata_il.toISOString() }),
        daRicalcolare: riga?.da_ricalcolare ?? false,
      };
    });
  });

  /** La correzione umana vince sempre, e svuotarla restituisce la parola all'osservazione. */
  app.patch('/api/convenzione', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaModificheConvenzione.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Correzione non valida.');

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<Convenzione> => {
      const { tenantId } = richiesta.identita;
      await client.query(
        `insert into velia.convenzione_archivio (tenant_id, testo_utente)
         values ($1, $2)
         on conflict (tenant_id) do update set testo_utente = excluded.testo_utente, updated_at = now()`,
        [tenantId, esito.data.testoUtente || null],
      );
      const r = await client.query<{
        testo: string;
        testo_utente: string | null;
        calcolata_il: Date | null;
        da_ricalcolare: boolean;
      }>(
        `select testo, testo_utente, calcolata_il, da_ricalcolare
         from velia.convenzione_archivio where tenant_id = $1`,
        [tenantId],
      );
      const riga = r.rows[0]!;
      return {
        testo: riga.testo,
        ...(riga.testo_utente && { testoUtente: riga.testo_utente }),
        effettiva: (riga.testo_utente ?? '').trim() || riga.testo,
        ...(riga.calcolata_il && { calcolataIl: riga.calcolata_il.toISOString() }),
        daRicalcolare: riga.da_ricalcolare,
      };
    });
  });
}

async function esisteCartella(client: pg.ClientBase, tenantId: string, id: string): Promise<void> {
  const r = await client.query(`select 1 from velia.cartelle where id = $1 and tenant_id = $2`, [
    id,
    tenantId,
  ]);
  if (!r.rowCount) throw ErroreApi.datiNonValidi('Cartella di destinazione inesistente.');
}

/**
 * Una sorella che è quasi lo stesso nome: si avvisa prima di creare il
 * doppione.
 *
 * La soglia è 0,69 e non 0,70 perché `similarity()` torna un `real`: il
 * confronto con `0.7` fallisce anche quando il valore *stampa* 0.7
 * (0,69999998 in binario). Misurata sui casi veri: «Clienti»/«Clientii» sta
 * a 0,70 e va fermato, «Preventivi»/«Preventivi 2026» sta a 0,6875 ed è una
 * cartella legittima che non va toccata.
 */
async function sorellaSimile(
  client: pg.ClientBase,
  tenantId: string,
  parentId: string | null,
  nome: string,
): Promise<string | null> {
  const r = await client.query<{ nome: string }>(
    parentId === null
      ? `select nome from velia.cartelle
         where tenant_id = $1 and parent_id is null
           and extensions.similarity(velia.normalizza_nome(nome), velia.normalizza_nome($2)) > 0.69
         limit 1`
      : `select nome from velia.cartelle
         where tenant_id = $1 and parent_id = $3
           and extensions.similarity(velia.normalizza_nome(nome), velia.normalizza_nome($2)) > 0.69
         limit 1`,
    parentId === null ? [tenantId, nome] : [tenantId, nome, parentId],
  );
  return r.rows[0]?.nome ?? null;
}

async function cartellaSingola(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<Cartella> {
  const righe = await caricaCartelle(client, tenantId);
  const per = indicizza(righe);
  const riga = per.get(id);
  if (!riga) throw ErroreApi.nonTrovato('Cartella inesistente.');
  const conteggi = await conteggiPerCartella(client, tenantId);
  const propri = conteggi.get(id) ?? 0;
  const discendenti = righe.filter((r) => r.id !== id && eDiscendente(r.id, id, per));
  return {
    id: riga.id,
    nome: riga.nome,
    percorso: percorsoDi(id, per),
    ...(riga.parent_id && { parentId: riga.parent_id }),
    ...(riga.descrizione && { descrizione: riga.descrizione }),
    descrizioneDaUtente: riga.descrizione_da_utente,
    ...(riga.ruolo_figli && { ruoloFigli: riga.ruolo_figli }),
    ...(riga.cliente_id && { clienteId: riga.cliente_id }),
    documenti: propri,
    documentiTotali: propri + discendenti.reduce((s, d) => s + (conteggi.get(d.id) ?? 0), 0),
    figli: [],
  };
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
