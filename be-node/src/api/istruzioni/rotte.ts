import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { ErroreApi } from '../../contratto/errori.js';
import {
  colonneAmbito,
  schemaModificheRegola,
  schemaModificheRiferimento,
  schemaNuovaRegola,
  versoAmbito,
  type AmbitoIstruzione,
  type DocumentoRiferimento,
  type RegolaIstruzione,
  type VoceStoricoImpostazioni,
} from '../../contratto/impostazioni.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { accoda } from '../../worker/coda.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';
import { percorsoPdf } from '../archivio-privato/rotte.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { registraStorico } from '../template/rotte.js';

/**
 * Le due nature del DNA d'Agenzia (RF-D-04…D-08, D-14…D-16): regole scritte
 * e documenti di riferimento, più lo storico unico (RF-D-07) che ogni
 * mutazione delle impostazioni alimenta dalla Fase 4.
 *
 * Un documento di riferimento È un documento dell'Archivio Privato con un
 * ruolo in più: promosso da lì (RF-B-09) o caricato qui — anche in quel
 * caso la riga sta in `documenti` (stessa pipeline, stesso visualizzatore,
 * citazioni che restano nel contratto). Il governo del ruolo — ambito,
 * attivazione, origine — sta in `velia.riferimenti`, ed è ciò che il motore
 * consulta per decidere quali riferimenti entrano nel DNA.
 */

interface RigaRegola {
  id: string;
  titolo: string;
  testo: string;
  ambito_tipo: string;
  ambito_ramo_id: string | null;
  ambito_compagnia_id: string | null;
  attiva: boolean;
  creata_da: string | null;
  updated_at: Date;
}

interface RigaRiferimento {
  id: string;
  documento_id: string;
  origine: 'promosso' | 'caricato';
  ambito_tipo: string;
  ambito_ramo_id: string | null;
  ambito_compagnia_id: string | null;
  attivo: boolean;
  caricato_da: string | null;
  updated_at: Date;
  titolo: string;
  numero_pagine: number | null;
  dimensione_md_byte: string | null;
  dimensione_byte: string | null;
  path_pdf: string | null;
  path_md: string | null;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIRMA_PDF = Buffer.from('%PDF-');

export interface OpzioniIstruzioni {
  /** Nei test: un archivio finto al posto dello Storage. */
  archivio?: ArchivioFile;
}

export function registraRotteIstruzioni(app: FastifyInstance, opzioni: OpzioniIstruzioni = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());

  // --- Regole scritte (RF-D-04/06/08) --------------------------------------

