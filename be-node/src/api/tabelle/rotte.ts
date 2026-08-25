import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import type { Citazione } from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import {
  schemaAggiungiDocumenti,
  schemaModificheTabella,
  schemaNuovaColonna,
  schemaNuovaTabella,
  type CellaTabella,
  type ColonnaTabella,
  type CriterioPredefinito,
  type PaginaTabelle,
  type TabellaAnalisi,
  type TabellaRiepilogo,
} from '../../contratto/tabelle.js';
import { schemaEsporta as schemaEsportaTemplate } from '../../contratto/template.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { richiediCrediti } from '../crediti/rotte.js';
import { generaDocumento } from '../../generazione/generatore.js';
import { accoda } from '../../worker/coda.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';
import {
  identitaDelTenant,
  risolviTemplate,
  versoIdentitaGenerazione,
  type RigaIdentita,
} from '../template/rotte.js';

/**
 * Le tabelle di analisi (RF-C-11…C-15): le rotte che il FE chiama da
 * `core/api/tabelle-api.ts`, col comportamento fissato da `mocks/tabelle.mjs`.
 *
 * La generazione è del worker (job `tabella`): qui le celle nascono
 * `in-attesa` e il FE interroga il dettaglio finché `stato ===
 * 'in-generazione'` — nessuno streaming, il polling tiene il contratto a una
 * sola forma di risposta. Le mutazioni a generazione in corso non parlano
 * col job: aggiungono o tolgono celle e il suo ciclo riconcilia da sé.
 *
 * La visibilità (RF-C-15) è quella delle conversazioni: l'autore, e i
 * colleghi del tenant se condivisa — in sola lettura, l'ha scritta la RLS.
 * Chi vuole proseguirci sopra la duplica.
 */

interface RigaTabellaDb {
  id: string;
  titolo: string;
  created_at: Date;
  updated_at: Date;
  autore_id: string;
  condivisa: boolean;
  stato: TabellaAnalisi['stato'];
}

interface RigaDocumentoScelto {
  id: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  titolo: string;
  stato: string;
  compagnia_nome: string | null;
  prodotto: string | null;
  edizione_etichetta: string | null;
  edizione_corrente: boolean | null;
  ramo_id: string | null;
  ramo_nome: string | null;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nonTrovata = (): ErroreApi => new ErroreApi(404, 'NON_TROVATA', 'Tabella inesistente.');
const soloAutore = (): ErroreApi =>
  ErroreApi.permessoNegato('Solo chi ha creato la tabella può modificarla.');

export interface OpzioniTabelle {
  /** Nei test: un archivio finto al posto dello Storage (per l'esportazione). */
  archivio?: ArchivioFile;
}

export function registraRotteTabelle(app: FastifyInstance, opzioni: OpzioniTabelle = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());

