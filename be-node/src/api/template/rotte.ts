import { randomBytes } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { PDFDocument } from 'pdf-lib';
import type pg from 'pg';

import type { Citazione } from '../../contratto/conversazioni.js';

import { ErroreApi } from '../../contratto/errori.js';
import {
  schemaEsportaRisposta,
  schemaIdentitaVisiva,
  schemaPatchTemplate,
  type FormatoGenerazione,
  type IdentitaVisiva,
  type TemplateOutput,
} from '../../contratto/template.js';
import {
  elencoTemplate,
  fontiDaCitazioni,
  identitaDelTenant,
  identitaPerGenerazione,
  risolviTemplate,
  templatePerId,
  type RigaIdentita,
} from '../../generazione/catalogo.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { analizzaMarkdown } from '../../generazione/blocchi.js';
import { segnapostoDocx } from '../../generazione/docx.js';
import { testoSemplice } from '../../generazione/email.js';
import { generaDocumento } from '../../generazione/generatore.js';
import { componiPdf } from '../../generazione/pdf.js';
import { segnapostoXlsx } from '../../generazione/xlsx.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * La generazione documenti su template (Fase 4, rivista il 25/08/2026): la
 * libreria dei template dell'agenzia che chat, tabelle e agenti condividono,
 * l'identità visiva (RF-D-12) e l'esportazione della chat (RF-C-10).
 *
 * Un template è sempre un file caricato dal tenant (`tenant/<tid>/template/`),
 * quanti ne vuole, anche più d'uno per formato, ognuno col nome con cui lo
 * si richiama. Per formato c'è al più un predefinito (sulla riga). Il layout
 * di piattaforma non è in catalogo: è ciò che si usa quando per il formato
 * chiesto non c'è un template — vedi `risolviTemplate`.
 *
 * Le scritture sono dell'amministratore (`template.gestisci`): il 403 parte
 * da qui, l'isolamento fra tenant resta della RLS.
 */

export {
  NOME_LAYOUT_PIATTAFORMA,
  elencoTemplate,
  fontiDaCitazioni,
  identitaDelTenant,
  risolviTemplate,
  templatePerId,
  versoIdentitaGenerazione,
  versoRisolto,
  type RigaIdentita,
  type RigaTemplate,
  type TemplateRisolto,
} from '../../generazione/catalogo.js';

const DESCRIZIONE_TEMPLATE = 'Template dell’agenzia: il documento generato ne conserva l’impaginazione.';

const nuovoId = (): string => `tpl-${randomBytes(6).toString('hex')}`;

export const percorsoTemplate = (tenantId: string, id: string, formato: string): string =>
  `tenant/${tenantId}/template/${id}.${formato}`;

const percorsoLogo = (tenantId: string): string => `tenant/${tenantId}/identita/logo`;

const FIRMA_PDF = Buffer.from('%PDF-');
const FIRMA_ZIP = Buffer.from('PK');

/** Id di conversazioni e messaggi: uuid. Un id malformato è un 404, non un errore SQL. */
const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OpzioniTemplate {
  /** Nei test: un archivio finto al posto dello Storage. */
  archivio?: ArchivioFile;
}

