import { randomBytes } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { PDFDocument } from 'pdf-lib';
import type pg from 'pg';

import type { Citazione } from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import {
  schemaEsporta,
  schemaIdentitaVisiva,
  schemaPatchTemplate,
  type IdentitaVisiva,
  type TemplateOutput,
  type TipologiaOutput,
} from '../../contratto/template.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { analizzaMarkdown } from '../../generazione/blocchi.js';
import { segnapostoDocx } from '../../generazione/docx.js';
import { generaDocumento, type IdentitaGenerazione } from '../../generazione/generatore.js';
import { componiPdf } from '../../generazione/pdf.js';
import { segnapostoXlsx } from '../../generazione/xlsx.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * La generazione documenti su template (Fase 4): la libreria dei template
 * (RF-D-10…D-13) che chat, tabelle e agenti condividono, l'identità visiva
 * (RF-D-12) e l'esportazione della chat (RF-C-10) — l'ultima rotta delle
 * conversazioni che stava al mock.
 *
 * Le scritture sono dell'amministratore (`template.gestisci`): il 403 parte
 * da qui, l'isolamento fra tenant resta della RLS. Il predefinito per
 * tipologia è stato del tenant anche sui template di piattaforma: vive in
 * `template_predefiniti`, mai sulle righe condivise della libreria.
 */

export interface RigaTemplate {
  id: string;
  tenant_id: string | null;
  nome: string;
  formato: 'pdf' | 'docx' | 'xlsx' | 'pptx';
  descrizione: string;
  tipologia_libreria: TipologiaOutput | null;
  path_file: string | null;
}

export interface RigaIdentita {
  colore_primario: string;
  recapiti: string;
  firma: string;
  logo_path: string | null;
  logo_tipo: string | null;
}

