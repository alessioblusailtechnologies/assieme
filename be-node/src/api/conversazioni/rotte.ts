import { randomBytes, randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';

import {
  schemaModificheConversazione,
  schemaNuovaConversazione,
  schemaNuovoMessaggio,
  titoloDaMessaggio,
  TITOLO_NUOVA,
  percorsoDocumentoGenerato,
  type Citazione,
  type Conversazione,
  type DocumentoGenerato,
  type EventoStream,
  type Messaggio,
  type PaginaConversazioni,
  type Provenienza,
  type RiferimentoDocumento,
} from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import { MIME, nomeFileGenerato } from '../../generazione/generatore.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { creaClientDedicato, poolDb } from '../../db/pool.js';
import { richiediCrediti } from '../crediti/rotte.js';
import { accoda } from '../../worker/coda.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';
import { PonteEventi } from './ponte-eventi.js';

/**
 * La chat (Fase 3): conversazioni, contesto documentale, allegati, e la
 * rotta SSE `POST /:id/messaggi` — il ponte del piano §3.1. Il contratto è
 * quello di `mocks/chat.mjs` e di `core/api/conversazioni-api.ts`: frame
 * `data: <json>\n\n` (solo LF), primo evento `inizio`, ultimo `fine` o
 * `errore`, messaggio utente persistito subito, risposta solo a fine.
 */

export interface OpzioniConversazioni {
  /** Nei test: lo Storage finto per gli allegati. */
  archivio?: ArchivioFile;
  /** Nei test: un ponte sul database, condiviso con chi emette gli eventi. */
  ponte?: PonteEventi;
  /** Ogni quanto tenere vivo lo stream con un commento SSE. */
  battitoMs?: number;
}

interface RigaConversazione {
  id: string;
  titolo: string;
  created_at: Date;
  updated_at: Date;
  documenti_in_contesto: string[];
  condivisa: boolean;
  autore_id: string;
}

interface RigaMessaggio {
  id: string;
  conversazione_id: string;
  autore: 'utente' | 'assistente';
  testo: string;
  inviato_il: Date;
  documenti_referenziati: string[];
  citazioni: Citazione[];
  provenienze: Provenienza[];
  non_supportato: boolean;
  documenti: DocumentoGenerato[];
}

const nuovoIdAllegato = (): string => `all-${randomBytes(6).toString('hex')}`;
/** Gli id dei documenti generati sono uuid: un id malformato è un 404, non un errore SQL. */
const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const percorsoAllegato = (tenantId: string, id: string): string =>
  `tenant/${tenantId}/allegati/${id}.pdf`;

export function registraRotteConversazioni(app: FastifyInstance, opzioni: OpzioniConversazioni = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => (opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage()));
  let ponteProprio: PonteEventi | undefined;
  const ponte = (): PonteEventi => opzioni.ponte ?? (ponteProprio ??= new PonteEventi(poolDb(), creaClientDedicato));
  app.addHook('onClose', async () => {
    await ponteProprio?.chiudi();
  });

  /** RF-C-01: lo storico, il più recente in cima; il contesto idratato. */
  app.get('/api/conversazioni', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<PaginaConversazioni> => {
      const righe = await client.query<RigaConversazione>(
        `select id, titolo, created_at, updated_at, documenti_in_contesto, condivisa, autore_id
         from velia.conversazioni where tenant_id = $1 order by updated_at desc, id`,
        [richiesta.identita.tenantId],
      );
      const elementi = await idrata(client, righe.rows);
      return { elementi, totale: elementi.length, pagina: 1, perPagina: Math.max(elementi.length, 1) };
    });
  });

  app.post('/api/conversazioni', async (richiesta, risposta) => {
    const esito = schemaNuovaConversazione.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Conversazione non valida.');
    const { titolo, documentiInContesto = [] } = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<Conversazione> => {
      // Il contesto si valida PRIMA che la conversazione nasca (mock).
      const contesto = await contestoValidato(client, richiesta.identita, [], documentiInContesto);
      const r = await client.query<RigaConversazione>(
        `insert into velia.conversazioni (tenant_id, autore_id, titolo, documenti_in_contesto)
         values ($1, $2, $3, $4)
         returning id, titolo, created_at, updated_at, documenti_in_contesto, condivisa, autore_id`,
        [richiesta.identita.tenantId, richiesta.identita.utenteId, titolo ?? TITOLO_NUOVA, contesto],
      );
      void risposta.code(201);
      return (await idrata(client, r.rows))[0]!;
    });
  });

  /**
   * RF-C-02: allegato di conversazione. Nasce prima della conversazione (il
   * FE lo mette nel contesto corrente), quindi vive fuori dagli archivi in
   * `tenant/<tid>/allegati/` e passa dalla stessa pipeline di ingestion.
   * Registrata prima di `/:id`: «allegati» non è un id.
   */
  app.post('/api/conversazioni/allegati', async (richiesta, risposta) => {
    if (!richiesta.isMultipart()) throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    let file: { nome: string; contenuto: Buffer; troncato: boolean } | undefined;
    for await (const parte of richiesta.parts()) {
      if (parte.type !== 'file') continue;
      const contenuto = await parte.toBuffer();
      if (!parte.filename || file) continue;
      file = { nome: parte.filename, contenuto, troncato: parte.file.truncated };
    }
    if (!file) throw new ErroreApi(400, 'FILE_MANCANTE', 'Nessun file nel caricamento.');

    const { tenantId, utenteId } = richiesta.identita;
    const limite = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ limite_file_byte: string }>(
        `select limite_file_byte from velia.tenant where id = $1`,
        [tenantId],
      );
      return Number(r.rows[0]?.limite_file_byte ?? 20 * 1024 * 1024);
    });
    if (file.troncato || file.contenuto.length > limite) {
      throw new ErroreApi(
        413,
        'FILE_TROPPO_GRANDE',
        `«${file.nome}» supera il limite di ${Math.round(limite / 1024 / 1024)} MB per file.`,
      );
    }
    if (!file.contenuto.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw new ErroreApi(415, 'FORMATO_NON_SUPPORTATO', `«${file.nome}» non è un PDF: per ora si allegano solo PDF.`);
    }

    const id = nuovoIdAllegato();
    const percorso = percorsoAllegato(tenantId, id);
    await archivio().carica(percorso, file.contenuto, 'application/pdf');
    const titolo = file.nome.replace(/\.[^.]+$/, '') || file.nome;
    try {
      await conIdentita(poolDb(), richiesta.identita, (client) =>
        client.query(
          `insert into velia.documenti
             (id, archivio, tenant_id, titolo, tipologia, stato, path_pdf, nome_file,
              caricato_da, caricato_il, dimensione_byte)
           values ($1, 'conversazione', $2, $3, 'altro', 'in-coda', $4, $5, $6, now(), $7)`,
          [id, tenantId, titolo, percorso, file.nome, utenteId, file.contenuto.length],
        ),
      );
    } catch (errore) {
      await archivio().elimina([percorso]).catch(() => undefined);
      throw errore;
    }
    await accoda(poolDb(), 'ingestion', { documentoId: id }, { tenantId, utenteId });

    void risposta.code(201);
    const riferimento: RiferimentoDocumento = { id, titolo, archivio: 'conversazione' };
    return riferimento;
  });

  app.get<{ Params: { id: string } }>('/api/conversazioni/allegati/:id/file', async (richiesta, risposta) => {
    const riga = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ path_pdf: string | null }>(
        `select path_pdf from velia.documenti where archivio = 'conversazione' and tenant_id = $2 and id = $1`,
        [richiesta.params.id, richiesta.identita.tenantId],
      );
      return r.rows[0];
    });
    if (!riga?.path_pdf) throw ErroreApi.nonTrovato('Allegato inesistente.');
    let pdf: Buffer;
    try {
      pdf = await archivio().scarica(riga.path_pdf);
    } catch (errore) {
      richiesta.log.error({ path: riga.path_pdf, err: errore }, 'allegato non leggibile dallo storage');
      throw new ErroreApi(500, 'ERRORE_INTERNO', 'Il servizio non è momentaneamente disponibile.');
    }
    void risposta.header('Content-Type', 'application/pdf').header('Content-Disposition', 'inline').send(pdf);
  });

  /**
   * Un documento generato in chat su template: il file sta nello Storage,
   * l'elenco nel messaggio. Visibilità della conversazione via RLS (condivisa
   * = i colleghi lo scaricano); un id ignoto o altrui è un 404.
   */
  app.get<{ Params: { id: string; did: string } }>(
    '/api/conversazioni/:id/documenti/:did',
    async (richiesta, risposta) => {
      if (!E_UUID.test(richiesta.params.did)) throw ErroreApi.nonTrovato('Documento inesistente.');
      const documento = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        await conversazionePerId(client, richiesta.identita, richiesta.params.id);
        const r = await client.query<{ documento: DocumentoGenerato }>(
          `select d as documento
           from velia.messaggi m, jsonb_array_elements(m.documenti) d
           where m.conversazione_id = $1 and d->>'id' = $2`,
          [richiesta.params.id, richiesta.params.did],
        );
        return r.rows[0]?.documento;
      });
      if (!documento) throw ErroreApi.nonTrovato('Documento inesistente.');

      const byte = await archivio().scarica(
        percorsoDocumentoGenerato(richiesta.identita.tenantId, documento.id, documento.formato),
      );
      return risposta
        .header('Content-Type', MIME[documento.formato])
        .header('Content-Length', byte.length)
        .header('Content-Disposition', `attachment; filename="${nomeFileGenerato(documento.nome, documento.formato)}"`)
        .send(byte);
    },
  );

  app.get<{ Params: { id: string } }>('/api/conversazioni/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const riga = await conversazionePerId(client, richiesta.identita, richiesta.params.id);
      return (await idrata(client, [riga]))[0]!;
    });
  });

  /** Rinomina e condivisione: titolo solo se non vuoto, `aggiornataIl` sempre. */
  app.patch<{ Params: { id: string } }>('/api/conversazioni/:id', async (richiesta) => {
    const esito = schemaModificheConversazione.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche non valide.');
    const m = esito.data;
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await conversazionePerId(client, richiesta.identita, richiesta.params.id);
      const titolo = typeof m.titolo === 'string' && m.titolo.trim() ? m.titolo.trim() : esistente.titolo;
      const condivisa = typeof m.condivisa === 'boolean' ? m.condivisa : esistente.condivisa;
      const r = await client.query<RigaConversazione>(
        `update velia.conversazioni set titolo = $2, condivisa = $3, updated_at = now()
         where id = $1 and tenant_id = $4
         returning id, titolo, created_at, updated_at, documenti_in_contesto, condivisa, autore_id`,
        [richiesta.params.id, titolo, condivisa, richiesta.identita.tenantId],
      );
      if (!r.rowCount) throw ErroreApi.permessoNegato('Solo chi ha aperto la conversazione può modificarla.');
      return (await idrata(client, r.rows))[0]!;
    });
  });

  /** Elimina conversazione e messaggi; gli allegati che restano orfani spariscono con lei. */
  app.delete<{ Params: { id: string } }>('/api/conversazioni/:id', async (richiesta, risposta) => {
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await conversazionePerId(client, richiesta.identita, richiesta.params.id);
      /* I documenti generati in chat se ne vanno con la conversazione (file compresi). */
      const generati = await client.query<{ documenti: DocumentoGenerato[] }>(
        `select documenti from velia.messaggi where conversazione_id = $1 and jsonb_array_length(documenti) > 0`,
        [esistente.id],
      );
      const r = await client.query(`delete from velia.conversazioni where id = $1 and tenant_id = $2`, [
        esistente.id,
        richiesta.identita.tenantId,
      ]);
      if (!r.rowCount) throw ErroreApi.permessoNegato('Solo chi ha aperto la conversazione può eliminarla.');
      const fileGenerati = generati.rows.flatMap((m) =>
        m.documenti.map((d) => percorsoDocumentoGenerato(richiesta.identita.tenantId, d.id, d.formato)),
      );
      if (fileGenerati.length) await archivio().elimina(fileGenerati).catch(() => undefined);
      const orfani = await client.query<{ id: string; path_pdf: string | null; path_md: string | null }>(
        `delete from velia.documenti d
         where d.archivio = 'conversazione' and d.tenant_id = $2 and d.id = any($1)
           and not exists (
             select 1 from velia.conversazioni c
             where c.tenant_id = $2 and d.id = any(c.documenti_in_contesto)
           )
         returning d.id, d.path_pdf, d.path_md`,
        [esistente.documenti_in_contesto, richiesta.identita.tenantId],
      );
      const percorsi = orfani.rows.flatMap((o) => [o.path_pdf, o.path_md]).filter((p): p is string => Boolean(p));
      if (percorsi.length) await archivio().elimina(percorsi);
    });
    return risposta.code(204).send();
  });

  /**
   * Le prossime domande per la schermata iniziale: le ha scritte il worker a
   * fine risposta, su misura dell'ultima conversazione dell'utente. Vuoto se
   * non ce ne sono: la home ricade sugli esempi.
   */
  app.get('/api/suggerimenti', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<{ testo: string }>(
        `select testo from velia.suggerimenti
         where utente_id = $1 order by created_at desc, id limit 3`,
        [richiesta.identita.utenteId],
      );
      return righe.rows.map((r) => r.testo);
    });
  });

  /** Il filo intero, dal più vecchio: un array nudo, senza paginazione. */
  app.get<{ Params: { id: string } }>('/api/conversazioni/:id/messaggi', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<Messaggio[]> => {
      await conversazionePerId(client, richiesta.identita, richiesta.params.id);
      const righe = await client.query<RigaMessaggio>(
        `select id, conversazione_id, autore, testo, inviato_il, documenti_referenziati,
                citazioni, provenienze, non_supportato, documenti
         from velia.messaggi where conversazione_id = $1 order by inviato_il, id`,
        [richiesta.params.id],
      );
      return righe.rows.map(versoMessaggio);
    });
  });

  /** RF-C-03: il contesto, mutazioni che restituiscono la conversazione intera. */
  for (const metodo of ['put', 'delete'] as const) {
    app[metodo]<{ Params: { id: string; documentoId: string } }>(
      '/api/conversazioni/:id/contesto/:documentoId',
      async (richiesta) => {
        return conIdentita(poolDb(), richiesta.identita, async (client) => {
          const esistente = await conversazionePerId(client, richiesta.identita, richiesta.params.id);
          const contesto =
            metodo === 'put'
              ? await contestoValidato(client, richiesta.identita, esistente.documenti_in_contesto, [
                  richiesta.params.documentoId,
                ])
              : esistente.documenti_in_contesto.filter((d) => d !== richiesta.params.documentoId);
          const r = await client.query<RigaConversazione>(
            `update velia.conversazioni set documenti_in_contesto = $2, updated_at = now()
             where id = $1 and tenant_id = $3
             returning id, titolo, created_at, updated_at, documenti_in_contesto, condivisa, autore_id`,
            [esistente.id, contesto, richiesta.identita.tenantId],
          );
          if (!r.rowCount) throw ErroreApi.permessoNegato('Solo chi ha aperto la conversazione può modificarne il contesto.');
          return (await idrata(client, r.rows))[0]!;
        });
      },
    );
  }

  /**
   * La rotta SSE. Prima dello stream tutto è HTTP normale (400/404/409);
   * dopo gli header, ogni guasto è un evento `errore`. Il messaggio utente si
   * persiste subito, il job si accoda, e da lì in poi si inoltra ciò che il
   * worker emette sul canale del job — fino a `fine` o `errore`.
   */
  app.post<{ Params: { id: string } }>('/api/conversazioni/:id/messaggi', async (richiesta, risposta) => {
    const esito = schemaNuovoMessaggio.safeParse(richiesta.body ?? {});
    if (!esito.success || !esito.data.testo.trim()) {
      throw new ErroreApi(400, 'MESSAGGIO_VUOTO', 'Il messaggio è vuoto.');
    }
    const { testo, documentiReferenziati, esportazione } = esito.data;
    const { tenantId, utenteId } = richiesta.identita;
    /* Pricing: senza crediti la domanda non parte (429 CREDITI_ESAURITI). */
    await richiediCrediti(poolDb(), tenantId);

    const { messaggioUtenteId, titoloProvvisorio } = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await conversazionePerId(client, richiesta.identita, richiesta.params.id);
      if (esistente.autore_id !== utenteId) {
        throw ErroreApi.permessoNegato('Solo chi ha aperto la conversazione può scriverci.');
      }
      const contesto = await contestoValidato(
        client,
        richiesta.identita,
        esistente.documenti_in_contesto,
        documentiReferenziati,
      );
      /* Sul primo messaggio il titolo è un provvisorio (le prime parole): a
         risposta pronta il worker lo sostituisce con uno sensato, generato
         su domanda e risposta — a meno che l'utente non rinomini prima. */
      const derivato = esistente.titolo === TITOLO_NUOVA;
      const titolo = derivato ? titoloDaMessaggio(testo) : esistente.titolo;
      await client.query(
        `update velia.conversazioni set documenti_in_contesto = $2, titolo = $3, updated_at = now()
         where id = $1`,
        [esistente.id, contesto, titolo],
      );
      const m = await client.query<{ id: string }>(
        `insert into velia.messaggi
           (conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati)
         values ($1, $2, 'utente', $3, $4, $5) returning id`,
        [esistente.id, tenantId, utenteId, testo, documentiReferenziati],
      );
      return { messaggioUtenteId: m.rows[0]!.id, titoloProvvisorio: derivato ? titolo : undefined };
    });

    const messaggioAssistenteId = randomUUID();
    const jobId = await accoda(
      poolDb(),
      'interrogazione',
      {
        conversazioneId: richiesta.params.id,
        messaggioUtenteId,
        messaggioAssistenteId,
        utenteId,
        testo,
        ...(titoloProvvisorio && { titoloProvvisorio }),
        /* L'Esportazione elaborata: il job produce un documento, non una risposta. */
        ...(esportazione && { esportazione }),
      },
      { tenantId, utenteId },
    );

    await trasmettiStream(richiesta, risposta, {
      jobId,
      inizio: { tipo: 'inizio', messaggioId: messaggioAssistenteId, messaggioUtenteId },
      ponte: ponte(),
      battitoMs: opzioni.battitoMs ?? 15_000,
    });
  });
}

