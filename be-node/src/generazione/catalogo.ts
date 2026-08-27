import type pg from 'pg';

import type { Citazione } from '../contratto/conversazioni.js';
import { ErroreApi } from '../contratto/errori.js';
import type { FormatoGenerazione, RichiestaEsporta, TemplateOutput } from '../contratto/template.js';
import type { ArchivioFile } from '../worker/ingestion/archivio-file.js';
import type { IdentitaGenerazione } from './generatore.js';

/**
 * Il catalogo dei template e l'identità visiva, letti dal database: le
 * funzioni che API (esporta chat/tabelle, documento degli agenti) e worker
 * (il tool `genera_documento` in chat) condividono. Niente Fastify qui.
 *
 * Un template è un file dell'agenzia; per formato ce n'è al più un
 * predefinito; il layout di piattaforma non è in catalogo ed è ciò che vale
 * quando per il formato chiesto non c'è un template (`risolviTemplate`).
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

export interface RigaIdentita {
  colore_primario: string;
  recapiti: string;
  firma: string;
  logo_path: string | null;
  logo_tipo: string | null;
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

export const IDENTITA_PREDEFINITA: RigaIdentita = {
  colore_primario: '#2f4b7c',
  recapiti: '',
  firma: '',
  logo_path: null,
  logo_tipo: null,
};

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

export async function identitaDelTenant(client: pg.ClientBase, tenantId: string): Promise<RigaIdentita> {
  const r = await client.query<RigaIdentita>(
    `select colore_primario, recapiti, firma, logo_path, logo_tipo
     from velia.identita_visiva where tenant_id = $1`,
    [tenantId],
  );
  return r.rows[0] ?? IDENTITA_PREDEFINITA;
}

export function versoIdentitaGenerazione(riga: RigaIdentita): Omit<IdentitaGenerazione, 'logo'> {
  return { colorePrimario: riga.colore_primario, recapiti: riga.recapiti, firma: riga.firma };
}

/** L'identità visiva pronta per la generazione, logo compreso (un logo sparito non ferma nulla). */
export async function identitaPerGenerazione(
  archivio: ArchivioFile,
  riga: RigaIdentita,
): Promise<IdentitaGenerazione> {
  const base = versoIdentitaGenerazione(riga);
  if (!riga.logo_path || !riga.logo_tipo) return base;
  try {
    return { ...base, logo: { byte: await archivio.scarica(riga.logo_path), tipo: riga.logo_tipo } };
  } catch {
    return base;
  }
}
