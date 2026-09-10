import { randomBytes } from 'node:crypto';

import ExcelJS from 'exceljs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { PDFDocument } from 'pdf-lib';
import type pg from 'pg';
import PizZip from 'pizzip';

import type { Citazione } from '../../contratto/conversazioni.js';

import { ErroreApi } from '../../contratto/errori.js';
import {
  schemaEsportaRisposta,
  schemaPatchTemplate,
  type FormatoGenerazione,
  type TemplateOutput,
} from '../../contratto/template.js';
import {
  elencoTemplate,
  fasceDelTenant,
  fontiDaCitazioni,
  formatoDaScelta,
  templatePerId,
} from '../../generazione/catalogo.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { analizzaMarkdown } from '../../generazione/blocchi.js';
import { testoSemplice } from '../../generazione/email.js';
import { generaDocumento, NOME_DOCUMENTO } from '../../generazione/generatore.js';
import { componiPdf } from '../../generazione/pdf.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * La libreria dei template dell'agenzia e l'esportazione della chat
 * (RF-C-10).
 *
 * Un template è sempre un file caricato dal tenant (`tenant/<tid>/template/`),
 * quanti ne vuole, anche più d'uno per formato, ognuno col nome con cui lo
 * si richiama. Dall'11/09/2026 lo usa solo la sandbox («Genera documento da
 * template»): «Esporta come» esce col layout di VELIA e l'intestazione
 * dell'agenzia (`api/intestazione`), e l'identità visiva non c'è più. Nella
 * fase 3 di `PIANO-INTESTAZIONE-MODELLI.md` i template diventano i modelli
 * di riferimento.
 *
 * Le scritture sono dell'amministratore (`template.gestisci`): il 403 parte
 * da qui, l'isolamento fra tenant resta della RLS.
 */

export {
  NOME_LAYOUT_PIATTAFORMA,
  elencoTemplate,
  fontiDaCitazioni,
  risolviTemplate,
  templatePerId,
  versoRisolto,
  type RigaTemplate,
  type TemplateRisolto,
} from '../../generazione/catalogo.js';

const DESCRIZIONE_TEMPLATE = 'Template dell’agenzia: il documento generato ne conserva l’impaginazione.';

const nuovoId = (): string => `tpl-${randomBytes(6).toString('hex')}`;

export const percorsoTemplate = (tenantId: string, id: string, formato: string): string =>
  `tenant/${tenantId}/template/${id}.${formato}`;

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
   * RF-D-11: l'anteprima, sempre PDF. Un template PDF si mostra com'è. Word
   * ed Excel li legge solo la sandbox, che ne copia l'impaginazione: finché
   * non arrivano i modelli di riferimento con l'anteprima convertita (fase 3
   * del piano) qui c'è una scheda che lo dice, sulla carta dell'agenzia.
   */
  app.get<{ Params: { id: string } }>('/api/template/:id/anteprima', async (richiesta, risposta) => {
    const { template, fasce } = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const template = await templatePerId(client, richiesta.params.id);
      return {
        template,
        fasce: template
          ? await fasceDelTenant(client, archivio(), richiesta.identita.tenantId, template.nome)
          : undefined,
      };
    });
    if (!template || !fasce) throw ErroreApi.nonTrovato('Template inesistente.');

    if (template.formato === 'pdf') {
      return inviaFile(risposta, await archivio().scarica(template.path_file), 'application/pdf', 'inline');
    }
    const testo = [
      `«${template.nome}» è un file ${template.formato.toUpperCase()}.`,
      '',
      'Si usa con «Genera documento da template»: la sandbox lo apre, ne copia impaginazione, stili e tabelle e ci mette il contenuto nuovo.',
    ].join('\n');
    const pdf = await componiPdf({ titolo: template.nome, blocchi: analizzaMarkdown(testo), fonti: [], fasce });
    return inviaFile(risposta, pdf, 'application/pdf', 'inline');
  });

  // --- Esportazione della chat (RF-C-10) -----------------------------------

  /**
   * «Esporta come» (29/08/2026): il testo del messaggio e le sue fonti, col
   * layout di VELIA e l'intestazione dell'agenzia, titolati come la
   * conversazione. Sincrona: un documento sta sotto qualche secondo. Il
   * formato `txt` è il testo piatto con le fonti, senza fasce.
   */
  app.post<{ Params: { id: string; mid: string } }>(
    '/api/conversazioni/:id/messaggi/:mid/esporta',
    async (richiesta, risposta) => {
      const esito = schemaEsportaRisposta.safeParse(richiesta.body ?? {});
      if (!esito.success) throw ErroreApi.datiNonValidi('Indica il formato su cui esportare.');
      if (!E_UUID.test(richiesta.params.id) || !E_UUID.test(richiesta.params.mid)) {
        throw ErroreApi.nonTrovato('Messaggio inesistente.');
      }
      const scelta = esito.data;
      const testoSolo = scelta.formato === 'txt' && !scelta.templateId;

      const letto = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const m = await client.query<{ testo: string; citazioni: Citazione[]; titolo: string }>(
          `select m.testo, m.citazioni, c.titolo
           from velia.messaggi m join velia.conversazioni c on c.id = m.conversazione_id
           where m.conversazione_id = $1 and m.id = $2 and m.tenant_id = $3`,
          [richiesta.params.id, richiesta.params.mid, richiesta.identita.tenantId],
        );
        const messaggio = m.rows[0];
        if (!messaggio || testoSolo) return { messaggio };
        const titolo = messaggio.titolo.trim() || NOME_DOCUMENTO;
        return {
          messaggio,
          formato: await formatoDaScelta(client, {
            ...(scelta.templateId && { templateId: scelta.templateId }),
            ...(scelta.formato && scelta.formato !== 'txt' && { formato: scelta.formato }),
          }),
          fasce: await fasceDelTenant(client, archivio(), richiesta.identita.tenantId, titolo),
        };
      });
      const { messaggio } = letto;
      if (!messaggio) throw ErroreApi.nonTrovato('Messaggio inesistente.');

      if (!letto.formato || !letto.fasce) {
        const testo = testoSemplice(messaggio.testo, fontiDaCitazioni(messaggio.citazioni));
        return inviaFile(risposta, Buffer.from(testo, 'utf8'), 'text/plain; charset=utf-8', 'attachment; filename="risposta.txt"');
      }

      const titolo = messaggio.titolo.trim() || NOME_DOCUMENTO;
      const file = await generaDocumento({
        formato: letto.formato,
        nome: titolo,
        titolo,
        testo: messaggio.testo,
        fonti: fontiDaCitazioni(messaggio.citazioni),
        fasce: letto.fasce,
      });

      return inviaFile(risposta, file.byte, file.contentType, `attachment; filename="${file.nomeFile}"`);
    },
  );
}

// ---------------------------------------------------------------------------
// Condivise
// ---------------------------------------------------------------------------

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
 * byte, e che il file si apra davvero.
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
  try {
    if (estensione === 'docx') {
      if (!new PizZip(contenuto).file('word/document.xml')) throw new Error('senza word/document.xml');
    } else {
      await new ExcelJS.Workbook().xlsx.load(contenuto as unknown as ExcelJS.Buffer);
    }
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