  app.get('/api/istruzioni/regole', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<RigaRegola>(
        `select id, titolo, testo, ambito_tipo, ambito_ramo_id, ambito_compagnia_id,
                attiva, creata_da, updated_at
         from velia.istruzioni where tenant_id = $1
         order by updated_at desc, id`,
        [richiesta.identita.tenantId],
      );
      return righe.rows.map(versoRegola);
    });
  });

  app.post('/api/istruzioni/regole', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    const esito = schemaNuovaRegola.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw new ErroreApi(400, 'REGOLA_VUOTA', 'A una regola servono un titolo e un testo.');
    }
    const nuova = esito.data;

    const regola = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      await verificaAmbito(client, nuova.ambito);
      const ambito = colonneAmbito(nuova.ambito);
      const r = await client.query<RigaRegola>(
        `insert into velia.istruzioni
           (tenant_id, titolo, testo, ambito_tipo, ambito_ramo_id, ambito_compagnia_id, creata_da)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id, titolo, testo, ambito_tipo, ambito_ramo_id, ambito_compagnia_id,
                   attiva, creata_da, updated_at`,
        [
          richiesta.identita.tenantId,
          nuova.titolo,
          nuova.testo,
          ambito.tipo,
          ambito.ramoId,
          ambito.compagniaId,
          richiesta.identita.utenteId,
        ],
      );
      await registraStorico(
        client,
        richiesta.identita,
        'creazione',
        'regola',
        `Creata la regola «${nuova.titolo}»`,
      );
      return versoRegola(r.rows[0]!);
    });
    void risposta.code(201);
    return regola;
  });

  app.patch<{ Params: { id: string } }>('/api/istruzioni/regole/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaModificheRegola.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche alla regola non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await regolaPerId(client, richiesta.identita.tenantId, richiesta.params.id);
      if (m.ambito) await verificaAmbito(client, m.ambito);

      const assegnazioni: string[] = ['updated_at = now()'];
      const parametri: unknown[] = [esistente.id, richiesta.identita.tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      if (m.titolo !== undefined) assegnazioni.push(`titolo = ${par(m.titolo)}`);
      if (m.testo !== undefined) assegnazioni.push(`testo = ${par(m.testo)}`);
      if (m.ambito !== undefined) {
        const ambito = colonneAmbito(m.ambito);
        assegnazioni.push(
          `ambito_tipo = ${par(ambito.tipo)}`,
          `ambito_ramo_id = ${par(ambito.ramoId)}`,
          `ambito_compagnia_id = ${par(ambito.compagniaId)}`,
        );
      }
      if (m.attiva !== undefined) assegnazioni.push(`attiva = ${par(m.attiva)}`);

      const r = await client.query<RigaRegola>(
        `update velia.istruzioni set ${assegnazioni.join(', ')}
         where id = $1 and tenant_id = $2
         returning id, titolo, testo, ambito_tipo, ambito_ramo_id, ambito_compagnia_id,
                   attiva, creata_da, updated_at`,
        parametri,
      );
      const titolo = m.titolo ?? esistente.titolo;
      if (typeof m.attiva === 'boolean' && m.attiva !== esistente.attiva) {
        await registraStorico(
          client,
          richiesta.identita,
          m.attiva ? 'attivazione' : 'disattivazione',
          'regola',
          `${m.attiva ? 'Attivata' : 'Sospesa'} la regola «${titolo}»`,
        );
      } else {
        await registraStorico(client, richiesta.identita, 'modifica', 'regola', `Modificata la regola «${titolo}»`);
      }
      return versoRegola(r.rows[0]!);
    });
  });

  app.delete<{ Params: { id: string } }>('/api/istruzioni/regole/:id', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await regolaPerId(client, richiesta.identita.tenantId, richiesta.params.id);
      await client.query(`delete from velia.istruzioni where id = $1 and tenant_id = $2`, [
        esistente.id,
        richiesta.identita.tenantId,
      ]);
      await registraStorico(
        client,
        richiesta.identita,
        'eliminazione',
        'regola',
        `Eliminata la regola «${esistente.titolo}»`,
      );
    });
    return risposta.code(204).send();
  });

  // --- Documenti di riferimento (RF-D-14/15/16) ----------------------------

  /** L'elenco unico delle due origini, il più recente in cima. */
  app.get('/api/istruzioni/riferimenti', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<RigaRiferimento>(
        `${SQL_RIFERIMENTO} where r.tenant_id = $1 order by r.updated_at desc, r.id`,
        [richiesta.identita.tenantId],
      );
      return righe.rows.map(versoRiferimento);
    });
  });

  /**
   * RF-D-14: caricamento diretto. Il file diventa un documento privato con
   * il ruolo già addosso: stessa pipeline di ingestion, e il peso RF-D-16
   * arriverà dal Markdown convertito.
   */
  app.post('/api/istruzioni/riferimenti', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    if (!richiesta.isMultipart()) {
      throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    }
    const ricevuti: Array<{ nome: string; contenuto: Buffer }> = [];
    for await (const parte of richiesta.parts()) {
      if (parte.type !== 'file' || !parte.filename) continue;
      const contenuto = await parte.toBuffer();
      if (parte.file.truncated) {
        throw new ErroreApi(413, 'FILE_TROPPO_GRANDE', `«${parte.filename}» supera il limite per file.`);
      }
      if (!contenuto.subarray(0, 1024).includes(FIRMA_PDF)) {
        throw new ErroreApi(
          415,
          'FORMATO_NON_SUPPORTATO',
          `«${parte.filename}» non è un PDF: per ora i riferimenti accettano solo documenti PDF.`,
        );
      }
      ricevuti.push({ nome: parte.filename, contenuto });
    }
    if (!ricevuti.length) {
      throw new ErroreApi(400, 'NESSUN_FILE', 'La richiesta non contiene file.');
    }

    const { tenantId, utenteId } = richiesta.identita;
    const daCreare = ricevuti.map((f) => ({ ...f, id: `doc-priv-${randomBytes(6).toString('hex')}` }));
    const caricati: string[] = [];
    let creati: DocumentoRiferimento[];
    try {
      for (const f of daCreare) {
        const percorso = percorsoPdf(tenantId, f.id);
        await archivio().carica(percorso, f.contenuto, 'application/pdf');
        caricati.push(percorso);
      }
      creati = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const esiti: DocumentoRiferimento[] = [];
        for (const f of daCreare) {
          const titolo = f.nome.replace(/\.[^.]+$/, '') || f.nome;
          await client.query(
            `insert into velia.documenti
               (id, archivio, tenant_id, titolo, tipologia, stato, path_pdf, nome_file,
                caricato_da, caricato_il, dimensione_byte, documento_di_riferimento)
             values ($1, 'privato', $2, $3, 'altro', 'in-coda', $4, $5, $6, now(), $7, true)`,
            [f.id, tenantId, titolo, percorsoPdf(tenantId, f.id), f.nome, utenteId, f.contenuto.length],
          );
          const voce = await client.query<{ id: string }>(
            `insert into velia.riferimenti (tenant_id, documento_id, origine, caricato_da)
             values ($1, $2, 'caricato', $3) returning id`,
            [tenantId, f.id, utenteId],
          );
          await registraStorico(
            client,
            richiesta.identita,
            'creazione',
            'documento-riferimento',
            `Caricato «${titolo}»`,
          );
          esiti.push((await riferimentoPerId(client, tenantId, voce.rows[0]!.id))!);
        }
        return esiti;
      });
    } catch (errore) {
      await archivio()
        .elimina(caricati)
        .catch((e: unknown) => richiesta.log.warn({ err: e, caricati }, 'pulizia storage fallita'));
      throw errore;
    }

    for (const doc of daCreare) {
      try {
        await accoda(poolDb(), 'ingestion', { documentoId: doc.id }, { tenantId, utenteId });
      } catch (errore) {
        richiesta.log.error({ err: errore, documentoId: doc.id }, 'accodamento ingestion fallito');
        await poolDb().query(
          `update velia.documenti set stato = 'errore', errore_elaborazione = $2 where id = $1`,
          [doc.id, "Non è stato possibile avviare l'elaborazione: elimina il documento e ricaricalo."],
        );
      }
    }
    void risposta.code(201);
    return { creati };
  });

  /** Ambito e attivazione: il governo ordinario del contesto permanente. */
  app.patch<{ Params: { id: string } }>('/api/istruzioni/riferimenti/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaModificheRiferimento.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al riferimento non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await riferimentoPerId(client, richiesta.identita.tenantId, richiesta.params.id);
      if (!esistente) throw ErroreApi.nonTrovato('Documento di riferimento inesistente.');
      if (m.ambito) await verificaAmbito(client, m.ambito);

      const ambito = m.ambito ? colonneAmbito(m.ambito) : undefined;
      await client.query(
        `update velia.riferimenti
         set attivo = coalesce($3, attivo),
             ambito_tipo = coalesce($4, ambito_tipo),
             ambito_ramo_id = case when $4 is null then ambito_ramo_id else $5 end,
             ambito_compagnia_id = case when $4 is null then ambito_compagnia_id else $6 end,
             updated_at = now()
         where id = $1 and tenant_id = $2`,
        [
          esistente.id,
          richiesta.identita.tenantId,
          m.attivo ?? null,
          ambito?.tipo ?? null,
          ambito?.ramoId ?? null,
          ambito?.compagniaId ?? null,
        ],
      );
      if (typeof m.attivo === 'boolean' && m.attivo !== esistente.attivo) {
        await registraStorico(
          client,
          richiesta.identita,
          m.attivo ? 'attivazione' : 'disattivazione',
          'documento-riferimento',
          `${m.attivo ? 'Attivato' : 'Sospeso'} «${esistente.titolo}»`,
        );
      } else {
        await registraStorico(
          client,
          richiesta.identita,
          'modifica',
          'documento-riferimento',
          `Modificato «${esistente.titolo}»`,
        );
      }
      return (await riferimentoPerId(client, richiesta.identita.tenantId, esistente.id))!;
    });
  });

  /**
   * Toglie il ruolo. Un promosso resta nell'Archivio Privato, intatto; un
   * caricato qui sparisce con il ruolo — riga, PDF e Markdown (RNF-03).
   */
  app.delete<{ Params: { id: string } }>('/api/istruzioni/riferimenti/:id', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await riferimentoPerId(client, richiesta.identita.tenantId, richiesta.params.id);
      if (!esistente) throw ErroreApi.nonTrovato('Documento di riferimento inesistente.');

      await client.query(`delete from velia.riferimenti where id = $1 and tenant_id = $2`, [
        esistente.id,
        richiesta.identita.tenantId,
      ]);
      if (esistente.documentoPrivatoId) {
        await client.query(
          `update velia.documenti set documento_di_riferimento = false where id = $1 and tenant_id = $2`,
          [esistente.documentoPrivatoId, richiesta.identita.tenantId],
        );
      } else {
        const r = await client.query<{ path_pdf: string | null; path_md: string | null }>(
          `delete from velia.documenti where id = $1 and tenant_id = $2
           returning path_pdf, path_md`,
          [esistente.documentoId, richiesta.identita.tenantId],
        );
        const riga = r.rows[0];
        if (riga) {
          await archivio().elimina([riga.path_pdf, riga.path_md].filter((p): p is string => Boolean(p)));
        }
      }
      await registraStorico(
        client,
        richiesta.identita,
        'eliminazione',
        'documento-riferimento',
        esistente.documentoPrivatoId
          ? `Tolto il ruolo di riferimento a «${esistente.titolo}» (resta nell’Archivio Privato)`
          : `Eliminato «${esistente.titolo}»`,
      );
    });
    return risposta.code(204).send();
  });

  // --- Storico unico (RF-D-07) ---------------------------------------------

  app.get<{ Querystring: { oggetti?: string } }>('/api/impostazioni/storico', async (richiesta) => {
    const oggetti = (richiesta.query.oggetti ?? '').split(',').filter(Boolean);
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<{
        id: string;
        istante: Date;
        utente_id: string | null;
        utente_nome: string | null;
        azione: VoceStoricoImpostazioni['azione'];
        oggetto: VoceStoricoImpostazioni['oggetto'];
        descrizione: string;
      }>(
        `select s.id, s.istante, s.utente_id,
                trim(coalesce(u.nome, '') || ' ' || coalesce(u.cognome, '')) as utente_nome,
                s.azione, s.oggetto, s.descrizione
         from velia.impostazioni_storico s
         left join velia.utenti u on u.id = s.utente_id
         where s.tenant_id = $1 and ($2::text[] = '{}' or s.oggetto = any($2))
         order by s.istante desc, s.id
         limit 50`,
        [richiesta.identita.tenantId, oggetti],
      );
      return righe.rows.map(
        (v): VoceStoricoImpostazioni => ({
          id: v.id,
          istante: v.istante.toISOString(),
          utenteId: v.utente_id ?? '',
          utenteNome: v.utente_nome || '-',
          azione: v.azione,
          oggetto: v.oggetto,
          descrizione: v.descrizione,
        }),
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Letture e forme
// ---------------------------------------------------------------------------

function versoRegola(r: RigaRegola): RegolaIstruzione {
  return {
    id: r.id,
    titolo: r.titolo,
    testo: r.testo,
    ambito: versoAmbito(r),
    attiva: r.attiva,
    creataDa: r.creata_da ?? '',
    aggiornataIl: r.updated_at.toISOString(),
  };
}

async function regolaPerId(client: pg.ClientBase, tenantId: string, id: string): Promise<RigaRegola> {
  const nonTrovata = new ErroreApi(404, 'NON_TROVATA', 'Regola inesistente.');
  if (!E_UUID.test(id)) throw nonTrovata;
  const r = await client.query<RigaRegola>(
    `select id, titolo, testo, ambito_tipo, ambito_ramo_id, ambito_compagnia_id,
            attiva, creata_da, updated_at
     from velia.istruzioni where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
  if (!r.rows[0]) throw nonTrovata;
  return r.rows[0];
}

const SQL_RIFERIMENTO = `
  select r.id, r.documento_id, r.origine, r.ambito_tipo, r.ambito_ramo_id,
         r.ambito_compagnia_id, r.attivo, r.caricato_da, r.updated_at,
         d.titolo, d.numero_pagine, d.dimensione_md_byte, d.dimensione_byte,
         d.path_pdf, d.path_md
  from velia.riferimenti r
  join velia.documenti d on d.id = r.documento_id`;

function versoRiferimento(r: RigaRiferimento): DocumentoRiferimento & { documentoId: string } {
  return {
    id: r.id,
    documentoId: r.documento_id,
    titolo: r.titolo,
    ...(r.origine === 'promosso' && { documentoPrivatoId: r.documento_id }),
    ambito: versoAmbito(r),
    attivo: r.attivo,
    ...(r.numero_pagine !== null && { numeroPagine: r.numero_pagine }),
    /* RF-D-16: il peso è il Markdown che entra nel contesto; finché la
       conversione non l'ha misurato, il PDF è la stima migliore. */
    dimensioneByte: Number(r.dimensione_md_byte ?? r.dimensione_byte ?? 0),
    caricatoDa: r.caricato_da ?? '',
    aggiornatoIl: r.updated_at.toISOString(),
  };
}

async function riferimentoPerId(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<(DocumentoRiferimento & { documentoId: string }) | undefined> {
  if (!E_UUID.test(id)) return undefined;
  const r = await client.query<RigaRiferimento>(`${SQL_RIFERIMENTO} where r.id = $1 and r.tenant_id = $2`, [
    id,
    tenantId,
  ]);
  return r.rows[0] ? versoRiferimento(r.rows[0]) : undefined;
}

async function verificaAmbito(client: pg.ClientBase, ambito: AmbitoIstruzione): Promise<void> {
  if (ambito.tipo === 'ramo') {
    const r = await client.query(`select 1 from velia.rami where id = $1`, [ambito.ramoId]);
    if (!r.rowCount) throw ErroreApi.datiNonValidi('Ramo inesistente.');
  }
  if (ambito.tipo === 'compagnia') {
    const r = await client.query(`select 1 from velia.compagnie where id = $1`, [ambito.compagniaId]);
    if (!r.rowCount) throw ErroreApi.datiNonValidi('Compagnia inesistente.');
  }
}
