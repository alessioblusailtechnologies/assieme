import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

import type pg from 'pg';

import type { ArchivioFile } from '../ingestion/archivio-file.js';

/**
 * La workspace di un job (piano §4.3, doc motore §3 e §5): una directory
 * temporanea con dentro SOLTANTO l'Archivio Pubblico e l'archivio del
 * tenant, nell'albero che il motore sa navigare. L'isolamento è fisico:
 * ciò che non c'è non si può leggere.
 *
 * Postgres dice cosa esiste e come si chiama (è la verità sulla
 * navigazione), lo Storage conserva i contenuti (è la verità sul testo), il
 * disco del worker è cache pura: ricostruibile sempre, invalidata dalla
 * versione della riga di catalogo. Lo Storage del privato è piatto per id
 * (Fase 2): l'albero che l'SDK vede si costruisce qui dai metadati.
 */

export interface DocumentoWorkspace {
  id: string;
  titolo: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  tipologia: string;
  numeroPagine: number | null;
  /**
   * L'ultima pagina citabile. Per i privati è `numeroPagine`; per i pubblici è
   * l'ultima pagina del PDF condiviso dell'edizione: le ancore `[pag. N]`
   * riferiscono il PDF complessivo, non la porzione logica (Fase 1).
   */
  paginaMassima: number | null;
  compagnia: string | null;
  ramo: string | null;
  compagniaId: string | null;
  ramoId: string | null;
  prodotto: string | null;
  edizione: string | null;
  riferimentoCliente: string | null;
  etichette: string[];
  documentoDiRiferimento: boolean;
}

export interface Workspace {
  /** La directory radice (assoluta) che diventa la cwd della sessione. */
  directory: string;
  /** path relativo (posix) → documento; è la chiave per leggere le citazioni. */
  perPath: Map<string, DocumentoWorkspace>;
  /** id documento → path relativo (posix). */
  perId: Map<string, string>;
  /** Documenti del contesto che non si è riusciti a materializzare, col motivo. */
  mancanti: Array<{ id: string; titolo: string; motivo: string }>;
  rimuovi(): Promise<void>;
}

interface RigaDocumento {
  id: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  titolo: string;
  tipologia: string;
  numero_pagine: number | null;
  pagina_inizio: number | null;
  path_pdf: string | null;
  path_md: string | null;
  stato: string;
  updated_at: Date;
  compagnia_id: string | null;
  compagnia_nome: string | null;
  ramo_id: string | null;
  ramo_nome: string | null;
  ramo_codice: string | null;
  prodotto: string | null;
  edizione_etichetta: string | null;
  riferimento_cliente: string | null;
  etichette: string[] | null;
  documento_di_riferimento: boolean | null;
  caricato_il: Date | null;
}

export interface OpzioniWorkspace {
  db: pg.Pool;
  archivio: ArchivioFile;
  tenantId: string;
  /** Radice delle workspace e della cache sul disco del worker. */
  radice: string;
  jobId: string;
  /** Gli id del contesto della conversazione (allegati compresi). */
  contestoIds: string[];
}

/** Quanto a lungo ci si fida di un INDICE.md in cache (non ha una riga di catalogo). */
const TTL_INDICI_MS = 60 * 60 * 1000;

