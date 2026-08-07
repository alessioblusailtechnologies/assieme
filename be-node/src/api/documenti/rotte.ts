import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { ErroreApi } from '../../contratto/errori.js';
import {
  ORDINE_TIPOLOGIA,
  schemaFiltriDocumenti,
  type Compagnia,
  type DettaglioDocumento,
  type DocumentoPubblico,
  type EdizioneDiProdotto,
  type PaginaDocumenti,
  type Ramo,
} from '../../contratto/documenti.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { BUCKET_ARCHIVIO, clientServizio } from '../../db/supabase.js';

/** La riga dell'elenco, con compagnia e ramo già uniti. */
interface RigaDocumento {
  id: string;
  titolo: string;
  tipologia: DocumentoPubblico['tipologia'];
  numero_pagine: number | null;
  prodotto: string;
  edizione_id: string;
  edizione_etichetta: string;
  edizione_valida_dal: string;
  edizione_valida_al: string | null;
  edizione_corrente: boolean;
  compagnia_id: string;
  compagnia_nome: string;
  compagnia_aggiornamento: string | null;
  ramo_id: string;
  ramo_nome: string;
  ramo_codice: string;
  preferito: boolean;
  totale?: string;
}

const dataIso = (d: string | null): string | undefined => d ?? undefined;

function versoDocumento(r: RigaDocumento): DocumentoPubblico {
  const compagnia: Compagnia = {
    id: r.compagnia_id,
    nome: r.compagnia_nome,
    ...(r.compagnia_aggiornamento && { ultimoAggiornamento: dataIso(r.compagnia_aggiornamento)! }),
  };
  const ramo: Ramo = { id: r.ramo_id, nome: r.ramo_nome, codice: r.ramo_codice };
  return {
    id: r.id,
    archivio: 'pubblico',
    titolo: r.titolo,
    tipologia: r.tipologia,
    ...(r.numero_pagine !== null && { numeroPagine: r.numero_pagine }),
    fileUrl: `/api/documenti/${r.id}/file`,
    compagnia,
    ramo,
    prodotto: r.prodotto,
    edizione: {
      id: r.edizione_id,
      etichetta: r.edizione_etichetta,
      validaDal: dataIso(r.edizione_valida_dal)!,
      ...(r.edizione_valida_al && { validaAl: dataIso(r.edizione_valida_al)! }),
      corrente: r.edizione_corrente,
    },
    preferito: r.preferito,
  };
}

/**
 * La testa della query: documento + compagnia + ramo + preferito
 * dell'utente corrente. La RLS fa metà del lavoro — `preferiti` mostra solo
 * le righe proprie, quindi il left join È «il mio preferito».
 */
const SQL_BASE = `
  select d.id, d.titolo, d.tipologia, d.numero_pagine, d.prodotto,
         d.edizione_id, d.edizione_etichetta, d.edizione_valida_dal,
         d.edizione_valida_al, d.edizione_corrente,
         c.id as compagnia_id, c.nome as compagnia_nome,
         c.ultimo_aggiornamento as compagnia_aggiornamento,
         r.id as ramo_id, r.nome as ramo_nome, r.codice as ramo_codice,
         (p.documento_id is not null) as preferito
  from assieme.documenti d
  join assieme.compagnie c on c.id = d.compagnia_id
  join assieme.rami r on r.id = d.ramo_id
  left join assieme.preferiti p on p.documento_id = d.id
  where d.archivio = 'pubblico'`;

/**
 * L'ordine di lettura dello stub: compagnia, prodotto, corrente prima delle
 * storiche, poi la tipologia nell'ordine in cui un intermediario apre i
 * documenti di un set.
 */
const SQL_ORDINE = `
  order by c.nome collate "it-x-icu",
           d.prodotto collate "it-x-icu",
           d.edizione_corrente desc,
           array_position($ORD::text[], d.tipologia)`;

