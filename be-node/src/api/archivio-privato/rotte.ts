import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { type Compagnia, type Ramo, type TipologiaDocumento } from '../../contratto/documenti.js';
import {
  schemaFiltriDocumentiPrivati,
  schemaModificheDocumento,
  type DocumentoPrivato,
  type EsitoCaricamento,
  type Etichetta,
  type PaginaDocumentiPrivati,
  type SpazioTenant,
  type StatoElaborazione,
} from '../../contratto/documenti-privati.js';
import { ErroreApi } from '../../contratto/errori.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { accoda } from '../../worker/coda.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * L'Archivio Privato (RF-B-01…B-05, B-07…B-09): le rotte che il FE chiama
 * da `core/api/documenti-privati-api.ts`, col comportamento fissato da
 * `mocks/archivio-privato.mjs`. Qui finisce il ponte: il mock resta per la
 * demo self-contained, in sviluppo il proxy manda queste rotte al backend.
 *
 * La garanzia di isolamento (RF-B-01) non è in questo file: è la RLS di
 * `velia.documenti`, che mostra il privato del proprio tenant e basta.
 * Le query lo ripetono (`tenant_id = …`) per usare l'indice, non per fidarsi.
 */

/** La riga dell'elenco: documento + compagnia e ramo (se proposti/confermati). */
interface RigaPrivato {
  id: string;
  titolo: string;
  tipologia: TipologiaDocumento;
  numero_pagine: number | null;
  stato: StatoElaborazione;
  errore_elaborazione: string | null;
  caricato_da: string | null;
  caricato_il: Date;
  dimensione_byte: string; // bigint: pg lo consegna come stringa
  etichette: string[];
  riferimento_cliente: string | null;
  classificazione_da_confermare: boolean;
  documento_di_riferimento: boolean;
  visibilita: 'tenant' | 'personale';
  compagnia_id: string | null;
  compagnia_nome: string | null;
  compagnia_aggiornamento: string | null;
  ramo_id: string | null;
  ramo_nome: string | null;
  ramo_codice: string | null;
  totale?: string;
}

function versoDocumento(r: RigaPrivato): DocumentoPrivato {
  const compagnia: Compagnia | undefined = r.compagnia_id
    ? {
        id: r.compagnia_id,
        nome: r.compagnia_nome!,
        ...(r.compagnia_aggiornamento && { ultimoAggiornamento: r.compagnia_aggiornamento }),
      }
    : undefined;
  const ramo: Ramo | undefined = r.ramo_id
    ? { id: r.ramo_id, nome: r.ramo_nome!, codice: r.ramo_codice! }
    : undefined;
  return {
    id: r.id,
    archivio: 'privato',
    titolo: r.titolo,
    tipologia: r.tipologia,
    ...(r.numero_pagine !== null && { numeroPagine: r.numero_pagine }),
    fileUrl: `/api/documenti-privati/${r.id}/file`,
    stato: r.stato,
    ...(r.stato === 'errore' && r.errore_elaborazione && { erroreElaborazione: r.errore_elaborazione }),
    caricatoDa: r.caricato_da ?? '',
    caricatoIl: r.caricato_il.toISOString(),
    dimensioneByte: Number(r.dimensione_byte),
    etichette: r.etichette,
    ...(compagnia && { compagnia }),
    ...(ramo && { ramo }),
    ...(r.riferimento_cliente && { riferimentoCliente: r.riferimento_cliente }),
    ...(r.classificazione_da_confermare && { classificazioneDaConfermare: true }),
    documentoDiRiferimento: r.documento_di_riferimento,
    visibilita: r.visibilita,
  };
}

const SQL_BASE = `
  select d.id, d.titolo, d.tipologia, d.numero_pagine, d.stato, d.errore_elaborazione,
         d.caricato_da, d.caricato_il, d.dimensione_byte, d.etichette,
         d.riferimento_cliente, d.classificazione_da_confermare,
         d.documento_di_riferimento, d.visibilita,
         c.id as compagnia_id, c.nome as compagnia_nome,
         c.ultimo_aggiornamento as compagnia_aggiornamento,
         r.id as ramo_id, r.nome as ramo_nome, r.codice as ramo_codice
  from velia.documenti d
  left join velia.compagnie c on c.id = d.compagnia_id
  left join velia.rami r on r.id = d.ramo_id
  where d.archivio = 'privato' and d.tenant_id = $1`;

/** Il più recente in cima (lo stub ordina per `caricatoIl` decrescente). */
const SQL_ORDINE = ` order by d.caricato_il desc, d.id`;

