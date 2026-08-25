import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

import type pg from 'pg';
import PizZip from 'pizzip';

import {
  percorsoDocumentoGenerato,
  urlDocumentoGenerato,
  type DocumentoGenerato,
  type EventoStream,
} from '../../contratto/conversazioni.js';
import type { FormatoGenerazione } from '../../contratto/template.js';
import {
  identitaDelTenant,
  layoutPerFormato,
  templateDelTenant,
  templatePerId,
  versoRisolto,
  type TemplateRisolto,
} from '../../generazione/catalogo.js';
import { MIME } from '../../generazione/generatore.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import { etichettaAttivita, type EsitoSessione } from '../motore/sessione.js';
import type { Workspace } from '../motore/workspace.js';
import { promptRichiesta, promptSandbox } from './istruzioni.js';
import { Sandbox, type AvviatoreSandbox, type ParametriSessione } from './sandbox.js';

/**
 * L'Esportazione elaborata: Claude Code dentro la sandbox documentale. Il
 * worker prepara la sandbox (workspace, template, identità visiva), avvia
 * la sessione nel container e ne ascolta lo stream; a ogni `consegna`
 * ritira il file, lo mette nello Storage e lo racconta al FE come
 * `documento` — lo stesso canale dell'«Esporta subito». Alla fine la
 * sandbox si distrugge.
 *
 * Le chiavi del worker (db, Storage) non entrano nella sandbox; la chiave
 * Anthropic della sandbox è dedicata e sta dietro il proxy del runner.
 */

export interface RichiestaElaborata {
  tenantId: string;
  conversazioneId: string;
  jobId: string;
  formato: FormatoGenerazione;
  templateId?: string | undefined;
  istruzioni?: string | undefined;
  /** Il contenuto di partenza (la risposta da esportare), se c'è. */
  contenuto?: string | undefined;
  titolo?: string | undefined;
  modello?: string | undefined;
}

export interface OpzioniSessioneDocumentale {
  modello: string;
  maxTurni: number;
  budgetUsd: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
}

export interface DipendenzeElaborata {
  db: pg.Pool;
  archivio: ArchivioFile;
  avviatore: AvviatoreSandbox;
  sessione: OpzioniSessioneDocumentale;
  workspace: Workspace;
  emetti: (evento: EventoStream) => Promise<unknown>;
  annullato: () => Promise<boolean>;
}

export interface EsitoElaborata {
  esito: EsitoSessione;
  generati: DocumentoGenerato[];
  /** I path nello Storage dei file consegnati, per la pulizia se la risposta non passa. */
  percorsi: string[];
  template: TemplateRisolto;
}

export class ErroreElaborata extends Error {}

const FORMATI_CONSEGNA: Record<string, FormatoGenerazione> = { pdf: 'pdf', docx: 'docx', xlsx: 'xlsx' };

