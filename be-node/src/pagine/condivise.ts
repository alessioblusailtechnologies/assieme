import { createHash, randomBytes } from 'node:crypto';

import type pg from 'pg';

import { GIORNI_LINK_PREDEFINITI, type LinkDocumento } from '../contratto/pagine.js';

/**
 * I link delle pagine condivise (11/09/2026, fase 2 di
 * `PIANO-LINK-E-FORMATI.md`): la stessa logica per la rotta dell'agenzia
 * (pulsante «Condividi link») e per lo strumento del motore della chat
 * (`condividi_link`). Niente Fastify qui.
 *
 * Il token segue le chat cliente: 32 byte casuali, l'impronta per trovarlo,
 * il chiaro per rimostrarlo all'agenzia. Un link per documento: condividere
 * di nuovo rimostra lo stesso; revocare cancella la riga, e il link dopo ha
 * un token nuovo.
 */

const GIORNO_MS = 24 * 60 * 60 * 1000;

export function nuovoTokenPagina(): string {
  return randomBytes(32).toString('base64url');
}

export function improntaPagina(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** L'indirizzo pubblico di una pagina: servito dall'API, fuori dall'autenticazione. */
export function urlPagina(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/p/${token}`;
}

interface RigaLink {
  token: string;
  scade_il: Date | null;
  creata_il: Date;
}

const versoLink = (base: string, r: RigaLink): LinkDocumento => ({
  url: urlPagina(base, r.token),
  scadeIl: r.scade_il?.toISOString() ?? null,
  creatoIl: r.creata_il.toISOString(),
});

export async function linkDelDocumento(
  client: pg.ClientBase,
  base: string,
  conversazioneId: string,
  documentoId: string,
): Promise<LinkDocumento | undefined> {
  const r = await client.query<RigaLink>(
    `select token, scade_il, creata_il from velia.pagine_condivise
      where conversazione_id = $1 and documento_id = $2`,
    [conversazioneId, documentoId],
  );
  return r.rows[0] && versoLink(base, r.rows[0]);
}

export interface DocumentoDaCondividere {
  tenantId: string;
  conversazioneId: string;
  documento: { id: string; nome: string; formato: string };
  utenteId?: string | undefined;
}

/**
 * Crea il link di un documento, o ne cambia la scadenza. `giorni`: quanti da
 * oggi; `null` nessuna scadenza; assente, 30 giorni per un link nuovo e
 * scadenza invariata per uno che c'è già.
 */
export async function condividiDocumento(
  client: pg.ClientBase,
  base: string,
  d: DocumentoDaCondividere,
  giorni?: number | null,
): Promise<LinkDocumento> {
  const scadenza = (g: number) => new Date(Date.now() + g * GIORNO_MS);
  const perNuovo = giorni === null ? null : scadenza(giorni ?? GIORNI_LINK_PREDEFINITI);
  const token = nuovoTokenPagina();
  const r = await client.query<RigaLink>(
    `insert into velia.pagine_condivise
       (tenant_id, conversazione_id, documento_id, nome, formato, token_hash, token, scade_il, creata_da)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (conversazione_id, documento_id) do update
       set scade_il = case when $10 then excluded.scade_il else velia.pagine_condivise.scade_il end
     returning token, scade_il, creata_il`,
    [
      d.tenantId,
      d.conversazioneId,
      d.documento.id,
      d.documento.nome,
      d.documento.formato,
      improntaPagina(token),
      token,
      perNuovo,
      d.utenteId ?? null,
      giorni !== undefined,
    ],
  );
  return versoLink(base, r.rows[0]!);
}

/** Revoca il link: la riga se ne va, e quel token non apre più niente. */
export async function revocaLink(client: pg.ClientBase, conversazioneId: string, documentoId: string): Promise<boolean> {
  const r = await client.query(
    `delete from velia.pagine_condivise where conversazione_id = $1 and documento_id = $2`,
    [conversazioneId, documentoId],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface PaginaPubblica {
  tenantId: string;
  documentoId: string;
  nome: string;
  formato: string;
}

/**
 * Da token a documento, solo se il link vale ancora. Con la connessione di
 * sistema: chi apre la pagina non ha un'identità. Scaduto, revocato o mai
 * esistito danno lo stesso niente.
 */
export async function paginaPerToken(db: pg.Pool | pg.ClientBase, token: string): Promise<PaginaPubblica | undefined> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return undefined;
  const r = await db.query<{ tenant_id: string; documento_id: string; nome: string; formato: string }>(
    `select tenant_id, documento_id, nome, formato from velia.pagine_condivise
      where token_hash = $1 and (scade_il is null or scade_il > now())`,
    [improntaPagina(token)],
  );
  const riga = r.rows[0];
  return riga && { tenantId: riga.tenant_id, documentoId: riga.documento_id, nome: riga.nome, formato: riga.formato };
}