/** Un file arrivato col multipart, già in memoria (max `limiteFileByte`, decine di MB). */
interface FileRicevuto {
  nome: string;
  mimetype: string;
  contenuto: Buffer;
  troncato: boolean;
}

/** I byte con cui comincia ogni PDF: il nome e il mimetype li dichiara il client, questo no. */
const FIRMA_PDF = Buffer.from('%PDF-');

function ePdf(f: FileRicevuto): boolean {
  const dichiarato = f.mimetype === 'application/pdf' || /\.pdf$/i.test(f.nome);
  return dichiarato && f.contenuto.subarray(0, 1024).includes(FIRMA_PDF);
}

/** Id opaco e testuale come nel contratto (`doc-priv-…`), mai sequenziale. */
const nuovoId = (): string => `doc-priv-${randomBytes(6).toString('hex')}`;

/** Dove vive un privato nello Storage: sotto il tenant, per id. */
export const percorsoPdf = (tenantId: string, id: string): string =>
  `tenant/${tenantId}/documenti/${id}.pdf`;

export interface OpzioniArchivioPrivato {
  /** Nei test: un archivio finto al posto dello Storage. */
  archivio?: ArchivioFile;
}

export function registraRotteArchivioPrivato(
  app: FastifyInstance,
  opzioni: OpzioniArchivioPrivato = {},
): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => (opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage()));

  /** RF-B-04/B-05: elenco con ricerca, filtri per stato ed etichetta, paginazione. */
  app.get('/api/documenti-privati', async (richiesta) => {
    const esito = schemaFiltriDocumentiPrivati.safeParse(richiesta.query);
    if (!esito.success) throw ErroreApi.datiNonValidi('Filtri di ricerca non validi.');
    const filtri = esito.data;

    const condizioni: string[] = [];
    const parametri: unknown[] = [richiesta.identita.tenantId];
    const par = (v: unknown): string => {
      parametri.push(v);
      return `$${parametri.length}`;
    };

    if (filtri.tipologia) condizioni.push(`d.tipologia = ${par(filtri.tipologia)}`);
    if (filtri.stato) condizioni.push(`d.stato = ${par(filtri.stato)}`);
    if (filtri.etichetta) condizioni.push(`${par(filtri.etichetta)} = any(d.etichette)`);
    if (filtri.soloRiferimenti) condizioni.push(`d.documento_di_riferimento`);

    /* Come lo stub: tutte le parole, in qualsiasi ordine, senza accenti —
       su titolo, riferimento cliente ed etichette (non compagnia né ramo:
       è il contratto, non un'omissione). */
    for (const parola of (filtri.q ?? '').split(/\s+/).filter(Boolean)) {
      condizioni.push(
        `extensions.unaccent(lower(concat_ws(' ', d.titolo, d.riferimento_cliente, array_to_string(d.etichette, ' '))))
         like '%' || extensions.unaccent(lower(${par(parola)})) || '%'`,
      );
    }

    const dove = condizioni.length ? ` and ${condizioni.join(' and ')}` : '';
    const parametriFiltro = [...parametri];
    const limite = ` limit ${par(filtri.perPagina)} offset ${par((filtri.pagina - 1) * filtri.perPagina)}`;
    const conTotale = SQL_BASE.replace(
      '\n  from velia.documenti d',
      ',\n         count(*) over() as totale\n  from velia.documenti d',
    );

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<PaginaDocumentiPrivati> => {
      const righe = await client.query<RigaPrivato>(`${conTotale}${dove}${SQL_ORDINE}${limite}`, parametri);
      let totale = Number(righe.rows[0]?.totale ?? -1);
      if (totale < 0) {
        // Pagina oltre la fine: nessuna riga, il conteggio va chiesto a parte.
        const conta = await client.query<{ totale: string }>(
          `select count(*) as totale from (${SQL_BASE}${dove}) conteggio`,
          parametriFiltro,
        );
        totale = Number(conta.rows[0]?.totale ?? 0);
      }
      return {
        elementi: righe.rows.map(versoDocumento),
        totale,
        pagina: filtri.pagina,
        perPagina: filtri.perPagina,
      };
    });
  });

  /**
   * RF-B-02: caricamento, singolo e multiplo in una richiesta sola
   * (campo `file` ripetuto). Il lotto è atomico come nel mock: un file
   * troppo grande o lo spazio che non basta rifiutano tutto, e il FE marca
   * l'intero lotto. Ogni documento creato nasce `in-coda` con il job di
   * ingestion già accodato: da qui in poi parla il polling (RF-B-05).
   */
  app.post('/api/documenti-privati', async (richiesta, risposta) => {
    if (!richiesta.isMultipart()) {
      throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    }

    const ricevuti: FileRicevuto[] = [];
    for await (const parte of richiesta.parts()) {
      if (parte.type !== 'file') continue;
      const contenuto = await parte.toBuffer();
      if (!parte.filename) continue; // una parte file senza nome non è un file
      ricevuti.push({
        nome: parte.filename,
        mimetype: parte.mimetype,
        contenuto,
        troncato: parte.file.truncated,
      });
    }
    if (!ricevuti.length) {
      throw new ErroreApi(400, 'NESSUN_FILE', 'La richiesta non contiene file.');
    }

    const { tenantId, utenteId } = richiesta.identita;
    const spazio = await conIdentita(poolDb(), richiesta.identita, (client) =>
      spazioDelTenant(client, tenantId),
    );

    for (const f of ricevuti) {
      if (f.troncato || f.contenuto.length > spazio.limiteFileByte) {
        const mb = Math.round(spazio.limiteFileByte / 1024 / 1024);
        throw new ErroreApi(413, 'FILE_TROPPO_GRANDE', `«${f.nome}» supera il limite di ${mb} MB per file.`);
      }
    }
    for (const f of ricevuti) {
      if (!ePdf(f)) {
        throw new ErroreApi(
          415,
          'FORMATO_NON_SUPPORTATO',
          `«${f.nome}» non è un PDF: per ora l'archivio accetta solo documenti PDF.`,
        );
      }
    }
    const pesoLotto = ricevuti.reduce((s, f) => s + f.contenuto.length, 0);
    if (spazio.usatoByte + pesoLotto > spazio.limiteByte) {
      throw new ErroreApi(507, 'SPAZIO_ESAURITO', 'Lo spazio del piano non basta per questi documenti.');
    }

    /* Prima i byte nello Storage, poi le righe (firmate dalla RLS), infine
       i job. Se qualcosa si rompe a metà, i byte già caricati si tolgono:
       niente orfani nello Storage. */
    const daCreare = ricevuti.map((f) => ({ ...f, id: nuovoId() }));
    const caricati: string[] = [];
    let creati: DocumentoPrivato[];
    try {
      for (const f of daCreare) {
        const percorso = percorsoPdf(tenantId, f.id);
        await archivio().carica(percorso, f.contenuto, 'application/pdf');
        caricati.push(percorso);
      }

      creati = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const esiti: DocumentoPrivato[] = [];
        for (const f of daCreare) {
          await client.query(
            `insert into velia.documenti
               (id, archivio, tenant_id, titolo, tipologia, stato, path_pdf, nome_file,
                caricato_da, caricato_il, dimensione_byte, classificazione_da_confermare)
             values ($1, 'privato', $2, $3, 'altro', 'in-coda', $4, $5, $6, now(), $7, true)`,
            [
              f.id,
              tenantId,
              f.nome.replace(/\.[^.]+$/, '') || f.nome,
              percorsoPdf(tenantId, f.id),
              f.nome,
              utenteId,
              f.contenuto.length,
            ],
          );
          esiti.push((await documentoPerId(client, tenantId, f.id))!);
        }
        return esiti;
      });
    } catch (errore) {
      await archivio()
        .elimina(caricati)
        .catch((e: unknown) => richiesta.log.warn({ err: e, caricati }, 'pulizia storage fallita'));
      throw errore;
    }

    for (const doc of creati) {
      try {
        await accoda(poolDb(), 'ingestion', { documentoId: doc.id }, { tenantId, utenteId });
      } catch (errore) {
        /* Il documento c'è ma nessuno lo lavorerà: meglio dirlo subito che
           lasciarlo in coda per sempre. */
        richiesta.log.error({ err: errore, documentoId: doc.id }, 'accodamento ingestion fallito');
        doc.stato = 'errore';
        doc.erroreElaborazione =
          "Non è stato possibile avviare l'elaborazione: elimina il documento e ricaricalo.";
        await poolDb().query(
          `update velia.documenti set stato = 'errore', errore_elaborazione = $2 where id = $1`,
          [doc.id, doc.erroreElaborazione],
        );
      }
    }

    void risposta.code(201);
    const esito: EsitoCaricamento = { creati };
    return esito;
  });

  /** La scheda (il FE non fa polling qui: si aggiorna su azione). */
  app.get<{ Params: { id: string } }>('/api/documenti-privati/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const documento = await documentoPerId(client, richiesta.identita.tenantId, richiesta.params.id);
      if (!documento) throw ErroreApi.nonTrovato('Documento inesistente.');
      return documento;
    });
  });

  /**
   * RF-B-03/B-04: titolo, tipologia, compagnia, ramo, cliente, etichette.
   * Toccare i metadati vale come conferma della classificazione proposta:
   * `classificazioneDaConfermare` si spegne anche con un corpo vuoto (mock).
   */
  app.patch<{ Params: { id: string } }>('/api/documenti-privati/:id', async (richiesta) => {
    const esito = schemaModificheDocumento.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al documento non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const esistente = await documentoPerId(client, tenantId, richiesta.params.id);
      if (!esistente) throw ErroreApi.nonTrovato('Documento inesistente.');

      const assegnazioni = ['classificazione_da_confermare = false'];
      const parametri: unknown[] = [richiesta.params.id, tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };

      if (m.titolo !== undefined) assegnazioni.push(`titolo = ${par(m.titolo)}`);
      if (m.tipologia !== undefined) assegnazioni.push(`tipologia = ${par(m.tipologia)}`);
      if (m.compagniaId !== undefined) {
        if (m.compagniaId !== null) await verificaTassonomia(client, 'compagnie', m.compagniaId);
        assegnazioni.push(`compagnia_id = ${par(m.compagniaId)}`);
      }
      if (m.ramoId !== undefined) {
        if (m.ramoId !== null) await verificaTassonomia(client, 'rami', m.ramoId);
        assegnazioni.push(`ramo_id = ${par(m.ramoId)}`);
      }
      if (m.riferimentoCliente !== undefined) {
        assegnazioni.push(`riferimento_cliente = ${par(m.riferimentoCliente || null)}`);
      }
      if (m.etichette !== undefined) {
        assegnazioni.push(`etichette = ${par([...new Set(m.etichette)])}::text[]`);
      }

      await client.query(
        `update velia.documenti set ${assegnazioni.join(', ')}
         where id = $1 and tenant_id = $2 and archivio = 'privato'`,
        parametri,
      );
      return (await documentoPerId(client, tenantId, richiesta.params.id))!;
    });
  });

  /**
   * RF-B-04 + RNF-03: l'eliminazione è effettiva — riga, PDF e Markdown
   * spariscono insieme. Lo Storage si svuota dentro la transazione: se la
   * rimozione dei byte fallisce, la riga resta e l'utente riprova; non
   * esistono documenti «cancellati» che il motore potrebbe ancora leggere.
   */
  app.delete<{ Params: { id: string } }>('/api/documenti-privati/:id', async (richiesta, risposta) => {
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ path_pdf: string | null; path_md: string | null }>(
        `delete from velia.documenti
         where id = $1 and tenant_id = $2 and archivio = 'privato'
         returning path_pdf, path_md`,
        [richiesta.params.id, richiesta.identita.tenantId],
      );
      const riga = r.rows[0];
      if (!riga) throw ErroreApi.nonTrovato('Documento inesistente.');
      await archivio().elimina([riga.path_pdf, riga.path_md].filter((p): p is string => Boolean(p)));
    });
    return risposta.code(204).send();
  });

  /**
   * Il PDF per il visualizzatore, dallo Storage. Come per il pubblico,
   * l'autorizzazione è la lettura di catalogo via RLS; in più, finché
   * l'elaborazione non è conclusa l'anteprima non c'è (contratto mock).
   */
  app.get<{ Params: { id: string } }>('/api/documenti-privati/:id/file', async (richiesta, risposta) => {
    const riga = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ path_pdf: string | null; stato: StatoElaborazione }>(
        `select path_pdf, stato from velia.documenti
         where archivio = 'privato' and tenant_id = $2 and id = $1`,
        [richiesta.params.id, richiesta.identita.tenantId],
      );
      return r.rows[0];
    });
    if (!riga) throw ErroreApi.nonTrovato('Documento inesistente.');
    if (riga.stato !== 'pronto') {
      throw ErroreApi.conflitto('NON_PRONTO', "L'anteprima è disponibile solo a elaborazione conclusa.");
    }
    if (!riga.path_pdf) {
      throw new ErroreApi(404, 'FILE_MANCANTE', 'Il file di questo documento non è più in archivio.');
    }

    let pdf: Buffer;
    try {
      pdf = await archivio().scarica(riga.path_pdf);
    } catch (errore) {
      richiesta.log.error({ path: riga.path_pdf, err: errore }, 'file non leggibile dallo storage');
      throw new ErroreApi(500, 'ERRORE_INTERNO', 'Il servizio non è momentaneamente disponibile.');
    }
    void risposta
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'inline')
      .send(pdf);
  });

  /**
   * RF-B-09: promozione a documento di riferimento. Qui solo il flag (e la
   * scheda che lo indica); il governo — ambito, attivo — vive nelle
   * Istruzioni (Fase 6). Si promuove solo ciò che l'AI sa già leggere.
   */
  for (const metodo of ['put', 'delete'] as const) {
    app[metodo]<{ Params: { id: string } }>('/api/documenti-privati/:id/riferimento', async (richiesta) => {
      return conIdentita(poolDb(), richiesta.identita, async (client) => {
        const { tenantId } = richiesta.identita;
        const documento = await documentoPerId(client, tenantId, richiesta.params.id);
        if (!documento) throw ErroreApi.nonTrovato('Documento inesistente.');
        if (metodo === 'put' && documento.stato !== 'pronto') {
          throw ErroreApi.conflitto(
            'NON_PRONTO',
            "Il documento non è ancora elaborato: non può diventare contesto permanente finché l'AI non riesce a leggerlo.",
          );
        }
        await client.query(
          `update velia.documenti set documento_di_riferimento = $3
           where id = $1 and tenant_id = $2 and archivio = 'privato'`,
          [richiesta.params.id, tenantId, metodo === 'put'],
        );
        /* Fase 6: il ruolo ha un governo (ambito, attivazione) in
           `velia.riferimenti`. La promozione crea la voce coi valori di
           partenza — chi promuove vuole che il documento conti; la
           demozione la toglie. */
        if (metodo === 'put') {
          await client.query(
            `insert into velia.riferimenti (tenant_id, documento_id, origine, caricato_da)
             values ($1, $2, 'promosso', $3)
             on conflict (documento_id) do update set attivo = true`,
            [tenantId, richiesta.params.id, richiesta.identita.utenteId],
          );
        } else {
          await client.query(`delete from velia.riferimenti where documento_id = $1`, [
            richiesta.params.id,
          ]);
        }
        return { ...documento, documentoDiRiferimento: metodo === 'put' };
      });
    });
  }

  /** RF-B-04: le etichette in uso, con quanti documenti le portano. */
  app.get('/api/etichette', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<{ nome: string; documenti: number }>(
        `select e as nome, count(*)::int as documenti
         from velia.documenti d cross join unnest(d.etichette) as e
         where d.archivio = 'privato' and d.tenant_id = $1
         group by e
         order by count(*) desc, e collate "it-x-icu"`,
        [richiesta.identita.tenantId],
      );
      return righe.rows satisfies Etichetta[];
    });
  });

  /** RF-B-08: quanto spazio c'è e quanto ne è usato (lo chiede anche il polling). */
  app.get('/api/spazio', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, (client) =>
      spazioDelTenant(client, richiesta.identita.tenantId),
    );
  });
}

