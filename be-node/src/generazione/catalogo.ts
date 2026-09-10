import type pg from 'pg';

import type { Citazione } from '../contratto/conversazioni.js';
import { ErroreApi } from '../contratto/errori.js';
import {
  INTESTAZIONE_INIZIALE,
  immaginiDellaFascia,
  schemaIntestazione,
  type Intestazione,
} from '../contratto/intestazione.js';
import type { FormatoGenerazione, RichiestaEsporta, TemplateOutput } from '../contratto/template.js';
import type { ArchivioFile } from '../worker/ingestion/archivio-file.js';
import type { FormatoDocumento } from './generatore.js';
import { dimensioniImmagine, tipoImmagine, type FasceDocumento, type ImmagineFascia } from './intestazione.js';

/**
 * Il catalogo dei template e l'intestazione dell'agenzia, letti dal
 * database: le funzioni che API (esporta chat/tabelle, documento degli
 * agenti) e worker (i tool dei documenti in chat, la sandbox) condividono.
 * Niente Fastify qui.
 *
 * Dall'11/09/2026 i template servono solo alla sandbox («Genera documento
 * da template»); i documenti deterministici escono col layout di VELIA e
 * l'intestazione dell'agenzia (`fasceDelTenant`).
 */

export interface RigaTemplate {
  id: string;
  tenant_id: string;
  nome: string;
  formato: 'pdf' | 'docx' | 'xlsx' | 'pptx';
  descrizione: string;
  predefinito: boolean;
  path_file: string;
}

/**
 * Il template risolto per una generazione: un file del tenant, oppure il
 * layout di piattaforma per il formato (`personalizzato: false`, senza file).
 */
export interface TemplateRisolto {
  id?: string;
  nome: string;
  formato: FormatoGenerazione;
  personalizzato: boolean;
  path_file?: string;
}

/** Il nome del layout di piattaforma: dà il nome al file quando non c'è un template. */
export const NOME_LAYOUT_PIATTAFORMA = 'Documento VELIA';

const COLONNE = `id, tenant_id, nome, formato, descrizione, predefinito, path_file`;

export async function templatePerId(client: pg.ClientBase, id: string): Promise<RigaTemplate | undefined> {
  const r = await client.query<RigaTemplate>(`select ${COLONNE} from velia.template where id = $1`, [id]);
  return r.rows[0];
}

/** I template del tenant, per data di caricamento. */
export async function templateDelTenant(client: pg.ClientBase, tenantId: string): Promise<RigaTemplate[]> {
  const r = await client.query<RigaTemplate>(
    `select ${COLONNE} from velia.template where tenant_id = $1 order by created_at, id`,
    [tenantId],
  );
  return r.rows;
}

export async function elencoTemplate(client: pg.ClientBase, tenantId: string): Promise<TemplateOutput[]> {
  return (await templateDelTenant(client, tenantId)).map((r) => ({
    id: r.id,
    nome: r.nome,
    formato: r.formato,
    descrizione: r.descrizione,
    predefinito: r.predefinito,
  }));
}

/**
 * La risoluzione di una scelta di esportazione, unica per chat, tabelle e
 * agenti: un template preciso (404 se non c'è, 415 se PPTX), oppure il
 * predefinito del formato, oppure il layout di piattaforma per quel formato.
 */
export async function risolviTemplate(
  client: pg.ClientBase,
  tenantId: string,
  scelta: RichiestaEsporta,
): Promise<TemplateRisolto> {
  if (scelta.templateId) {
    const riga = await templatePerId(client, scelta.templateId);
    if (!riga) throw ErroreApi.nonTrovato('Template inesistente.');
    return versoRisolto(riga);
  }
  return layoutPerFormato(await templateDelTenant(client, tenantId), scelta.formato!);
}

/** Fra i template dati, il predefinito del formato; altrimenti il layout di piattaforma. */
export function layoutPerFormato(template: RigaTemplate[], formato: FormatoGenerazione): TemplateRisolto {
  const predefinito = template.find((t) => t.formato === formato && t.predefinito);
  return predefinito ? versoRisolto(predefinito) : { nome: NOME_LAYOUT_PIATTAFORMA, formato, personalizzato: false };
}

export function versoRisolto(riga: RigaTemplate): TemplateRisolto {
  if (riga.formato === 'pptx') {
    throw new ErroreApi(
      415,
      'FORMATO_NON_SUPPORTATO',
      'La generazione PPTX non è ancora disponibile: scegli un template PDF, DOCX o XLSX.',
    );
  }
  return { id: riga.id, nome: riga.nome, formato: riga.formato, personalizzato: true, path_file: riga.path_file };
}