  /** RF-C-11: lo storico delle tabelle, la più recente in cima. */
  app.get('/api/tabelle', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<PaginaTabelle> => {
      const righe = await client.query<RigaTabellaDb & { numero_documenti: number; numero_colonne: number }>(
        `select t.id, t.titolo, t.created_at, t.updated_at, t.autore_id, t.condivisa, t.stato,
                (select count(*)::int from velia.tabelle_righe r where r.tabella_id = t.id) as numero_documenti,
                (select count(*)::int from velia.tabelle_colonne c where c.tabella_id = t.id) as numero_colonne
         from velia.tabelle t
         where t.tenant_id = $1
         order by t.updated_at desc, t.id`,
        [richiesta.identita.tenantId],
      );
      const elementi: TabellaRiepilogo[] = righe.rows.map((t) => ({
        ...versoRiepilogo(t),
        numeroDocumenti: t.numero_documenti,
        numeroColonne: t.numero_colonne,
      }));
      return { elementi, totale: elementi.length, pagina: 1, perPagina: elementi.length };
    });
  });

  /** RF-C-11: i criteri predefiniti pertinenti ai documenti scelti. */
  app.get<{ Querystring: { documenti?: string } }>('/api/tabelle/criteri', async (richiesta) => {
    const documentiIds = (richiesta.query.documenti ?? '').split(',').filter(Boolean);
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const rami = documentiIds.length
        ? (
            await client.query<{ ramo_id: string }>(
              `select distinct ramo_id from velia.documenti where id = any($1) and ramo_id is not null`,
              [documentiIds],
            )
          ).rows.map((r) => r.ramo_id)
        : [];
      const criteri = await client.query<{ id: string; intestazione: string; descrizione: string; ramo_id: string | null }>(
        `select id, intestazione, descrizione, ramo_id from velia.tabelle_criteri
         where ramo_id is null or ramo_id = any($1)
         order by posizione`,
        [rami],
      );
      return criteri.rows.map(
        (c): CriterioPredefinito => ({
          id: c.id,
          intestazione: c.intestazione,
          descrizione: c.descrizione,
          ...(c.ramo_id && { ramoId: c.ramo_id }),
        }),
      );
    });
  });

  /** RF-C-11: la tabella nasce con le celle in attesa e si popola da sola. */
  app.post('/api/tabelle', async (richiesta, risposta) => {
    const esito = schemaNuovaTabella.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw new ErroreApi(400, 'TABELLA_VUOTA', 'Servono almeno un documento e una colonna.');
    }
    await richiediCrediti(poolDb(), richiesta.identita.tenantId);
    const corpo = esito.data;
    const documentiIds = [...new Set(corpo.documentiIds)];

    const tabella = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const documenti = await risolviDocumenti(client, documentiIds);
      const titolo = corpo.titolo ?? titoloPredefinito(documenti);

      const creata = await client.query<{ id: string }>(
        `insert into velia.tabelle (tenant_id, autore_id, titolo) values ($1, $2, $3) returning id`,
        [richiesta.identita.tenantId, richiesta.identita.utenteId, titolo],
      );
      const tabellaId = creata.rows[0]!.id;
      await inserisciColonne(client, richiesta.identita, tabellaId, corpo.colonne, 0);
      await inserisciRighe(client, richiesta.identita, tabellaId, documenti, 0);
      await client.query(
        `insert into velia.tabelle_celle (tabella_id, tenant_id, documento_id, colonna_id)
         select $1, $2, r.documento_id, c.id
         from velia.tabelle_righe r, velia.tabelle_colonne c
         where r.tabella_id = $1 and c.tabella_id = $1`,
        [tabellaId, richiesta.identita.tenantId],
      );
      return (await tabellaCompleta(client, tabellaId))!;
    });

    await accodaGenerazione(richiesta.identita, tabella.id, richiesta.log);
    void risposta.code(201);
    return tabella;
  });

  app.get<{ Params: { id: string } }>('/api/tabelle/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const tabella = await tabellaCompleta(client, controllaId(richiesta.params.id));
      if (!tabella) throw nonTrovata();
      return tabella;
    });
  });

  /** RF-C-14 (rinomina) e RF-C-15 (condivisione): titolo solo se non vuoto. */
  app.patch<{ Params: { id: string } }>('/api/tabelle/:id', async (richiesta) => {
    const esito = schemaModificheTabella.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await perId(client, controllaId(richiesta.params.id));
      if (!esistente) throw nonTrovata();
      const titolo = typeof m.titolo === 'string' && m.titolo.trim() ? m.titolo.trim() : esistente.titolo;
      const condivisa = typeof m.condivisa === 'boolean' ? m.condivisa : esistente.condivisa;
      const r = await client.query(
        `update velia.tabelle set titolo = $2, condivisa = $3, updated_at = now() where id = $1`,
        [esistente.id, titolo, condivisa],
      );
      if (!r.rowCount) throw soloAutore();
      return (await tabellaCompleta(client, esistente.id))!;
    });
  });

  app.delete<{ Params: { id: string } }>('/api/tabelle/:id', async (richiesta, risposta) => {
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await perId(client, controllaId(richiesta.params.id));
      if (!esistente) throw nonTrovata();
      const r = await client.query(`delete from velia.tabelle where id = $1`, [esistente.id]);
      if (!r.rowCount) throw soloAutore();
    });
    return risposta.code(204).send();
  });

  /** RF-C-15: la copia con cui si prosegue in autonomia una tabella condivisa. */
  app.post<{ Params: { id: string } }>('/api/tabelle/:id/duplica', async (richiesta, risposta) => {
    await richiediCrediti(poolDb(), richiesta.identita.tenantId);
    const copia = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const originale = await perId(client, controllaId(richiesta.params.id));
      if (!originale) throw nonTrovata();

      const creata = await client.query<{ id: string }>(
        `insert into velia.tabelle (tenant_id, autore_id, titolo, stato)
         values ($1, $2, $3, $4) returning id`,
        [
          richiesta.identita.tenantId,
          richiesta.identita.utenteId,
          `Copia di ${originale.titolo}`,
          originale.stato,
        ],
      );
      const copiaId = creata.rows[0]!.id;

      /* Colonne con id nuovi (le celle le referenziano: serve la mappa),
         righe e celle come stanno — se l'originale era ancora in
         generazione, la copia riparte da dove era. */
      const colonne = await client.query<{ id: string }>(
        `insert into velia.tabelle_colonne (tabella_id, tenant_id, posizione, intestazione, origine, criterio)
         select $2, tenant_id, posizione, intestazione, origine, criterio
         from velia.tabelle_colonne where tabella_id = $1 order by posizione
         returning id`,
        [originale.id, copiaId],
      );
      const originali = await client.query<{ id: string }>(
        `select id from velia.tabelle_colonne where tabella_id = $1 order by posizione`,
        [originale.id],
      );
      await client.query(
        `insert into velia.tabelle_righe (tabella_id, tenant_id, documento_id, archivio, etichetta, posizione)
         select $2, tenant_id, documento_id, archivio, etichetta, posizione
         from velia.tabelle_righe where tabella_id = $1`,
        [originale.id, copiaId],
      );
      for (let i = 0; i < originali.rows.length; i++) {
        await client.query(
          `insert into velia.tabelle_celle
             (tabella_id, tenant_id, documento_id, colonna_id, stato, esito, valore, nota, motivo, citazioni)
           select $2, tenant_id, documento_id, $4, stato, esito, valore, nota, motivo, citazioni
           from velia.tabelle_celle where tabella_id = $1 and colonna_id = $3`,
          [originale.id, copiaId, originali.rows[i]!.id, colonne.rows[i]!.id],
        );
      }
      return (await tabellaCompleta(client, copiaId))!;
    });

    if (copia.stato === 'in-generazione') {
      await accodaGenerazione(richiesta.identita, copia.id, richiesta.log);
    }
    void risposta.code(201);
    return copia;
  });

  /** RF-C-14: nuove righe. Le celle nuove partono in attesa e si generano. */
  app.post<{ Params: { id: string } }>('/api/tabelle/:id/documenti', async (richiesta) => {
    const esito = schemaAggiungiDocumenti.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Documenti non validi.');
    await richiediCrediti(poolDb(), richiesta.identita.tenantId);

    const { tabella, aggiunti } = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await autoreDi(client, richiesta.identita, controllaId(richiesta.params.id));
      const presenti = new Set(
        (
          await client.query<{ documento_id: string }>(
            `select documento_id from velia.tabelle_righe where tabella_id = $1`,
            [esistente.id],
          )
        ).rows.map((r) => r.documento_id),
      );
      const nuovi = [...new Set(esito.data.documentiIds)].filter((id) => !presenti.has(id));
      const documenti = await risolviDocumenti(client, nuovi);

      if (documenti.length) {
        await inserisciRighe(client, richiesta.identita, esistente.id, documenti, presenti.size);
        await client.query(
          `insert into velia.tabelle_celle (tabella_id, tenant_id, documento_id, colonna_id)
           select $1, $2, r.documento_id, c.id
           from velia.tabelle_righe r, velia.tabelle_colonne c
           where r.tabella_id = $1 and c.tabella_id = $1 and r.documento_id = any($3)`,
          [esistente.id, richiesta.identita.tenantId, documenti.map((d) => d.id)],
        );
        await client.query(
          `update velia.tabelle set stato = 'in-generazione', updated_at = now() where id = $1`,
          [esistente.id],
        );
      }
      return { tabella: (await tabellaCompleta(client, esistente.id))!, aggiunti: documenti.length };
    });

    if (aggiunti) await accodaGenerazione(richiesta.identita, tabella.id, richiesta.log);
    return tabella;
  });

  app.delete<{ Params: { id: string; documentoId: string } }>(
    '/api/tabelle/:id/documenti/:documentoId',
    async (richiesta) => {
      return conIdentita(poolDb(), richiesta.identita, async (client) => {
        const esistente = await autoreDi(client, richiesta.identita, controllaId(richiesta.params.id));
        await client.query(
          `delete from velia.tabelle_righe where tabella_id = $1 and documento_id = $2`,
          [esistente.id, richiesta.params.documentoId],
        );
        await client.query(`update velia.tabelle set updated_at = now() where id = $1`, [esistente.id]);
        return (await tabellaCompleta(client, esistente.id))!;
      });
    },
  );

  /** RF-C-14: nuova colonna, predefinita o in linguaggio naturale. */
  app.post<{ Params: { id: string } }>('/api/tabelle/:id/colonne', async (richiesta) => {
    const esito = schemaNuovaColonna.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw new ErroreApi(400, 'COLONNA_VUOTA', 'Alla colonna manca il criterio.');
    }
    await richiediCrediti(poolDb(), richiesta.identita.tenantId);

    const { tabella, righe } = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await autoreDi(client, richiesta.identita, controllaId(richiesta.params.id));
      const posizione = await client.query<{ prossima: number }>(
        `select coalesce(max(posizione), -1) + 1 as prossima from velia.tabelle_colonne where tabella_id = $1`,
        [esistente.id],
      );
      const colonna = await client.query<{ id: string }>(
        `insert into velia.tabelle_colonne (tabella_id, tenant_id, posizione, intestazione, origine, criterio)
         values ($1, $2, $3, $4, $5, $6) returning id`,
        [
          esistente.id,
          richiesta.identita.tenantId,
          posizione.rows[0]!.prossima,
          esito.data.intestazione,
          esito.data.origine,
          esito.data.criterio ?? null,
        ],
      );
      const celle = await client.query(
        `insert into velia.tabelle_celle (tabella_id, tenant_id, documento_id, colonna_id)
         select $1, $2, r.documento_id, $3
         from velia.tabelle_righe r where r.tabella_id = $1`,
        [esistente.id, richiesta.identita.tenantId, colonna.rows[0]!.id],
      );
      if (celle.rowCount) {
        await client.query(
          `update velia.tabelle set stato = 'in-generazione', updated_at = now() where id = $1`,
          [esistente.id],
        );
      } else {
        await client.query(`update velia.tabelle set updated_at = now() where id = $1`, [esistente.id]);
      }
      return { tabella: (await tabellaCompleta(client, esistente.id))!, righe: celle.rowCount ?? 0 };
    });

    if (righe) await accodaGenerazione(richiesta.identita, tabella.id, richiesta.log);
    return tabella;
  });

  app.delete<{ Params: { id: string; colonnaId: string } }>(
    '/api/tabelle/:id/colonne/:colonnaId',
    async (richiesta) => {
      return conIdentita(poolDb(), richiesta.identita, async (client) => {
        const esistente = await autoreDi(client, richiesta.identita, controllaId(richiesta.params.id));
        if (E_UUID.test(richiesta.params.colonnaId)) {
          await client.query(
            `delete from velia.tabelle_colonne where tabella_id = $1 and id = $2`,
            [esistente.id, richiesta.params.colonnaId],
          );
        }
        await client.query(`update velia.tabelle set updated_at = now() where id = $1`, [esistente.id]);
        return (await tabellaCompleta(client, esistente.id))!;
      });
    },
  );

  /**
   * RF-C-14: esportazione su template di output, XLSX in particolare — la
   * Fase 4 al lavoro: la tabella diventa il contenuto, il template
   * l'impaginazione. Le celle in attesa escono come «—», come nel mock.
   */
  app.post<{ Params: { id: string } }>('/api/tabelle/:id/esporta', async (richiesta, risposta) => {
    const esito = schemaEsportaTemplate.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Indica il template o il formato su cui esportare.');

    const { tabella, template, identita } = await conIdentita(
      poolDb(),
      richiesta.identita,
      async (client) => ({
        tabella: await tabellaCompleta(client, controllaId(richiesta.params.id)),
        template: await risolviTemplate(client, richiesta.identita.tenantId, esito.data),
        identita: await identitaDelTenant(client, richiesta.identita.tenantId),
      }),
    );
    if (!tabella) throw nonTrovata();

    const fileTemplate = template.path_file ? await archivio().scarica(template.path_file) : undefined;
    const logo = await caricaLogo(identita);
    const file = await generaDocumento({
      template,
      ...(fileTemplate && { fileTemplate }),
      titolo: tabella.titolo,
      testo: testoTabella(tabella),
      fonti: fontiTabella(tabella),
      identita: { ...versoIdentitaGenerazione(identita), ...(logo && { logo }) },
    });

    /* Il nome del download viene dalla TABELLA, non dal template (mock). */
    const slug = tabella.titolo
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return risposta
      .header('Content-Type', file.contentType)
      .header('Content-Length', file.byte.length)
      .header('Content-Disposition', `attachment; filename="${slug}.${template.formato}"`)
      .send(file.byte);
  });

  async function caricaLogo(riga: RigaIdentita): Promise<{ byte: Buffer; tipo: string } | undefined> {
    if (!riga.logo_path || !riga.logo_tipo) return undefined;
    try {
      return { byte: await archivio().scarica(riga.logo_path), tipo: riga.logo_tipo };
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Letture e costruzioni condivise
// ---------------------------------------------------------------------------

/** Un id malformato è un 404, non un errore SQL. */
function controllaId(id: string): string {
  if (!E_UUID.test(id)) throw nonTrovata();
  return id;
}

async function perId(client: pg.ClientBase, id: string): Promise<RigaTabellaDb | undefined> {
  const r = await client.query<RigaTabellaDb>(
    `select id, titolo, created_at, updated_at, autore_id, condivisa, stato
     from velia.tabelle where id = $1`,
    [id],
  );
  return r.rows[0];
}

/** La tabella per una mutazione: 404 se invisibile, 403 se di un collega. */
async function autoreDi(client: pg.ClientBase, identita: Identita, id: string): Promise<RigaTabellaDb> {
  const tabella = await perId(client, id);
  if (!tabella) throw nonTrovata();
  if (tabella.autore_id !== identita.utenteId) throw soloAutore();
  return tabella;
}

function versoRiepilogo(t: RigaTabellaDb): Omit<TabellaRiepilogo, 'numeroDocumenti' | 'numeroColonne'> {
  return {
    id: t.id,
    titolo: t.titolo,
    creataIl: t.created_at.toISOString(),
    aggiornataIl: t.updated_at.toISOString(),
    autoreId: t.autore_id,
    condivisa: t.condivisa,
    stato: t.stato,
  };
}

interface RigaCellaDb {
  documento_id: string;
  colonna_id: string;
  stato: 'in-attesa' | 'pronta';
  esito: 'presente' | 'non-presente' | 'non-determinabile' | null;
  valore: string | null;
  nota: string | null;
  motivo: string | null;
  citazioni: Citazione[];
}

function versoCella(c: RigaCellaDb): CellaTabella {
  if (c.stato !== 'pronta' || !c.esito) return { stato: 'in-attesa' };
  switch (c.esito) {
    case 'presente':
      return { stato: 'pronta', esito: 'presente', valore: c.valore ?? '', citazioni: c.citazioni };
    case 'non-presente':
      return { stato: 'pronta', esito: 'non-presente', ...(c.nota && { nota: c.nota }) };
    case 'non-determinabile':
      return { stato: 'pronta', esito: 'non-determinabile', motivo: c.motivo ?? '' };
  }
}

export async function tabellaCompleta(
  client: pg.ClientBase,
  id: string,
): Promise<TabellaAnalisi | undefined> {
  const tabella = await perId(client, id);
  if (!tabella) return undefined;

  /* Sequenziali: è un solo client di transazione, non sa parallelizzare. */
  const colonne = await client.query<{
    id: string;
    intestazione: string;
    origine: ColonnaTabella['origine'];
    criterio: string | null;
  }>(
    `select id, intestazione, origine, criterio from velia.tabelle_colonne
     where tabella_id = $1 order by posizione, id`,
    [id],
  );
  const righe = await client.query<{
    documento_id: string;
    archivio: 'pubblico' | 'privato' | 'conversazione';
    etichetta: string;
  }>(
    `select documento_id, archivio, etichetta from velia.tabelle_righe
     where tabella_id = $1 order by posizione, documento_id`,
    [id],
  );
  const celle = await client.query<RigaCellaDb>(
    `select documento_id, colonna_id, stato, esito, valore, nota, motivo, citazioni
     from velia.tabelle_celle where tabella_id = $1`,
    [id],
  );

  const perRiga = new Map<string, Record<string, CellaTabella>>();
  for (const c of celle.rows) {
    const mappa = perRiga.get(c.documento_id) ?? {};
    mappa[c.colonna_id] = versoCella(c);
    perRiga.set(c.documento_id, mappa);
  }

  return {
    id: tabella.id,
    titolo: tabella.titolo,
    creataIl: tabella.created_at.toISOString(),
    aggiornataIl: tabella.updated_at.toISOString(),
    autoreId: tabella.autore_id,
    condivisa: tabella.condivisa,
    stato: tabella.stato,
    colonne: colonne.rows.map((c) => ({
      id: c.id,
      intestazione: c.intestazione,
      origine: c.origine,
      ...(c.criterio && { criterio: c.criterio }),
    })),
    righe: righe.rows.map((r) => ({
      documentoId: r.documento_id,
      archivio: r.archivio,
      etichetta: r.etichetta,
      celle: perRiga.get(r.documento_id) ?? {},
    })),
  };
}

/**
 * Risolve i documenti richiesti (la visibilità è la RLS): 404 se uno non
 * esiste, 409 se un documento del tenant non è ancora pronto (mock).
 */
async function risolviDocumenti(
  client: pg.ClientBase,
  documentiIds: string[],
): Promise<RigaDocumentoScelto[]> {
  if (!documentiIds.length) return [];
  const righe = await client.query<RigaDocumentoScelto>(
    `select d.id, d.archivio, d.titolo, d.stato,
            c.nome as compagnia_nome, d.prodotto, d.edizione_etichetta, d.edizione_corrente,
            d.ramo_id, r.nome as ramo_nome
     from velia.documenti d
     left join velia.compagnie c on c.id = d.compagnia_id
     left join velia.rami r on r.id = d.ramo_id
     where d.id = any($1)`,
    [documentiIds],
  );
  const trovati = new Map(righe.rows.map((d) => [d.id, d]));
  const documenti: RigaDocumentoScelto[] = [];
  for (const id of documentiIds) {
    const documento = trovati.get(id);
    if (!documento) {
      throw ErroreApi.nonTrovato(`Documento «${id}» inesistente.`);
    }
    if (documento.archivio !== 'pubblico' && documento.stato !== 'pronto') {
      throw ErroreApi.conflitto(
        'NON_PRONTO',
        `«${documento.titolo}» non è ancora elaborato: non può entrare in una tabella finché non è pronto.`,
      );
    }
    documenti.push(documento);
  }
  return documenti;
}

/** Etichetta di riga già pronta, come la vuole il contratto (mock). */
export function etichettaRiga(d: RigaDocumentoScelto): string {
  if (d.archivio === 'pubblico' && d.compagnia_nome && d.prodotto) {
    const base = `${d.compagnia_nome} — ${d.prodotto}`;
    return d.edizione_corrente || !d.edizione_etichetta ? base : `${base} (${d.edizione_etichetta})`;
  }
  return d.titolo;
}

/** Titolo predefinito: dal ramo se è uno solo, altrimenti dalla data (mock). */
function titoloPredefinito(documenti: RigaDocumentoScelto[]): string {
  const rami = new Map(
    documenti.filter((d) => d.ramo_id && d.ramo_nome).map((d) => [d.ramo_id!, d.ramo_nome!]),
  );
  if (rami.size === 1) return `Confronto ${[...rami.values()][0]}`;
  const data = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  return `Tabella di analisi del ${data}`;
}

async function inserisciColonne(
  client: pg.ClientBase,
  identita: Identita,
  tabellaId: string,
  colonne: Array<{ intestazione: string; origine: string; criterio?: string | undefined }>,
  daPosizione: number,
): Promise<void> {
  for (let i = 0; i < colonne.length; i++) {
    await client.query(
      `insert into velia.tabelle_colonne (tabella_id, tenant_id, posizione, intestazione, origine, criterio)
       values ($1, $2, $3, $4, $5, $6)`,
      [tabellaId, identita.tenantId, daPosizione + i, colonne[i]!.intestazione, colonne[i]!.origine, colonne[i]!.criterio ?? null],
    );
  }
}

async function inserisciRighe(
  client: pg.ClientBase,
  identita: Identita,
  tabellaId: string,
  documenti: RigaDocumentoScelto[],
  daPosizione: number,
): Promise<void> {
  for (let i = 0; i < documenti.length; i++) {
    const d = documenti[i]!;
    await client.query(
      `insert into velia.tabelle_righe (tabella_id, tenant_id, documento_id, archivio, etichetta, posizione)
       values ($1, $2, $3, $4, $5, $6)`,
      [tabellaId, identita.tenantId, d.id, d.archivio, etichettaRiga(d), daPosizione + i],
    );
  }
}

/** Accoda il job di generazione; se non si può, la tabella lo dichiara. */
async function accodaGenerazione(
  identita: Identita,
  tabellaId: string,
  log: { error: (obj: unknown, msg: string) => void },
): Promise<void> {
  try {
    await accoda(poolDb(), 'tabella', { tabellaId }, { tenantId: identita.tenantId, utenteId: identita.utenteId });
  } catch (errore) {
    log.error({ err: errore, tabellaId }, 'accodamento del job tabella fallito');
    await poolDb().query(
      `update velia.tabelle set stato = 'errore', updated_at = now() where id = $1`,
      [tabellaId],
    );
  }
}

// ---------------------------------------------------------------------------
// Esportazione: la tabella come contenuto per la Fase 4
// ---------------------------------------------------------------------------

export function testoCella(cella: CellaTabella | undefined): string {
  if (!cella || cella.stato === 'in-attesa') return '—';
  switch (cella.esito) {
    case 'presente':
      return cella.valore;
    case 'non-presente':
      return 'Non presente';
    default:
      return 'Non determinabile';
  }
}

const pulisci = (testo: string): string => testo.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();

/** La tabella in Markdown: è la forma che tutti i compositori sanno impaginare. */
export function testoTabella(tabella: TabellaAnalisi): string {
  const intestazioni = ['Documento', ...tabella.colonne.map((c) => pulisci(c.intestazione))];
  const righe = tabella.righe.map((riga) => [
    pulisci(riga.etichetta),
    ...tabella.colonne.map((colonna) => pulisci(testoCella(riga.celle[colonna.id]))),
  ]);
  return [
    `| ${intestazioni.join(' | ')} |`,
    `| ${intestazioni.map(() => '---').join(' | ')} |`,
    ...righe.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

/** Le fonti in coda, nella forma del mock. */
export function fontiTabella(tabella: TabellaAnalisi): string[] {
  const fonti: string[] = [];
  for (const riga of tabella.righe) {
    for (const colonna of tabella.colonne) {
      const cella = riga.celle[colonna.id];
      if (!cella || cella.stato !== 'pronta' || cella.esito !== 'presente') continue;
      for (const c of cella.citazioni) {
        const posizione = [
          c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione,
          `p. ${c.posizione.pagina}`,
        ]
          .filter(Boolean)
          .join(', ');
        fonti.push(`${riga.etichetta} · ${colonna.intestazione}: ${c.documentoTitolo} — ${posizione}`);
      }
    }
  }
  return fonti;
}