export function registraRotteTemplate(app: FastifyInstance, opzioni: OpzioniTemplate = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());

  /* Il logo arriva come corpo binario col suo content-type (PUT del FE):
     Fastify non ha un parser per image/*, glielo diamo qui. */
  app.addContentTypeParser(
    /^image\//,
    { parseAs: 'buffer', bodyLimit: 2 * 1024 * 1024 },
    (_richiesta, corpo, fine) => fine(null, corpo),
  );

  // --- Libreria dei template (RF-D-10…D-13) --------------------------------

  /** L'elenco che chat, tabelle e agenti usano e Impostazioni governa. */
  app.get('/api/template', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, (client) =>
      elencoTemplate(client, richiesta.identita.tenantId),
    );
  });

  /**
   * RF-D-12: template dell'agenzia, anche una semplice carta intestata. Il
   * nome è quello del file, senza estensione: si cambia col PATCH. Il lotto
   * è atomico: si valida tutto, poi si crea tutto — un file rifiutato non
   * lascia fratelli a metà. Il primo template di un formato ne diventa il
   * predefinito. PPTX si rifiuta con un motivo leggibile (§6.11).
   */
  app.post('/api/template', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    if (!richiesta.isMultipart()) {
      throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    }

    const ricevuti: Array<{ nome: string; formato: FormatoGenerazione; contenuto: Buffer }> = [];
    for await (const parte of richiesta.parts()) {
      if (parte.type !== 'file' || !parte.filename) continue;
      const contenuto = await parte.toBuffer();
      const formato = await verificaTemplate(parte.filename, contenuto, parte.file.truncated);
      ricevuti.push({ nome: parte.filename, formato, contenuto });
    }
    if (!ricevuti.length) {
      throw new ErroreApi(400, 'NESSUN_FILE', 'La richiesta non contiene file.');
    }

    const { tenantId, utenteId } = richiesta.identita;
    const daCreare = ricevuti.map((f) => ({ ...f, id: nuovoId() }));
    const caricati: string[] = [];
    try {
      for (const f of daCreare) {
        const percorso = percorsoTemplate(tenantId, f.id, f.formato);
        await archivio().carica(percorso, f.contenuto, tipoMime(f.formato));
        caricati.push(percorso);
      }
      const creati = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const esiti: TemplateOutput[] = [];
        for (const f of daCreare) {
          const nome = f.nome.replace(/\.[^.]+$/, '') || f.nome;
          const senzaPredefinito = await client.query(
            `select 1 from velia.template where tenant_id = $1 and formato = $2 and predefinito`,
            [tenantId, f.formato],
          );
          const predefinito = senzaPredefinito.rowCount === 0;
          await client.query(
            `insert into velia.template (id, tenant_id, nome, formato, descrizione, path_file, predefinito, creato_da)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              f.id,
              tenantId,
              nome,
              f.formato,
              DESCRIZIONE_TEMPLATE,
              percorsoTemplate(tenantId, f.id, f.formato),
              predefinito,
              utenteId,
            ],
          );
          await registraStorico(client, richiesta.identita, 'creazione', 'template', `Caricato il template «${nome}»`);
          esiti.push({ id: f.id, nome, formato: f.formato, descrizione: DESCRIZIONE_TEMPLATE, predefinito });
        }
        return esiti;
      });
      void risposta.code(201);
      return { creati };
    } catch (errore) {
      await archivio()
        .elimina(caricati)
        .catch((e: unknown) => richiesta.log.warn({ err: e, caricati }, 'pulizia storage fallita'));
      throw errore;
    }
  });

  /**
   * Il nome con cui si richiama e/o il predefinito del suo formato (RF-D-13):
   * assegnarlo lo toglie a chi lo portava. Risponde con l'elenco intero,
   * com'è nel contratto: il FE ridipinge tutto da qui.
   */
  app.patch<{ Params: { id: string } }>('/api/template/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaPatchTemplate.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al template non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const template = await templatePerId(client, richiesta.params.id);
      if (!template) throw ErroreApi.nonTrovato('Template inesistente.');

      if (m.nome !== undefined && m.nome !== template.nome) {
        await client.query(`update velia.template set nome = $3 where id = $1 and tenant_id = $2`, [
          template.id,
          tenantId,
          m.nome,
        ]);
        await registraStorico(
          client,
          richiesta.identita,
          'modifica',
          'template',
          `Il template «${template.nome}» si chiama ora «${m.nome}»`,
        );
      }
      const nome = m.nome ?? template.nome;

      if (m.predefinito !== undefined && m.predefinito !== template.predefinito) {
        if (m.predefinito) {
          await client.query(
            `update velia.template set predefinito = false
             where tenant_id = $1 and formato = $2 and predefinito`,
            [tenantId, template.formato],
          );
        }
        await client.query(`update velia.template set predefinito = $3 where id = $1 and tenant_id = $2`, [
          template.id,
          tenantId,
          m.predefinito,
        ]);
        await registraStorico(
          client,
          richiesta.identita,
          'modifica',
          'template',
          m.predefinito
            ? `«${nome}» è il template predefinito per ${template.formato.toUpperCase()}`
            : `«${nome}» non è più il predefinito per ${template.formato.toUpperCase()}`,
        );
      }
      return elencoTemplate(client, tenantId);
    });
  });

  /** Riga e file insieme. Gli agenti che lo usavano restano senza template (FK `set null`). */
  app.delete<{ Params: { id: string } }>('/api/template/:id', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const template = await templatePerId(client, richiesta.params.id);
      if (!template) throw ErroreApi.nonTrovato('Template inesistente.');
      await client.query(`delete from velia.template where id = $1 and tenant_id = $2`, [
        template.id,
        richiesta.identita.tenantId,
      ]);
      await archivio().elimina([template.path_file]);
      await registraStorico(
        client,
        richiesta.identita,
        'eliminazione',
        'template',
        `Eliminato il template «${template.nome}»`,
      );
    });
    return risposta.code(204).send();
  });

  /**
   * RF-D-11: l'anteprima mostra l'impaginazione — sempre PDF, qualunque sia
   * il formato di generazione. Un template PDF si mostra com'è; per DOCX e
   * XLSX si impagina la scheda della struttura con l'identità visiva
   * applicata, coi segnaposto davvero trovati nel file.
   */
  app.get<{ Params: { id: string } }>('/api/template/:id/anteprima', async (richiesta, risposta) => {
    const { template, identita } = await conIdentita(poolDb(), richiesta.identita, async (client) => ({
      template: await templatePerId(client, richiesta.params.id),
      identita: await identitaDelTenant(client, richiesta.identita.tenantId),
    }));
    if (!template) throw ErroreApi.nonTrovato('Template inesistente.');

    const byte = await archivio().scarica(template.path_file);
    if (template.formato === 'pdf') {
      return inviaFile(risposta, byte, 'application/pdf', 'inline');
    }

    const segnaposto = template.formato === 'docx' ? segnapostoDocx(byte) : await segnapostoXlsx(byte);
    const testo = [
      template.descrizione,
      '',
      'Struttura del template:',
      '',
      '- `{{titolo}}` titolo del documento',
      '- `{{destinatario}}` cliente o pratica',
      '- `{{data}}` data di generazione',
      '- `{{contenuto}}` il testo generato da VELIA',
      '- `{{fonti}}` le citazioni, in coda',
      '',
      `Segnaposto presenti nel file: ${segnaposto.map((s) => `{{${s}}}`).join(', ')}`,
      '',
      "Intestazione e piè di pagina applicano l'identità visiva dell'agenzia:",
      `colore ${identita.colore_primario}, recapiti e firma configurati nelle Impostazioni.`,
    ].join('\n');

    const pdf = await componiPdf({
      titolo: `Anteprima - ${template.nome}`,
      blocchi: analizzaMarkdown(testo),
      fonti: [],
      identita: await identitaPerGenerazione(archivio(), identita),
    });
    return inviaFile(risposta, pdf, 'application/pdf', 'inline');
  });

  // --- Identità visiva (RF-D-12) ------------------------------------------

  app.get('/api/identita-visiva', async (richiesta) => {
    const riga = await conIdentita(poolDb(), richiesta.identita, (client) =>
      identitaDelTenant(client, richiesta.identita.tenantId),
    );
    return versoIdentita(riga);
  });

  app.put('/api/identita-visiva', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaIdentitaVisiva.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw ErroreApi.datiNonValidi(esito.error.issues[0]?.message ?? 'Identità visiva non valida.');
    }
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const attuale = await identitaDelTenant(client, richiesta.identita.tenantId);
      const nuova: RigaIdentita = {
        ...attuale,
        ...(m.colorePrimario !== undefined && { colore_primario: m.colorePrimario }),
        ...(m.recapiti !== undefined && { recapiti: m.recapiti }),
        ...(m.firma !== undefined && { firma: m.firma }),
      };
      await client.query(
        `insert into velia.identita_visiva (tenant_id, colore_primario, recapiti, firma)
         values ($1, $2, $3, $4)
         on conflict (tenant_id) do update
           set colore_primario = excluded.colore_primario,
               recapiti = excluded.recapiti,
               firma = excluded.firma`,
        [richiesta.identita.tenantId, nuova.colore_primario, nuova.recapiti, nuova.firma],
      );
      await registraStorico(
        client,
        richiesta.identita,
        'modifica',
        'template',
        'Aggiornata l’identità visiva dell’agenzia',
      );
      return versoIdentita(nuova);
    });
  });

  app.get('/api/identita-visiva/logo', async (richiesta, risposta) => {
    const riga = await conIdentita(poolDb(), richiesta.identita, (client) =>
      identitaDelTenant(client, richiesta.identita.tenantId),
    );
    if (!riga.logo_path) throw ErroreApi.nonTrovato('Nessun logo caricato.');
    const byte = await archivio().scarica(riga.logo_path);
    return inviaFile(risposta, byte, riga.logo_tipo ?? 'image/png', 'inline');
  });

  /** Il logo in testa ai documenti generati: PNG o JPEG, che il PDF sa incorporare. */
  app.put('/api/identita-visiva/logo', async (richiesta) => {
    richiediAmministratore(richiesta);
    const tipo = (richiesta.headers['content-type'] ?? '').split(';')[0]!.trim();
    const corpo = richiesta.body;
    if (!Buffer.isBuffer(corpo) || (tipo !== 'image/png' && tipo !== 'image/jpeg')) {
      throw new ErroreApi(
        415,
        'FORMATO_NON_SUPPORTATO',
        'Il logo dev’essere un PNG o un JPEG: sono i formati che i documenti generati incorporano.',
      );
    }

    const percorso = percorsoLogo(richiesta.identita.tenantId);
    await archivio().carica(percorso, corpo, tipo);
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      await client.query(
        `insert into velia.identita_visiva (tenant_id, logo_path, logo_tipo)
         values ($1, $2, $3)
         on conflict (tenant_id) do update set logo_path = excluded.logo_path, logo_tipo = excluded.logo_tipo`,
        [richiesta.identita.tenantId, percorso, tipo],
      );
      await registraStorico(client, richiesta.identita, 'modifica', 'template', 'Caricato il logo dell’agenzia');
    });
    return { logoUrl: '/api/identita-visiva/logo' };
  });

  // --- Esportazione della chat (RF-C-10) -----------------------------------

  /**
   * Il testo del messaggio e le sue fonti, impaginati sul template scelto (o
   * sul predefinito del formato, o sul layout di piattaforma). Sincrona: un
   * documento sta sotto qualche secondo. Il formato `txt` («Esporta come»,
   * 29/08/2026) non passa da nessun template: è il testo piatto con le fonti.
   */
  app.post<{ Params: { id: string; mid: string } }>(
    '/api/conversazioni/:id/messaggi/:mid/esporta',
    async (richiesta, risposta) => {
      const esito = schemaEsportaRisposta.safeParse(richiesta.body ?? {});
      if (!esito.success) throw ErroreApi.datiNonValidi('Indica il template o il formato su cui esportare.');
      if (!E_UUID.test(richiesta.params.id) || !E_UUID.test(richiesta.params.mid)) {
        throw ErroreApi.nonTrovato('Messaggio inesistente.');
      }
      const scelta = esito.data;
      const testoSolo = scelta.formato === 'txt' && !scelta.templateId;

      const { messaggio, template, identita } = await conIdentita(
        poolDb(),
        richiesta.identita,
        async (client) => {
          const m = await client.query<{ testo: string; citazioni: Citazione[] }>(
            `select m.testo, m.citazioni
             from velia.messaggi m
             where m.conversazione_id = $1 and m.id = $2 and m.tenant_id = $3`,
            [richiesta.params.id, richiesta.params.mid, richiesta.identita.tenantId],
          );
          if (testoSolo) return { messaggio: m.rows[0] };
          return {
            messaggio: m.rows[0],
            template: await risolviTemplate(client, richiesta.identita.tenantId, {
              ...(scelta.templateId && { templateId: scelta.templateId }),
              ...(scelta.formato && scelta.formato !== 'txt' && { formato: scelta.formato }),
            }),
            identita: await identitaDelTenant(client, richiesta.identita.tenantId),
          };
        },
      );
      if (!messaggio) throw ErroreApi.nonTrovato('Messaggio inesistente.');

      if (!template || !identita) {
        const testo = testoSemplice(messaggio.testo, fontiDaCitazioni(messaggio.citazioni));
        return inviaFile(risposta, Buffer.from(testo, 'utf8'), 'text/plain; charset=utf-8', 'attachment; filename="risposta.txt"');
      }

      const file = await generaDocumento({
        template,
        ...(template.path_file && { fileTemplate: await archivio().scarica(template.path_file) }),
        titolo: template.nome,
        testo: messaggio.testo,
        fonti: fontiDaCitazioni(messaggio.citazioni),
        identita: await identitaPerGenerazione(archivio(), identita),
      });

      return inviaFile(risposta, file.byte, file.contentType, `attachment; filename="${file.nomeFile}"`);
    },
  );
}

// ---------------------------------------------------------------------------
// Condivise
// ---------------------------------------------------------------------------

function versoIdentita(riga: RigaIdentita): IdentitaVisiva {
  return {
    colorePrimario: riga.colore_primario,
    recapiti: riga.recapiti,
    firma: riga.firma,
    ...(riga.logo_path && { logoUrl: '/api/identita-visiva/logo' }),
  };
}

/** La voce «chi, cosa, quando» di RF-D-07: ogni mutazione delle impostazioni la scrive. */
export async function registraStorico(
  client: pg.ClientBase,
  identita: Identita,
  azione: 'creazione' | 'modifica' | 'attivazione' | 'disattivazione' | 'eliminazione',
  oggetto: 'regola' | 'documento-riferimento' | 'modello' | 'template',
  descrizione: string,
): Promise<void> {
  await client.query(
    `insert into velia.impostazioni_storico (tenant_id, utente_id, azione, oggetto, descrizione)
     values ($1, $2, $3, $4, $5)`,
    [identita.tenantId, identita.utenteId, azione, oggetto, descrizione],
  );
}

function tipoMime(formato: FormatoGenerazione): string {
  return {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[formato];
}

/**
 * Il controllo all'ingresso (RF-D-12): formato dall'estensione, firma dei
 * byte, e per DOCX/XLSX che il file si apra. I segnaposto sono facoltativi:
 * senza, il file è una carta intestata e il testo generato va in coda.
 */
async function verificaTemplate(nome: string, contenuto: Buffer, troncato: boolean): Promise<FormatoGenerazione> {
  if (troncato) {
    throw new ErroreApi(413, 'FILE_TROPPO_GRANDE', `«${nome}» supera il limite per i template.`);
  }
  const estensione = /\.(pdf|docx|xlsx|pptx)$/i.exec(nome)?.[1]?.toLowerCase();
  if (!estensione) {
    throw new ErroreApi(
      400,
      'FORMATO_NON_AMMESSO',
      `«${nome}»: i template accettano PDF, DOCX o XLSX.`,
    );
  }
  if (estensione === 'pptx') {
    throw new ErroreApi(
      415,
      'FORMATO_NON_SUPPORTATO',
      `«${nome}»: la generazione PPTX non è ancora disponibile - carica un template PDF, DOCX o XLSX.`,
    );
  }

  if (estensione === 'pdf') {
    if (!contenuto.subarray(0, 1024).includes(FIRMA_PDF)) {
      throw new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» non è un PDF leggibile.`);
    }
    try {
      await PDFDocument.load(contenuto);
    } catch {
      throw new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» non è un PDF leggibile.`);
    }
    return 'pdf';
  }

  if (!contenuto.subarray(0, 4).includes(FIRMA_ZIP)) {
    throw new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» non è un file ${estensione.toUpperCase()} leggibile.`);
  }
  /* I segnaposto sono facoltativi: senza `{{contenuto}}` il file è una carta
     intestata e il testo va in coda. Qui conta solo che il file si apra. */
  try {
    if (estensione === 'docx') segnapostoDocx(contenuto);
    else await segnapostoXlsx(contenuto);
  } catch {
    throw new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» non è un file ${estensione.toUpperCase()} leggibile.`);
  }
  return estensione as 'docx' | 'xlsx';
}

function inviaFile(
  risposta: FastifyReply,
  byte: Buffer,
  contentType: string,
  disposition: string,
): FastifyReply {
  return risposta
    .header('Content-Type', contentType)
    .header('Content-Length', byte.length)
    .header('Content-Disposition', disposition)
    .send(byte);
}
