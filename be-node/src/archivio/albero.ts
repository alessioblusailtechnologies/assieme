import type pg from 'pg';

import type { Cartella, RuoloFigli } from '../contratto/cartelle.js';

/**
 * Tutto quello che serve qui dentro è saper interrogare: un `Pool` (il
 * worker, che scrive con la connessione di sistema) oppure un client dentro
 * una transazione con identità (le rotte, che passano dalla RLS). Chiedere
 * `pg.ClientBase` escluderebbe il primo senza guadagnare niente.
 */
export interface Interrogabile {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    testo: string,
    valori?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

/**
 * L'albero dell'Archivio Privato: le operazioni che servono sia alle rotte
 * sia al worker, in un posto solo.
 *
 * L'albero è libero — nessuna forma obbligata, nessuno schema da
 * configurare — e vive tutto in `velia.cartelle`. Lo Storage non lo sa e
 * non deve saperlo: resta piatto per id (Fase 2), quindi spostare una
 * cartella è una `update` di `parent_id` e non un trasloco di byte.
 */

export interface RigaCartella {
  id: string;
  parent_id: string | null;
  nome: string;
  slug: string;
  descrizione: string | null;
  descrizione_da_utente: boolean;
  ruolo_figli: RuoloFigli | null;
  cliente_id: string | null;
}

/** Il nome ridotto a chiave: è ciò che rende «Rossi Mario» e «rossi  mario» la stessa cartella. */
export function slugCartella(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'cartella'
  );
}

const SQL_CARTELLE = `
  select id, parent_id, nome, slug, descrizione, descrizione_da_utente, ruolo_figli, cliente_id
  from velia.cartelle
  where tenant_id = $1
  order by nome collate "it-x-icu"`;

export async function caricaCartelle(
  client: Interrogabile,
  tenantId: string,
): Promise<RigaCartella[]> {
  const r = await client.query<RigaCartella>(SQL_CARTELLE, [tenantId]);
  return r.rows;
}

/** id → riga, per risalire l'albero senza tornare al database. */
export function indicizza(righe: RigaCartella[]): Map<string, RigaCartella> {
  return new Map(righe.map((r) => [r.id, r]));
}

/**
 * Il percorso leggibile dalla radice («Clienti/Rossi Mario/Auto»): quello
 * che l'utente vede, che pronuncia in chat e che il motore ritrova con Glob.
 */
export function percorsoDi(id: string, per: Map<string, RigaCartella>): string {
  const parti: string[] = [];
  const visti = new Set<string>();
  let corrente: string | null = id;
  while (corrente && !visti.has(corrente)) {
    visti.add(corrente);
    const riga: RigaCartella | undefined = per.get(corrente);
    if (!riga) break;
    parti.unshift(riga.nome);
    corrente = riga.parent_id;
  }
  return parti.join('/');
}

/** Come sopra, ma a slug: è il percorso che va sul filesystem della workspace. */
export function percorsoSlug(id: string, per: Map<string, RigaCartella>): string {
  const parti: string[] = [];
  const visti = new Set<string>();
  let corrente: string | null = id;
  while (corrente && !visti.has(corrente)) {
    visti.add(corrente);
    const riga: RigaCartella | undefined = per.get(corrente);
    if (!riga) break;
    parti.unshift(riga.slug);
    corrente = riga.parent_id;
  }
  return parti.join('/');
}

/** `candidato` sta dentro `antenato` (o è lui)? Serve a non annidare una cartella in sé stessa. */
export function eDiscendente(
  candidato: string,
  antenato: string,
  per: Map<string, RigaCartella>,
): boolean {
  const visti = new Set<string>();
  let corrente: string | null = candidato;
  while (corrente && !visti.has(corrente)) {
    if (corrente === antenato) return true;
    visti.add(corrente);
    corrente = per.get(corrente)?.parent_id ?? null;
  }
  return false;
}

export interface ConteggioCartella {
  /** Documenti dentro la cartella esatta. */
  propri: number;
  /** Documenti nel sottoalbero, questa compresa. */
  totali: number;
}

/**
 * L'albero come lo vuole il FE: annidato, coi conteggi già sommati verso
 * l'alto (il numero sull'albero è quello del sottoalbero, altrimenti una
 * cartella di clienti mostrerebbe sempre zero).
 */
export function costruisciAlbero(
  righe: RigaCartella[],
  documentiPerCartella: Map<string, number>,
): Cartella[] {
  const figliDi = new Map<string | null, RigaCartella[]>();
  for (const r of righe) {
    const chiave = r.parent_id;
    const elenco = figliDi.get(chiave);
    if (elenco) elenco.push(r);
    else figliDi.set(chiave, [r]);
  }

  const costruisci = (riga: RigaCartella, prefisso: string): Cartella => {
    const percorso = prefisso ? `${prefisso}/${riga.nome}` : riga.nome;
    const figli = (figliDi.get(riga.id) ?? []).map((f) => costruisci(f, percorso));
    const propri = documentiPerCartella.get(riga.id) ?? 0;
    return {
      id: riga.id,
      nome: riga.nome,
      percorso,
      ...(riga.parent_id && { parentId: riga.parent_id }),
      ...(riga.descrizione && { descrizione: riga.descrizione }),
      descrizioneDaUtente: riga.descrizione_da_utente,
      ...(riga.ruolo_figli && { ruoloFigli: riga.ruolo_figli }),
      ...(riga.cliente_id && { clienteId: riga.cliente_id }),
      documenti: propri,
      documentiTotali: propri + figli.reduce((s, f) => s + f.documentiTotali, 0),
      figli,
    };
  };

  return (figliDi.get(null) ?? []).map((r) => costruisci(r, ''));
}