export function registraRotteDocumenti(app: FastifyInstance): void {
  /** RF-A-03: elenco con navigazione, ricerca e paginazione. */
  app.get('/api/documenti', async (richiesta) => {
    const esito = schemaFiltriDocumenti.safeParse(richiesta.query);
    if (!esito.success) throw ErroreApi.datiNonValidi('Filtri di ricerca non validi.');
    const filtri = esito.data;

    const condizioni: string[] = [];
    const parametri: unknown[] = [];
    const par = (v: unknown): string => {
      parametri.push(v);
      return `$${parametri.length}`;
    };

    if (filtri.compagniaId) condizioni.push(`d.compagnia_id = ${par(filtri.compagniaId)}`);
    if (filtri.ramoId) condizioni.push(`d.ramo_id = ${par(filtri.ramoId)}`);
    if (filtri.tipologia) condizioni.push(`d.tipologia = ${par(filtri.tipologia)}`);
    if (filtri.soloCorrenti) condizioni.push(`d.edizione_corrente`);
    if (filtri.soloPreferiti) condizioni.push(`p.documento_id is not null`);

    /* La ricerca dello stub: tutte le parole, in qualsiasi ordine, senza
       accenti — "AUTOPIU" trova "AUTOPIÙ" (RF-A-03). */
    for (const parola of (filtri.q ?? '').split(/\s+/).filter(Boolean)) {
      condizioni.push(
        `extensions.unaccent(lower(concat_ws(' ', d.titolo, d.prodotto, c.nome, r.nome, d.edizione_etichetta)))
         like '%' || extensions.unaccent(lower(${par(parola)})) || '%'`,
      );
    }

    const dove = condizioni.length ? ` and ${condizioni.join(' and ')}` : '';
    const ordine = SQL_ORDINE.replace('$ORD', par([...ORDINE_TIPOLOGIA]));
    const limite = ` limit ${par(filtri.perPagina)} offset ${par((filtri.pagina - 1) * filtri.perPagina)}`;
    /* Il totale viaggia su ogni riga (finestra): una query sola per elenco
       e conteggio. La colonna in più si aggiunge alla SELECT della base. */
    const conTotale = SQL_BASE.replace(
      '\n  from assieme.documenti d',
      ',\n         count(*) over() as totale\n  from assieme.documenti d',
    );
    const sql = `${conTotale}${dove}${ordine}${limite}`;

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<PaginaDocumenti> => {
      const righe = await client.query<RigaDocumento>(sql, parametri);
      return {
        elementi: righe.rows.map(versoDocumento),
        totale: Number(righe.rows[0]?.totale ?? (await contaSenzaPagina(client, dove, parametri))),
        pagina: filtri.pagina,
        perPagina: filtri.perPagina,
      };
    });
  });

  /** RF-A-04: la scheda, con le edizioni sorelle dello stesso prodotto. */
  app.get<{ Params: { id: string } }>('/api/documenti/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<DettaglioDocumento> => {
      const documento = await documentoPerId(client, richiesta.params.id);
      if (!documento) throw ErroreApi.nonTrovato('Documento inesistente.');

      const sorelle = await client.query<{
        id: string;
        edizione_id: string;
        edizione_etichetta: string;
        edizione_valida_dal: string;
        edizione_valida_al: string | null;
        edizione_corrente: boolean;
      }>(
        `select id, edizione_id, edizione_etichetta, edizione_valida_dal,
                edizione_valida_al, edizione_corrente
         from assieme.documenti
         where archivio = 'pubblico' and compagnia_id = $1 and prodotto = $2 and tipologia = $3
         order by edizione_valida_dal desc`,
        [documento.compagnia.id, documento.prodotto, documento.tipologia],
      );

      const edizioni: EdizioneDiProdotto[] = sorelle.rows.map((s) => ({
        documentoId: s.id,
        id: s.edizione_id,
        etichetta: s.edizione_etichetta,
        validaDal: dataIso(s.edizione_valida_dal)!,
        ...(s.edizione_valida_al && { validaAl: dataIso(s.edizione_valida_al)! }),
        corrente: s.edizione_corrente,
      }));

      return { ...documento, edizioni };
    });
  });

  /**
   * RF-A-09: preferiti, per utente. La scrittura passa dalla RLS come tutte
   * le letture: la policy pretende `utente_id = auth.uid()`, quindi
   * marcare un preferito a nome d'altri non è un divieto applicativo — è
   * una riga che il database non lascia scrivere.
   */
  for (const metodo of ['put', 'delete'] as const) {
    app[metodo]<{ Params: { id: string } }>(
      '/api/documenti/:id/preferito',
      async (richiesta) => {
        return conIdentita(poolDb(), richiesta.identita, async (client) => {
          const documento = await documentoPerId(client, richiesta.params.id);
          if (!documento) throw ErroreApi.nonTrovato('Documento inesistente.');

          if (metodo === 'put') {
            await client.query(
              `insert into assieme.preferiti (utente_id, documento_id)
               values ($1, $2) on conflict do nothing`,
              [richiesta.identita.utenteId, richiesta.params.id],
            );
          } else {
            await client.query(
              `delete from assieme.preferiti where utente_id = $1 and documento_id = $2`,
              [richiesta.identita.utenteId, richiesta.params.id],
            );
          }
          return { ...documento, preferito: metodo === 'put' };
        });
      },
    );
  }

  /**
   * Il PDF per il visualizzatore: l'originale, dallo Storage. Niente
   * generatori — dall'archivio escono solo documenti veri; un documento
   * senza file caricato è un errore leggibile, non un segnaposto.
   *
   * L'autorizzazione è la lettura di catalogo (RLS): se l'utente non può
   * vedere la riga, non arriva al file.
   */
  app.get<{ Params: { id: string } }>('/api/documenti/:id/file', async (richiesta, risposta) => {
    const riga = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ path_pdf: string | null }>(
        `select path_pdf from assieme.documenti where archivio = 'pubblico' and id = $1`,
        [richiesta.params.id],
      );
      return r.rows[0];
    });
    if (!riga) throw ErroreApi.nonTrovato('Documento inesistente.');
    if (!riga.path_pdf) {
      throw new ErroreApi(404, 'FILE_MANCANTE', 'Il file di questo documento non è ancora in archivio.');
    }

    const { data, error } = await clientServizio()
      .storage.from(BUCKET_ARCHIVIO)
      .download(riga.path_pdf);
    if (error || !data) {
      richiesta.log.error({ path: riga.path_pdf, err: error }, 'file non leggibile dallo storage');
      throw new ErroreApi(500, 'ERRORE_INTERNO', 'Il servizio non è momentaneamente disponibile.');
    }

    void risposta
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'inline')
      .send(Buffer.from(await data.arrayBuffer()));
  });

  /** Le tassonomie di navigazione (RF-A-03). */
  app.get('/api/compagnie', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<{ id: string; nome: string; ultimo_aggiornamento: string | null }>(
        `select id, nome, ultimo_aggiornamento from assieme.compagnie order by nome collate "it-x-icu"`,
      );
      return righe.rows.map(
        (c): Compagnia => ({
          id: c.id,
          nome: c.nome,
          ...(c.ultimo_aggiornamento && { ultimoAggiornamento: dataIso(c.ultimo_aggiornamento)! }),
        }),
      );
    });
  });

  app.get('/api/rami', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<Ramo>(
        `select id, nome, codice from assieme.rami order by nome collate "it-x-icu"`,
      );
      return righe.rows;
    });
  });
}

async function documentoPerId(
  client: pg.ClientBase,
  id: string,
): Promise<DocumentoPubblico | undefined> {
  const righe = await client.query<RigaDocumento>(`${SQL_BASE} and d.id = $1`, [id]);
  const riga = righe.rows[0];
  return riga ? versoDocumento(riga) : undefined;
}

/** Il conteggio quando la pagina richiesta è oltre la fine (nessuna riga). */
async function contaSenzaPagina(
  client: pg.ClientBase,
  dove: string,
  parametri: unknown[],
): Promise<number> {
  const conta = await client.query<{ totale: string }>(
    `select count(*) as totale from (${SQL_BASE}${dove}) conteggio`,
    parametri.slice(0, parametri.length - 3), // senza ordine e paginazione
  );
  return Number(conta.rows[0]?.totale ?? 0);
}