/** Lo stream vero e proprio: header, `inizio`, inoltro degli eventi, chiusura. */
async function trasmettiStream(
  richiesta: FastifyRequest,
  risposta: FastifyReply,
  o: { jobId: string; inizio: EventoStream; ponte: PonteEventi; battitoMs: number },
): Promise<void> {
  /* Il plugin CORS ha già messo i suoi header sulla reply di Fastify; con
     l'hijack si scrive direttamente sul socket e andrebbero persi: si
     copiano. Senza, il browser blocca lo stream quando app e API stanno su
     host diversi (Render: app-dev → api-dev). */
  const intestazioniCors = Object.fromEntries(
    Object.entries(risposta.getHeaders())
      .filter(([nome]) => nome.toLowerCase().startsWith('access-control-') || nome.toLowerCase() === 'vary')
      .map(([nome, valore]) => [nome, Array.isArray(valore) ? valore.join(', ') : String(valore)]),
  );
  risposta.hijack();
  const raw = risposta.raw;
  raw.writeHead(200, {
    ...intestazioniCors,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const scrivi = (evento: EventoStream | Record<string, unknown>) => {
    if (!raw.writableEnded) raw.write(`data: ${JSON.stringify(evento)}\n\n`);
  };
  scrivi(o.inizio);

  let concluso = false;
  const battito = setInterval(() => {
    if (!raw.writableEnded) raw.write(':\n\n');
  }, o.battitoMs);
  const iscrizione: { disiscrivi?: () => void } = {};

  const chiudi = (): void => {
    if (concluso) return;
    concluso = true;
    clearInterval(battito);
    iscrizione.disiscrivi?.();
    if (!raw.writableEnded) raw.end();
  };

  iscrizione.disiscrivi = await o.ponte.iscriviti(o.jobId, (evento) => {
    const dati = { tipo: evento.tipo, ...evento.dati };
    scrivi(dati);
    if (dati.tipo === 'fine' || dati.tipo === 'errore') chiudi();
  });
  // Il replay del pregresso può aver già chiuso: allora la disiscrizione va fatta ora.
  if (concluso) iscrizione.disiscrivi();

  /* Il client ha chiuso prima della fine: «ferma la risposta». Il job si
     segna annullato e il worker si ferma al primo passo utile. Una caduta di
     rete che arriva come chiusura pulita fa lo stesso: non siamo in grado di
     distinguerla, ed è meglio un job fermato di uno che paga per nessuno. */
  raw.on('close', () => {
    if (concluso) return;
    chiudi();
    void poolDb()
      .query(
        `update velia.jobs set stato = 'annullato' where id = $1 and stato in ('in-coda', 'in-esecuzione')`,
        [o.jobId],
      )
      .catch((errore: unknown) => richiesta.log.warn({ err: errore, jobId: o.jobId }, 'annullamento non registrato'));
  });

  // Il job è già in stato terminale? Allora non arriverà più nulla: si chiude con un errore leggibile.
  const stato = await poolDb().query<{ stato: string }>(`select stato from velia.jobs where id = $1`, [o.jobId]);
  if (!concluso && stato.rows[0] && ['fallito', 'annullato'].includes(stato.rows[0].stato)) {
    scrivi({ tipo: 'errore', messaggio: 'La risposta non è stata prodotta.' });
    chiudi();
  }
}

async function conversazionePerId(
  client: pg.ClientBase,
  identita: Identita,
  id: string,
): Promise<RigaConversazione> {
  const r = await client.query<RigaConversazione>(
    `select id, titolo, created_at, updated_at, documenti_in_contesto, condivisa, autore_id
     from velia.conversazioni where id = $1 and tenant_id = $2`,
    [id, identita.tenantId],
  );
  const riga = r.rows[0];
  if (!riga) throw new ErroreApi(404, 'NON_TROVATA', 'Conversazione inesistente.');
  return riga;
}

/**
 * Aggiunge documenti al contesto verificando che esistano e si possano
 * leggere (RLS), e che i privati siano pronti (409 NON_PRONTO); gli allegati
 * sono sempre referenziabili (nascono con la conversazione). Idempotente.
 */
async function contestoValidato(
  client: pg.ClientBase,
  identita: Identita,
  attuale: string[],
  daAggiungere: string[],
): Promise<string[]> {
  const contesto = [...attuale];
  for (const id of daAggiungere) {
    if (contesto.includes(id)) continue;
    const r = await client.query<{ archivio: string; stato: string; titolo: string }>(
      `select archivio, stato, titolo from velia.documenti
       where id = $1 and (archivio = 'pubblico' or tenant_id = $2)`,
      [id, identita.tenantId],
    );
    const doc = r.rows[0];
    if (!doc) throw ErroreApi.nonTrovato('Documento inesistente.');
    if (doc.archivio === 'privato' && doc.stato !== 'pronto') {
      throw ErroreApi.conflitto(
        'NON_PRONTO',
        `«${doc.titolo}» non è ancora elaborato: non può essere referenziato finché non è pronto.`,
      );
    }
    contesto.push(id);
  }
  return contesto;
}

/** Il contesto idratato: gli id non risolvibili spariscono in silenzio (mock). */
async function idrata(client: pg.ClientBase, righe: RigaConversazione[]): Promise<Conversazione[]> {
  const ids = [...new Set(righe.flatMap((r) => r.documenti_in_contesto))];
  const titoli = new Map<string, RiferimentoDocumento>();
  if (ids.length) {
    const docs = await client.query<{ id: string; titolo: string; archivio: RiferimentoDocumento['archivio'] }>(
      `select id, titolo, archivio from velia.documenti where id = any($1)`,
      [ids],
    );
    for (const d of docs.rows) titoli.set(d.id, { id: d.id, titolo: d.titolo, archivio: d.archivio });
  }
  return righe.map((r) => ({
    id: r.id,
    titolo: r.titolo,
    creataIl: r.created_at.toISOString(),
    aggiornataIl: r.updated_at.toISOString(),
    documentiInContesto: r.documenti_in_contesto
      .map((id) => titoli.get(id))
      .filter((d): d is RiferimentoDocumento => Boolean(d)),
    condivisa: r.condivisa,
    autoreId: r.autore_id,
  }));
}

function versoMessaggio(r: RigaMessaggio): Messaggio {
  return {
    id: r.id,
    conversazioneId: r.conversazione_id,
    autore: r.autore,
    testo: r.testo,
    inviatoIl: r.inviato_il.toISOString(),
    documentiReferenziati: r.documenti_referenziati,
    citazioni: r.citazioni,
    provenienze: r.provenienze,
    ...(r.non_supportato && { nonSupportato: true }),
    ...(r.documenti?.length && { documenti: r.documenti }),
  };
}