async function documentoPerId(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<DocumentoPrivato | undefined> {
  const righe = await client.query<RigaPrivato>(`${SQL_BASE} and d.id = $2`, [tenantId, id]);
  const riga = righe.rows[0];
  return riga ? versoDocumento(riga) : undefined;
}

async function spazioDelTenant(client: pg.ClientBase, tenantId: string): Promise<SpazioTenant> {
  const [limiti, uso] = await Promise.all([
    client.query<{ limite_spazio_byte: string; limite_file_byte: string }>(
      `select limite_spazio_byte, limite_file_byte from velia.tenant where id = $1`,
      [tenantId],
    ),
    client.query<{ usato: string; numero: number }>(
      `select coalesce(sum(dimensione_byte), 0)::bigint as usato, count(*)::int as numero
       from velia.documenti where archivio = 'privato' and tenant_id = $1`,
      [tenantId],
    ),
  ]);
  const l = limiti.rows[0];
  if (!l) throw ErroreApi.permessoNegato();
  return {
    usatoByte: Number(uso.rows[0]?.usato ?? 0),
    limiteByte: Number(l.limite_spazio_byte),
    limiteFileByte: Number(l.limite_file_byte),
    numeroDocumenti: uso.rows[0]?.numero ?? 0,
  };
}

async function verificaTassonomia(
  client: pg.ClientBase,
  tabella: 'compagnie' | 'rami',
  id: string,
): Promise<void> {
  const r = await client.query(`select 1 from velia.${tabella} where id = $1`, [id]);
  if (!r.rowCount) {
    throw ErroreApi.datiNonValidi(
      tabella === 'compagnie' ? 'Compagnia inesistente.' : 'Ramo inesistente.',
    );
  }
}