export async function materializzaWorkspace(opzioni: OpzioniWorkspace): Promise<Workspace> {
  const { db, archivio, tenantId, radice, jobId, contestoIds } = opzioni;
  const directory = join(radice, 'workspace', jobId);
  const cache = new Cache(join(radice, 'cache'), archivio);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const righe = await db.query<RigaDocumento>(
    `select d.id, d.archivio, d.titolo, d.tipologia, d.numero_pagine, d.pagina_inizio,
            d.path_pdf, d.path_md, d.stato,
            d.updated_at, d.compagnia_id, c.nome as compagnia_nome,
            d.ramo_id, r.nome as ramo_nome, r.codice as ramo_codice,
            d.prodotto, d.edizione_etichetta, d.riferimento_cliente, d.etichette,
            d.documento_di_riferimento, d.caricato_il
     from velia.documenti d
     left join velia.compagnie c on c.id = d.compagnia_id
     left join velia.rami r on r.id = d.ramo_id
     where d.path_md is not null
       and (
         d.archivio = 'pubblico'
         or (d.archivio = 'privato' and d.tenant_id = $1 and d.stato = 'pronto')
         or (d.archivio = 'conversazione' and d.tenant_id = $1 and d.stato = 'pronto' and d.id = any($2))
       )
     order by d.archivio, d.compagnia_id, d.prodotto, d.edizione_valida_dal, d.tipologia, d.caricato_il`,
    [tenantId, contestoIds],
  );

  const perPath = new Map<string, DocumentoWorkspace>();
  const perId = new Map<string, string>();
  const mancanti: Workspace['mancanti'] = [];
  const cartellePubbliche = new Set<string>();

  // L'ultima pagina del PDF condiviso di ogni edizione pubblica (un'edizione = un PDF).
  const ultimaPaginaPdf = new Map<string, number>();
  for (const r of righe.rows) {
    if (r.archivio !== 'pubblico' || !r.path_pdf || r.numero_pagine === null) continue;
    const fine = (r.pagina_inizio ?? 1) + r.numero_pagine - 1;
    ultimaPaginaPdf.set(r.path_pdf, Math.max(ultimaPaginaPdf.get(r.path_pdf) ?? 0, fine));
  }

  for (const riga of righe.rows) {
    const relativo = percorsoNellaWorkspace(riga);
    try {
      const origine = await cache.file(riga.path_md!, riga.updated_at.toISOString());
      await collega(origine, join(directory, ...relativo.split('/')));
    } catch (errore) {
      mancanti.push({
        id: riga.id,
        titolo: riga.titolo,
        motivo: errore instanceof Error ? errore.message : String(errore),
      });
      continue;
    }
    const doc = versoDocumento(riga, riga.archivio === 'pubblico' && riga.path_pdf ? (ultimaPaginaPdf.get(riga.path_pdf) ?? null) : riga.numero_pagine);
    perPath.set(relativo, doc);
    perId.set(riga.id, relativo);
    if (riga.archivio === 'pubblico') {
      // Gli INDICE.md del pubblico stanno nello Storage accanto ai documenti:
      // si portano dentro quelli della cartella e di tutte le sue antenate.
      let cartella = posix.dirname(riga.path_md!);
      while (cartella && cartella !== '.' && cartella !== '/') {
        cartellePubbliche.add(cartella);
        const sopra = posix.dirname(cartella);
        if (sopra === cartella) break;
        cartella = sopra;
      }
    }
  }

  for (const cartella of cartellePubbliche) {
    const percorso = `${cartella}/INDICE.md`;
    const origine = await cache.fileConTtl(percorso, TTL_INDICI_MS);
    if (origine) await collega(origine, join(directory, ...percorso.split('/')));
  }

  // Gli allegati del contesto che non sono (ancora) pronti: il motore deve saperlo.
  const presenti = new Set(perId.keys());
  if (contestoIds.length) {
    const altri = await db.query<{ id: string; titolo: string; archivio: string; stato: string }>(
      `select id, titolo, archivio, stato from velia.documenti
       where id = any($1) and (tenant_id = $2 or archivio = 'pubblico')`,
      [contestoIds, tenantId],
    );
    for (const a of altri.rows) {
      if (presenti.has(a.id)) continue;
      mancanti.push({
        id: a.id,
        titolo: a.titolo,
        motivo:
          a.stato === 'errore'
            ? 'elaborazione fallita: il documento non è leggibile'
            : a.stato !== 'pronto'
              ? 'elaborazione non ancora conclusa'
              : 'Markdown non disponibile',
      });
    }
  }

  await scriviIndiciTenant(directory, perPath);

  return {
    directory,
    perPath,
    perId,
    mancanti,
    rimuovi: () => rm(directory, { recursive: true, force: true }),
  };
}

/** Il path relativo (posix) di un documento nell'albero della workspace. */
export function percorsoNellaWorkspace(riga: {
  id: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  titolo: string;
  tipologia: string;
  path_md: string | null;
}): string {
  if (riga.archivio === 'pubblico') return riga.path_md!.replace(/^\/+/, '');
  const nome = `${slug(riga.titolo)}--${riga.id}.md`;
  return riga.archivio === 'privato'
    ? `tenant/documenti/${riga.tipologia}/${nome}`
    : `tenant/allegati/${nome}`;
}

export function slug(testo: string): string {
  return (
    testo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'documento'
  );
}

function versoDocumento(r: RigaDocumento, paginaMassima: number | null): DocumentoWorkspace {
  return {
    id: r.id,
    titolo: r.titolo,
    archivio: r.archivio,
    tipologia: r.tipologia,
    numeroPagine: r.numero_pagine,
    paginaMassima,
    compagnia: r.compagnia_nome,
    ramo: r.ramo_nome,
    compagniaId: r.compagnia_id,
    ramoId: r.ramo_id,
    prodotto: r.prodotto,
    edizione: r.edizione_etichetta,
    riferimentoCliente: r.riferimento_cliente,
    etichette: r.etichette ?? [],
    documentoDiRiferimento: r.documento_di_riferimento ?? false,
  };
}

/**
 * Gli INDICE.md del tenant si generano qui, dai metadati: nello Storage il
 * privato è piatto per id, e tipologia/cliente/etichette cambiano nel tempo.
 */