export async function eseguiEsportazioneElaborata(dip: DipendenzeElaborata, r: RichiestaElaborata): Promise<EsitoElaborata> {
  /* 1. Template e identità, dal catalogo. */
  const client = await dip.db.connect();
  let template: TemplateRisolto;
  let identita;
  try {
    if (r.templateId) {
      const riga = await templatePerId(client, r.templateId);
      if (!riga || riga.tenant_id !== r.tenantId) throw new ErroreElaborata('Il template scelto non esiste più.');
      template = versoRisolto(riga);
    } else {
      template = layoutPerFormato(await templateDelTenant(client, r.tenantId), r.formato);
    }
    identita = await identitaDelTenant(client, r.tenantId);
  } finally {
    client.release();
  }

  /* 2. La sandbox, con dentro workspace, template e identità. */
  await dip.emetti({ tipo: 'attivita', etichetta: 'Preparo l’ambiente di lavoro' });
  const sandbox = new Sandbox(await dip.avviatore.avvia(r.jobId));
  const generati: DocumentoGenerato[] = [];
  const percorsi: string[] = [];
  try {
    await sandbox.caricaArchivio('workspace', await zipDirectory(dip.workspace.directory));

    let pathTemplate: string | undefined;
    if (template.path_file) {
      const slug = template.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
      pathTemplate = `/lavoro/template/${slug}.${template.formato}`;
      await sandbox.scrivi(`template/${slug}.${template.formato}`, await dip.archivio.scarica(template.path_file));
    }

    let logoPath: string | undefined;
    if (identita.logo_path && identita.logo_tipo) {
      try {
        const byte = await dip.archivio.scarica(identita.logo_path);
        const estensione = identita.logo_tipo === 'image/png' ? 'png' : 'jpg';
        logoPath = `/lavoro/identita/logo.${estensione}`;
        await sandbox.scrivi(`identita/logo.${estensione}`, byte);
      } catch {
        logoPath = undefined;
      }
    }
    await sandbox.scrivi(
      'identita/identita.json',
      JSON.stringify(
        { colorePrimario: identita.colore_primario, recapiti: identita.recapiti, firma: identita.firma, logo: logoPath ?? null },
        null,
        2,
      ),
    );
    await sandbox.esegui('mkdir -p /lavoro/output /lavoro/tmp');

    /* 3. La sessione di Claude Code, ascoltata evento per evento. */
    const documenti = [...dip.workspace.perPath.entries()].map(([path, d]) => ({
      path: `/lavoro/workspace/${path}`,
      titolo: d.titolo,
      archivio: d.archivio,
    }));
    const parametri: ParametriSessione = {
      promptSistema: promptSandbox({
        identita: { colorePrimario: identita.colore_primario, recapiti: identita.recapiti, firma: identita.firma, ...(logoPath && { logoPath }) },
        ...(pathTemplate && { template: { nome: template.nome, formato: template.formato, path: pathTemplate } }),
        formato: r.formato,
        documenti,
      }),
      promptUtente: promptRichiesta({
        formato: r.formato,
        ...(r.titolo && { titolo: r.titolo }),
        ...(r.istruzioni && { istruzioni: r.istruzioni }),
        ...(r.contenuto && { contenuto: r.contenuto }),
      }),
      modello: r.modello ?? dip.sessione.modello,
      maxTurni: dip.sessione.maxTurni,
      budgetUsd: dip.sessione.budgetUsd,
      ...(dip.sessione.effort && { effort: dip.sessione.effort }),
    };

    const controllo = new AbortController();
    const sentinella = setInterval(() => {
      void dip.annullato().then((si) => {
        if (si) {
          controllo.abort();
          void sandbox.annulla();
        }
      });
    }, 3000);

    const titoloPer = (path: string) => dip.workspace.perPath.get(path)?.titolo;
    let esito: EsitoSessione | undefined;
    try {
      for await (const evento of sandbox.sessione(parametri, controllo.signal)) {
        if (evento.tipo === 'attivita') {
          await dip.emetti({ tipo: 'attivita', etichetta: etichettaSandbox(evento.strumento, evento.input, titoloPer) });
        } else if (evento.tipo === 'testo') {
          await dip.emetti({ tipo: 'testo', delta: evento.delta });
        } else if (evento.tipo === 'consegna') {
          const formato = FORMATI_CONSEGNA[evento.formato];
          if (!formato) continue;
          const byte = await sandbox.leggi(evento.path);
          const id = randomUUID();
          const percorso = percorsoDocumentoGenerato(r.tenantId, id, formato);
          await dip.archivio.carica(percorso, byte, MIME[formato]);
          percorsi.push(percorso);
          const documento: DocumentoGenerato = {
            id,
            nome: evento.nome,
            formato,
            ...(template.personalizzato && { template: template.nome }),
            url: urlDocumentoGenerato(r.conversazioneId, id),
          };
          generati.push(documento);
          await dip.emetti({ tipo: 'documento', documento });
        } else if (evento.tipo === 'fine') {
          esito = { ...evento.esito, documentiLetti: [] };
        }
      }
    } catch (errore) {
      if (!controllo.signal.aborted) throw errore;
    } finally {
      clearInterval(sentinella);
    }
    if (!esito) {
      esito = {
        terminato: controllo.signal.aborted ? 'annullato' : 'errore',
        ...(!controllo.signal.aborted && { errore: 'la sandbox ha chiuso lo stream senza un esito' }),
        testo: '',
        turni: 0,
        durataMs: 0,
        costoUsd: 0,
        token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 },
        modello: parametri.modello,
        documentiLetti: [],
      };
    }
    return { esito, generati, percorsi, template };
  } finally {
    await sandbox.chiudi().catch(() => undefined);
  }
}

/**
 * Le attività della sandbox a parole da utente: i tool di lettura con le
 * etichette della chat (i documenti per titolo), Bash con la descrizione
 * che Claude Code già scrive per l'utente, scritture e consegne per nome.
 */
export function etichettaSandbox(
  strumento: string,
  input: Record<string, unknown>,
  titoloPer: (pathRelativo: string) => string | undefined,
): string {
  const accorcia = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`);
  switch (strumento) {
    case 'Read': {
      const p = typeof input['file_path'] === 'string' ? input['file_path'] : '';
      if (/\.(png|jpe?g|webp)$/i.test(p)) return 'Controllo la pagina renderizzata';
      if (p.startsWith('/lavoro/template/')) return 'Studio il template';
      if (p.startsWith('/lavoro/workspace/')) {
        return etichettaAttivita('Read', { ...input, file_path: p.slice('/lavoro/workspace/'.length) }, '', titoloPer);
      }
      return p ? `Leggo ${basename(p)}` : 'Leggo un file';
    }
    case 'Grep':
    case 'Glob': {
      const p = typeof input['path'] === 'string' ? input['path'] : '';
      const rel = p.startsWith('/lavoro/workspace/') ? p.slice('/lavoro/workspace/'.length) : p.startsWith('/lavoro/workspace') ? '' : p;
      return etichettaAttivita(strumento, { ...input, path: rel }, '', titoloPer);
    }
    case 'Bash': {
      const d = typeof input['description'] === 'string' ? input['description'].trim() : '';
      return d ? accorcia(d, 80) : 'Lavoro al documento';
    }
    case 'Write':
    case 'Edit': {
      const p = typeof input['file_path'] === 'string' ? basename(input['file_path']) : '';
      return p ? `Scrivo ${p}` : 'Scrivo un file di lavoro';
    }
    case 'Skill':
      return 'Consulto le istruzioni per il formato';
    case 'TodoWrite':
      return 'Organizzo il lavoro';
    case 'mcp__velia__consegna': {
      const n = typeof input['nome'] === 'string' ? input['nome'] : '';
      return n ? `Consegno «${accorcia(n, 60)}»` : 'Consegno il documento';
    }
    default:
      return 'Lavoro al documento';
  }
}

/** La workspace in uno zip: i file di testo che il motore legge, nella stessa struttura. */
async function zipDirectory(radice: string): Promise<Buffer> {
  const zip = new PizZip();
  async function visita(cartella: string): Promise<void> {
    for (const voce of await readdir(cartella, { withFileTypes: true })) {
      const p = join(cartella, voce.name);
      if (voce.isDirectory()) await visita(p);
      else zip.file(relative(radice, p).split(sep).join('/'), await readFile(p));
    }
  }
  await visita(radice);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