const IDENTITA_PREDEFINITA: RigaIdentita = {
  colore_primario: '#2f4b7c',
  recapiti: '',
  firma: '',
  logo_path: null,
  logo_tipo: null,
};

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

  /** L'elenco che chat e tabelle usano per esportare e Impostazioni governa. */
  app.get('/api/template', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, (client) =>
      elencoTemplate(client, richiesta.identita.tenantId),
    );
  });

  /**
   * RF-D-12: template propri del tenant, conformi allo schema dei segnaposto.
   * Il lotto è atomico: si valida tutto, poi si crea tutto — un file rifiutato
   * non lascia fratelli a metà. PPTX si rifiuta con un motivo leggibile: la
   * generazione fedele lì è rimandata (punto aperto §6.11, deciso in Fase 5 FE).
   */
  app.post('/api/template', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    if (!richiesta.isMultipart()) {
      throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    }

    const ricevuti: Array<{ nome: string; formato: 'pdf' | 'docx' | 'xlsx'; contenuto: Buffer }> = [];
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
          await client.query(
            `insert into velia.template (id, tenant_id, nome, formato, descrizione, path_file, creato_da)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              f.id,
              tenantId,
              nome,
              f.formato,
              'Template caricato dall’agenzia, conforme allo schema dei segnaposto.',
              percorsoTemplate(tenantId, f.id, f.formato),
              utenteId,
            ],
          );
          await registraStorico(client, richiesta.identita, 'creazione', `Caricato il template «${nome}»`);
          esiti.push({
            id: f.id,
            nome,
            formato: f.formato,
            descrizione: 'Template caricato dall’agenzia, conforme allo schema dei segnaposto.',
            personalizzato: true,
          });
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
   * RF-D-13: il predefinito per tipologia, unico per tipologia. Risponde con
   * l'elenco intero, com'è nel contratto: assegnare una tipologia la toglie
   * a chi la portava prima e il FE ridipinge tutto da qui.
   */
  app.patch<{ Params: { id: string } }>('/api/template/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaPatchTemplate.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al template non valide.');
    const tipologia = esito.data.tipologiaPredefinita;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const template = await templatePerId(client, richiesta.params.id);
      if (!template) throw ErroreApi.nonTrovato('Template inesistente.');

      /* Il template smette di portare qualunque tipologia; se è di libreria,
         il suo default si sopprime con una riga esplicita a `null` (senza
         riga tornerebbe a valere). Poi, se richiesto, la nuova assegnazione
         — l'upsert sulla chiave (tenant, tipologia) fa l'unicità. */
      await client.query(
        `delete from velia.template_predefiniti where tenant_id = $1 and template_id = $2`,
        [tenantId, template.id],
      );
      if (template.tipologia_libreria) {
        await client.query(
          `insert into velia.template_predefiniti (tenant_id, tipologia, template_id)
           values ($1, $2, null) on conflict (tenant_id, tipologia) do nothing`,
          [tenantId, template.tipologia_libreria],
        );
      }
      if (tipologia) {
        await client.query(
          `insert into velia.template_predefiniti (tenant_id, tipologia, template_id)
           values ($1, $2, $3)
           on conflict (tenant_id, tipologia) do update set template_id = excluded.template_id`,
          [tenantId, tipologia, template.id],
        );
      }
      await registraStorico(
        client,
        richiesta.identita,
        'modifica',
        tipologia
          ? `«${template.nome}» è il predefinito per ${tipologia}`
          : `«${template.nome}» non è più un predefinito`,
      );
      return elencoTemplate(client, tenantId);
    });
  });

  /** Solo i personalizzati: i precaricati sono della piattaforma. */
  app.delete<{ Params: { id: string } }>('/api/template/:id', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const template = await templatePerId(client, richiesta.params.id);
      if (!template) throw ErroreApi.nonTrovato('Template inesistente.');
      if (!template.tenant_id) {
        throw ErroreApi.conflitto(
          'PRECARICATO',
          'I template precaricati sono della piattaforma e non si eliminano.',
        );
      }
      await client.query(`delete from velia.template where id = $1 and tenant_id = $2`, [
        template.id,
        richiesta.identita.tenantId,
      ]);
      if (template.path_file) await archivio().elimina([template.path_file]);
      await registraStorico(
        client,
        richiesta.identita,
        'eliminazione',
        `Eliminato il template «${template.nome}»`,
      );
    });
    return risposta.code(204).send();
  });

  /**
   * RF-D-11: l'anteprima mostra l'impaginazione — sempre PDF, qualunque sia
   * il formato di generazione. Un template PDF del tenant si mostra com'è;
   * per gli altri si impagina la scheda della struttura con l'identità
   * visiva applicata, che È l'impaginazione della generazione.
   */
  app.get<{ Params: { id: string } }>('/api/template/:id/anteprima', async (richiesta, risposta) => {
    const { template, identita } = await conIdentita(poolDb(), richiesta.identita, async (client) => ({
      template: await templatePerId(client, richiesta.params.id),
      identita: await identitaDelTenant(client, richiesta.identita.tenantId),
    }));
    if (!template) throw ErroreApi.nonTrovato('Template inesistente.');

    if (template.tenant_id && template.formato === 'pdf' && template.path_file) {
      const pdf = await archivio().scarica(template.path_file);
      return inviaFile(risposta, pdf, 'application/pdf', 'inline');
    }

    const segnaposto = await (async () => {
      if (!template.tenant_id || !template.path_file) return undefined;
      const byte = await archivio().scarica(template.path_file);
      return template.formato === 'docx' ? segnapostoDocx(byte) : await segnapostoXlsx(byte);
    })();

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
      ...(segnaposto ? ['', `Segnaposto presenti nel file: ${segnaposto.map((s) => `{{${s}}}`).join(', ')}`] : []),
      '',
      "Intestazione e piè di pagina applicano l'identità visiva dell'agenzia:",
      `colore ${identita.colore_primario}, recapiti e firma configurati nelle Impostazioni.`,
    ].join('\n');

    const logo = await caricaLogo(identita);
    const pdf = await componiPdf({
      titolo: `Anteprima — ${template.nome}`,
      blocchi: analizzaMarkdown(testo),
      fonti: [],
      identita: versoIdentitaGenerazione(identita),
      ...(logo && { logo }),
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
      await registraStorico(client, richiesta.identita, 'modifica', 'Caricato il logo dell’agenzia');
    });
    return { logoUrl: '/api/identita-visiva/logo' };
  });

  // --- Esportazione della chat (RF-C-10) -----------------------------------

  /**
   * Il download vero che al mock restava: il testo del messaggio e le sue
   * fonti, impaginati sul template scelto. Sincrona: un documento sta sotto
   * qualche secondo.
   */
  app.post<{ Params: { id: string; mid: string } }>(
    '/api/conversazioni/:id/messaggi/:mid/esporta',
    async (richiesta, risposta) => {
      const esito = schemaEsporta.safeParse(richiesta.body ?? {});
      if (!esito.success) throw ErroreApi.datiNonValidi('Indica il template su cui esportare.');
      if (!E_UUID.test(richiesta.params.id) || !E_UUID.test(richiesta.params.mid)) {
        throw ErroreApi.nonTrovato('Messaggio inesistente.');
      }

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
          return {
            messaggio: m.rows[0],
            template: await templatePerId(client, esito.data.templateId),
            identita: await identitaDelTenant(client, richiesta.identita.tenantId),
          };
        },
      );
      if (!messaggio) throw ErroreApi.nonTrovato('Messaggio inesistente.');
      if (!template) throw ErroreApi.nonTrovato('Template inesistente.');
      if (template.formato === 'pptx') {
        throw new ErroreApi(
          415,
          'FORMATO_NON_SUPPORTATO',
          'La generazione PPTX non è ancora disponibile: scegli un template PDF, DOCX o XLSX.',
        );
      }

      /* Le fonti nella forma del mock: «Titolo — art. X, p. N». */
      const fonti = messaggio.citazioni.map((c) => {
        const posizione = [
          c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione,
          `p. ${c.posizione.pagina}`,
        ]
          .filter(Boolean)
          .join(', ');
        return `${c.documentoTitolo} — ${posizione}`;
      });

      const fileTemplate = template.path_file ? await archivio().scarica(template.path_file) : undefined;
      const logo = await caricaLogo(identita);
      const file = await generaDocumento({
        template: {
          nome: template.nome,
          formato: template.formato,
          personalizzato: Boolean(template.tenant_id),
        },
        ...(fileTemplate && { fileTemplate }),
        titolo: template.nome,
        testo: messaggio.testo,
        fonti,
        identita: { ...versoIdentitaGenerazione(identita), ...(logo && { logo }) },
      });

      return inviaFile(risposta, file.byte, file.contentType, `attachment; filename="${file.nomeFile}"`);
    },
  );

  async function caricaLogo(riga: RigaIdentita): Promise<{ byte: Buffer; tipo: string } | undefined> {
    if (!riga.logo_path || !riga.logo_tipo) return undefined;
    try {
      return { byte: await archivio().scarica(riga.logo_path), tipo: riga.logo_tipo };
    } catch {
      return undefined; // un logo sparito dallo Storage non ferma la generazione
    }
  }
}

// ---------------------------------------------------------------------------
// Letture condivise
// ---------------------------------------------------------------------------

export async function templatePerId(client: pg.ClientBase, id: string): Promise<RigaTemplate | undefined> {
  const r = await client.query<RigaTemplate>(
    `select id, tenant_id, nome, formato, descrizione, tipologia_libreria, path_file
     from velia.template where id = $1`,
    [id],
  );
  return r.rows[0];
}

/**
 * L'elenco con il predefinito per tipologia risolto: vale la riga del tenant
 * in `template_predefiniti` se c'è (anche a `null` = tolto), altrimenti il
 * default di libreria. Libreria prima, poi i propri per data di caricamento.
 */
async function elencoTemplate(client: pg.ClientBase, tenantId: string): Promise<TemplateOutput[]> {
  /* Sequenziali: è un solo client di transazione, non sa parallelizzare. */
  const righe = await client.query<RigaTemplate>(
    `select id, tenant_id, nome, formato, descrizione, tipologia_libreria, path_file
     from velia.template
     where tenant_id is null or tenant_id = $1
     order by (tenant_id is not null), created_at, id`,
    [tenantId],
  );
  const scelte = await client.query<{ tipologia: TipologiaOutput; template_id: string | null }>(
    `select tipologia, template_id from velia.template_predefiniti where tenant_id = $1`,
    [tenantId],
  );

  const predefiniti = new Map<TipologiaOutput, string | null>();
  for (const r of righe.rows) {
    if (r.tipologia_libreria) predefiniti.set(r.tipologia_libreria, r.id);
  }
  for (const s of scelte.rows) predefiniti.set(s.tipologia, s.template_id);

  return righe.rows.map((r) => {
    const tipologia = [...predefiniti.entries()].find(([, id]) => id === r.id)?.[0];
    return {
      id: r.id,
      nome: r.nome,
      formato: r.formato,
      descrizione: r.descrizione,
      personalizzato: r.tenant_id !== null,
      ...(tipologia && { tipologiaPredefinita: tipologia }),
    };
  });
}

export async function identitaDelTenant(client: pg.ClientBase, tenantId: string): Promise<RigaIdentita> {
  const r = await client.query<RigaIdentita>(
    `select colore_primario, recapiti, firma, logo_path, logo_tipo
     from velia.identita_visiva where tenant_id = $1`,
    [tenantId],
  );
  return r.rows[0] ?? IDENTITA_PREDEFINITA;
}

function versoIdentita(riga: RigaIdentita): IdentitaVisiva {
  return {
    colorePrimario: riga.colore_primario,
    recapiti: riga.recapiti,
    firma: riga.firma,
    ...(riga.logo_path && { logoUrl: '/api/identita-visiva/logo' }),
  };
}

export function versoIdentitaGenerazione(riga: RigaIdentita): Omit<IdentitaGenerazione, 'logo'> {
  return { colorePrimario: riga.colore_primario, recapiti: riga.recapiti, firma: riga.firma };
}

async function registraStorico(
  client: pg.ClientBase,
  identita: Identita,
  azione: 'creazione' | 'modifica' | 'eliminazione',
  descrizione: string,
): Promise<void> {
  await client.query(
    `insert into velia.impostazioni_storico (tenant_id, utente_id, azione, oggetto, descrizione)
     values ($1, $2, $3, 'template', $4)`,
    [identita.tenantId, identita.utenteId, azione, descrizione],
  );
}

function tipoMime(formato: 'pdf' | 'docx' | 'xlsx'): string {
  return {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }[formato];
}

/**
 * Il controllo all'ingresso (RF-D-12): formato dall'estensione, firma dei
 * byte, e per DOCX/XLSX il segnaposto `{{contenuto}}` — un template senza il
 * posto del testo genererebbe documenti vuoti, meglio un rifiuto leggibile.
 */
async function verificaTemplate(
  nome: string,
  contenuto: Buffer,
  troncato: boolean,
): Promise<'pdf' | 'docx' | 'xlsx'> {
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
      `«${nome}»: la generazione PPTX non è ancora disponibile — carica un template PDF, DOCX o XLSX.`,
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
  let segnaposto: string[];
  try {
    segnaposto = estensione === 'docx' ? segnapostoDocx(contenuto) : await segnapostoXlsx(contenuto);
  } catch {
    throw new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» non è un file ${estensione.toUpperCase()} leggibile.`);
  }
  if (!segnaposto.includes('contenuto')) {
    throw new ErroreApi(
      400,
      'SEGNAPOSTO_MANCANTI',
      `«${nome}»: nel template manca il segnaposto {{contenuto}}, il posto del testo generato.`,
    );
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