async function scriviIndiciTenant(
  directory: string,
  perPath: Map<string, DocumentoWorkspace>,
): Promise<void> {
  const privati = [...perPath.entries()].filter(([, d]) => d.archivio === 'privato');
  const allegati = [...perPath.entries()].filter(([, d]) => d.archivio === 'conversazione');

  const rigaDoc = ([path, d]: [string, DocumentoWorkspace]): string =>
    `| \`${path}\` | ${d.titolo} | ${d.tipologia} | ${d.compagnia ?? '—'} | ${d.ramo ?? '—'} | ${d.riferimentoCliente ?? '—'} | ${d.numeroPagine ?? '?'} | ${d.etichette.join(', ') || '—'} |${d.documentoDiRiferimento ? ' ★' : ''}`;
  const intestazione =
    '| File | Titolo | Tipologia | Compagnia | Ramo | Cliente/pratica | Pagine | Etichette |\n|---|---|---|---|---|---|---|---|';

  const radice =
    '# Indice della workspace\n\n' +
    '- `archivio-pubblico/` — set informativi delle compagnie (DIP, DIP Aggiuntivo, Condizioni, glossari), per compagnia/ramo/prodotto/edizione. Ogni cartella ha il suo `INDICE.md`.\n' +
    `- \`tenant/documenti/\` — l'archivio privato dell'agenzia (${privati.length} documenti): preventivi, polizze, note. Vedi \`tenant/documenti/INDICE.md\`.\n` +
    `- \`tenant/allegati/\` — gli allegati della conversazione in corso (${allegati.length}). Vedi \`tenant/allegati/INDICE.md\`.\n`;
  await writeFile(join(directory, 'INDICE.md'), radice, 'utf8');

  await mkdir(join(directory, 'tenant', 'documenti'), { recursive: true });
  await writeFile(
    join(directory, 'tenant', 'documenti', 'INDICE.md'),
    '# Archivio privato dell’agenzia\n\n' +
      (privati.length
        ? `${intestazione}\n${privati.map(rigaDoc).join('\n')}\n\n★ = documento di riferimento dell’agenzia (contesto permanente).\n`
        : 'Nessun documento privato.\n'),
    'utf8',
  );

  await mkdir(join(directory, 'tenant', 'allegati'), { recursive: true });
  await writeFile(
    join(directory, 'tenant', 'allegati', 'INDICE.md'),
    '# Allegati della conversazione\n\n' +
      (allegati.length
        ? `${intestazione}\n${allegati.map(rigaDoc).join('\n')}\n`
        : 'Nessun allegato.\n'),
    'utf8',
  );
}

/** Hard link se il filesystem lo permette (stesso volume), altrimenti copia. */
async function collega(origine: string, destinazione: string): Promise<void> {
  await mkdir(join(destinazione, '..'), { recursive: true });
  try {
    await link(origine, destinazione);
  } catch {
    await copyFile(origine, destinazione);
  }
}

/**
 * La cache dei file dello Storage sul disco del worker, per path. Ogni
 * voce porta la versione con cui è stata scaricata: quella del catalogo
 * per i documenti, l'età per gli indici.
 */
class Cache {
  constructor(
    private readonly radice: string,
    private readonly archivio: ArchivioFile,
  ) {}

  private voce(percorso: string): { file: string; meta: string } {
    const chiave = createHash('sha1').update(percorso).digest('hex');
    return { file: join(this.radice, chiave), meta: join(this.radice, `${chiave}.json`) };
  }

  /** Il file locale per un path dello Storage, aggiornato alla versione data. */
  async file(percorso: string, versione: string): Promise<string> {
    const { file, meta } = this.voce(percorso);
    const m = await leggiMeta(meta);
    if (m && m.versione === versione && !m.mancante && (await esiste(file))) return file;
    const contenuto = await this.archivio.scarica(percorso);
    await mkdir(this.radice, { recursive: true });
    await writeFile(file, contenuto);
    await writeFile(meta, JSON.stringify({ percorso, versione, scaricatoIl: Date.now() }), 'utf8');
    return file;
  }

  /** Come `file`, ma per ciò che non ha una versione: si rinfresca per età, e l'assenza si ricorda. */
  async fileConTtl(percorso: string, ttlMs: number): Promise<string | undefined> {
    const { file, meta } = this.voce(percorso);
    const m = await leggiMeta(meta);
    if (m && Date.now() - m.scaricatoIl < ttlMs) {
      if (m.mancante) return undefined;
      if (await esiste(file)) return file;
    }
    await mkdir(this.radice, { recursive: true });
    try {
      const contenuto = await this.archivio.scarica(percorso);
      await writeFile(file, contenuto);
      await writeFile(meta, JSON.stringify({ percorso, versione: 'ttl', scaricatoIl: Date.now() }), 'utf8');
      return file;
    } catch {
      await writeFile(
        meta,
        JSON.stringify({ percorso, versione: 'ttl', scaricatoIl: Date.now(), mancante: true }),
        'utf8',
      );
      return undefined;
    }
  }
}

interface Meta {
  percorso: string;
  versione: string;
  scaricatoIl: number;
  mancante?: boolean;
}

async function leggiMeta(percorso: string): Promise<Meta | undefined> {
  try {
    return JSON.parse(await readFile(percorso, 'utf8')) as Meta;
  } catch {
    return undefined;
  }
}

async function esiste(percorso: string): Promise<boolean> {
  try {
    await access(percorso, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