/** Le fonti nella forma del mock: «Titolo — art. X, p. N». */
export function fontiDaCitazioni(citazioni: Citazione[]): string[] {
  return citazioni.map((c) => {
    const posizione = [
      c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione,
      `p. ${c.posizione.pagina}`,
    ]
      .filter(Boolean)
      .join(', ');
    return `${c.documentoTitolo} - ${posizione}`;
  });
}

/**
 * Il formato di un'esportazione deterministica. Un template scelto (dalle
 * tabelle e dagli agenti, finché non passano ai formati: fase 3 del piano)
 * vale ormai solo per il suo formato; l'impaginazione è sempre quella di
 * VELIA con l'intestazione dell'agenzia.
 */
export async function formatoDaScelta(client: pg.ClientBase, scelta: RichiestaEsporta): Promise<FormatoDocumento> {
  if (!scelta.templateId) return scelta.formato!;
  const riga = await templatePerId(client, scelta.templateId);
  if (!riga) throw ErroreApi.nonTrovato('Template inesistente.');
  return versoRisolto(riga).formato;
}

// ---------------------------------------------------------------------------
// Intestazione e piè di pagina (11/09/2026)
// ---------------------------------------------------------------------------

/** Dove sta un'immagine dell'intestazione: l'id porta già l'estensione. */
export const percorsoImmagineIntestazione = (tenantId: string, id: string): string =>
  `tenant/${tenantId}/intestazione/${id}`;

/** Intestazione e piè salvati dal tenant; senza una riga, quelli di partenza. */
export async function intestazioneDelTenant(
  client: pg.ClientBase,
  tenantId: string,
): Promise<Intestazione & { aggiornataIl?: Date }> {
  const r = await client.query<{ intestazione: unknown; piede: unknown; aggiornata_il: Date }>(
    `select intestazione, piede, aggiornata_il from velia.intestazione where tenant_id = $1`,
    [tenantId],
  );
  const riga = r.rows[0];
  if (!riga) return INTESTAZIONE_INIZIALE;
  /* Salvata da una versione dello schema che non torna più: meglio il
     documento di partenza che un documento che non esce. */
  const esito = schemaIntestazione.safeParse({ intestazione: riga.intestazione, piede: riga.piede });
  return esito.success ? { ...esito.data, aggiornataIl: riga.aggiornata_il } : INTESTAZIONE_INIZIALE;
}

/**
 * Le fasce pronte per generare: il JSON, le immagini che cita (una che
 * manca nello Storage si salta, non ferma nulla) e i campi che non
 * dipendono dalla pagina.
 */
export async function fascePerGenerazione(
  archivio: ArchivioFile,
  tenantId: string,
  intestazione: Intestazione,
  campi: { titolo: string; agenzia: string },
): Promise<FasceDocumento> {
  const immagini = new Map<string, ImmagineFascia>();
  const ids = new Set([...immaginiDellaFascia(intestazione.intestazione), ...immaginiDellaFascia(intestazione.piede)]);
  for (const id of ids) {
    try {
      const byte = await archivio.scarica(percorsoImmagineIntestazione(tenantId, id));
      const tipo = tipoImmagine(byte);
      const dimensioni = dimensioniImmagine(byte);
      if (tipo && dimensioni) immagini.set(id, { byte, tipo, ...dimensioni });
    } catch {
      /* sparita dallo Storage: il documento esce senza */
    }
  }
  return {
    intestazione: intestazione.intestazione,
    piede: intestazione.piede,
    immagini,
    campi: {
      titolo: campi.titolo,
      agenzia: campi.agenzia,
      data: new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    },
  };
}

/** Tutto in una: le fasce del tenant, col suo nome per il campo «agenzia». */
export async function fasceDelTenant(
  client: pg.ClientBase,
  archivio: ArchivioFile,
  tenantId: string,
  titolo: string,
): Promise<FasceDocumento> {
  const [intestazione, tenant] = await Promise.all([
    intestazioneDelTenant(client, tenantId),
    client.query<{ nome: string }>(`select nome from velia.tenant where id = $1`, [tenantId]),
  ]);
  return fascePerGenerazione(archivio, tenantId, intestazione, { titolo, agenzia: tenant.rows[0]?.nome ?? '' });
}