export interface CartellaDaAssicurare {
  parentId: string | null;
  nome: string;
  ruoloFigli?: RuoloFigli | null;
  clienteId?: string | null;
  descrizione?: string | null;
}

/**
 * La cartella con quel nome sotto quel padre: la ritrova o la crea.
 *
 * Select prima, insert poi, e in caso di collisione si rilegge: due job che
 * importano lo stesso lotto in parallelo devono convergere sulla stessa
 * cartella, non farne due o rompersi. L'unicità vera la garantiscono gli
 * indici, questo è solo il modo cortese di arrivarci.
 */
export async function assicuraCartella(
  client: Interrogabile,
  tenantId: string,
  c: CartellaDaAssicurare,
): Promise<string> {
  const nome = c.nome.trim().slice(0, 120) || 'Senza nome';
  const slug = slugCartella(nome);
  const trova = async (): Promise<string | undefined> => {
    const r = await client.query<{ id: string }>(
      c.parentId === null
        ? `select id from velia.cartelle where tenant_id = $1 and parent_id is null and slug = $2`
        : `select id from velia.cartelle where tenant_id = $1 and parent_id = $3 and slug = $2`,
      c.parentId === null ? [tenantId, slug] : [tenantId, slug, c.parentId],
    );
    return r.rows[0]?.id;
  };

  const esistente = await trova();
  if (esistente) {
    /* Il ruolo e l'aggancio al cliente si completano anche dopo: una
       cartella creata a mano che si scopre essere di un cliente non va
       duplicata, va agganciata. */
    if (c.ruoloFigli !== undefined || c.clienteId !== undefined) {
      await client.query(
        `update velia.cartelle
         set ruolo_figli = coalesce($2, ruolo_figli), cliente_id = coalesce($3, cliente_id)
         where id = $1`,
        [esistente, c.ruoloFigli ?? null, c.clienteId ?? null],
      );
    }
    return esistente;
  }

  try {
    const r = await client.query<{ id: string }>(
      `insert into velia.cartelle (tenant_id, parent_id, nome, slug, ruolo_figli, cliente_id, descrizione)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [tenantId, c.parentId, nome, slug, c.ruoloFigli ?? null, c.clienteId ?? null, c.descrizione ?? null],
    );
    return r.rows[0]!.id;
  } catch (errore) {
    if ((errore as { code?: string }).code !== '23505') throw errore;
    const dopoLaCorsa = await trova();
    if (!dopoLaCorsa) throw errore;
    return dopoLaCorsa;
  }
}

/**
 * Un percorso intero («Clienti/Rossi Mario/Auto»), creando ciò che manca.
 * È la strada dell'importazione: i path relativi dei file diventano l'albero,
 * ed è da lì che nasce la convenzione.
 */
export async function assicuraPercorso(
  client: Interrogabile,
  tenantId: string,
  segmenti: string[],
): Promise<string | null> {
  let parentId: string | null = null;
  for (const segmento of segmenti) {
    const nome = segmento.trim();
    if (!nome || nome === '.' || nome === '..') continue;
    parentId = await assicuraCartella(client, tenantId, { parentId, nome });
  }
  return parentId;
}

/**
 * L'albero è cambiato di forma: la convenzione osservata va rifatta.
 *
 * Si alza solo sui cambi di STRUTTURA (creazione, rinomina, spostamento,
 * eliminazione), mai sull'aggiunta di un documento: il duecentesimo
 * preventivo dentro una cartella di preventivi non cambia niente, e
 * ricalcolare a ogni file sarebbe quaranta ricalcoli per un lotto da
 * quaranta.
 */
export async function segnaDaRicalcolare(
  client: Interrogabile,
  tenantId: string,
): Promise<void> {
  await client.query(
    `insert into velia.convenzione_archivio (tenant_id, da_ricalcolare)
     values ($1, true)
     on conflict (tenant_id) do update set da_ricalcolare = true, updated_at = now()`,
    [tenantId],
  );
}

/** Quanti documenti in ciascuna cartella (solo i propri: la somma la fa l'albero). */
export async function conteggiPerCartella(
  client: Interrogabile,
  tenantId: string,
): Promise<Map<string, number>> {
  const r = await client.query<{ cartella_id: string; quanti: number }>(
    `select cartella_id, count(*)::int as quanti
     from velia.documenti
     where archivio = 'privato' and tenant_id = $1 and cartella_id is not null
     group by cartella_id`,
    [tenantId],
  );
  return new Map(r.rows.map((x) => [x.cartella_id, x.quanti]));
}
