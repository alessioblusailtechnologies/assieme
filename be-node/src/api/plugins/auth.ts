import { createSecretKey } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { configurazione } from '../../config.js';
import { ErroreApi } from '../../contratto/errori.js';
import type { Identita } from '../../db/identita.js';

/** I claim del JWT di Supabase Auth che ci interessano. */
export interface ClaimsSupabase {
  sub?: string;
  app_metadata?: {
    tenant_id?: string;
    ruolo?: string;
  };
}

export type VerificaToken = (token: string) => Promise<ClaimsSupabase>;

declare module 'fastify' {
  interface FastifyRequest {
    identita: Identita;
  }
}

/** Rotte fuori dall'autenticazione: la sonda di vita e gli ingressi. */
const ROTTE_PUBBLICHE = new Set([
  '/api/salute',
  '/api/sessione/accesso',
  '/api/sessione/aggiorna',
  /* L'ingresso del cliente: il token del link si presenta qui. */
  '/api/sessione/ospite',
]);

/**
 * Lo schema con cui il cliente di una chat presenta il token del suo link.
 *
 * Volutamente **diverso** da `Bearer`: quel token non è un JWT, non è
 * verificabile in locale e non vale niente fuori dalla nostra API. Due
 * credenziali di natura diversa non devono somigliarsi, o prima o poi
 * qualcuno le tratta allo stesso modo.
 */
const SCHEMA_OSPITE = 'Ospite ';

/** Da token del link a identità: la iniettiamo per non legare auth al database. */
export type RisolviOspite = (token: string) => Promise<{ identita: Identita }>;

/**
 * Verifica il token del progetto Supabase. Due strade, decise dalla
 * configurazione:
 *
 * - progetto con chiavi legacy (il nostro): HS256 col segreto JWT in
 *   `SUPABASE_JWT_SECRET` — verifica locale, nessuna chiamata;
 * - progetto migrato alle signing key: JWKS standard, chiavi in cache
 *   dentro `jose`.
 */
function verificatoreSupabase(): VerificaToken {
  const config = configurazione();

  if (config.SUPABASE_JWT_SECRET) {
    const segreto = createSecretKey(Buffer.from(config.SUPABASE_JWT_SECRET));
    return async (token) => {
      const { payload } = await jwtVerify(token, segreto, { audience: 'authenticated' });
      return payload;
    };
  }

  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', config.SUPABASE_URL));
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, { audience: 'authenticated' });
    return payload;
  };
}

/**
 * Autenticazione su ogni rotta: Bearer token di Supabase Auth → `identita`
 * sulla richiesta. Sostituisce l'header di sviluppo `X-Velia-Ruolo` del
 * mock: il ruolo e il tenant arrivano da `app_metadata`, che l'utente non
 * può scrivere.
 *
 * Un token valido ma senza tenant o ruolo è un utente mal provisionato:
 * 403, non 500 — e il log dice perché.
 */
export function registraAuth(
  app: FastifyInstance,
  verifica?: VerificaToken,
  risolviOspite?: RisolviOspite,
): void {
  let verificatore: VerificaToken | undefined = verifica;

  app.decorateRequest('identita');

  app.addHook('onRequest', async (richiesta) => {
    if (ROTTE_PUBBLICHE.has(richiesta.url.split('?')[0] ?? '')) return;

    const intestazione = richiesta.headers.authorization;

    /* Il cliente di una chat: il token del link, risolto contro il
       database. Niente da verificare in locale, niente da rinnovare. */
    if (intestazione?.startsWith(SCHEMA_OSPITE)) {
      if (!risolviOspite) throw ErroreApi.nonAutenticato();
      const esito = await risolviOspite(intestazione.slice(SCHEMA_OSPITE.length));
      richiesta.identita = esito.identita;
      return;
    }

    if (!intestazione?.startsWith('Bearer ')) {
      throw ErroreApi.nonAutenticato();
    }

    let claims: ClaimsSupabase;
    try {
      verificatore ??= verificatoreSupabase();
      claims = await verificatore(intestazione.slice('Bearer '.length));
    } catch {
      throw ErroreApi.nonAutenticato('Sessione scaduta o token non valido.');
    }

    const { sub } = claims;
    const tenantId = claims.app_metadata?.tenant_id;
    const ruolo = claims.app_metadata?.ruolo;
    /*
     * `ospite` **non** passa di qui, e non è una svista.
     *
     * Il ruolo esiste (07/09/2026), ma un ospite entra solo dallo schema
     * `Ospite`, che a ogni richiesta ricontrolla stato, scadenza e tetto
     * della sua chat. Accettarlo anche come Bearer vorrebbe dire che una
     * sessione ottenuta in qualunque altro modo scavalca la revoca: il link
     * si sospende e quella sessione continua a leggere.
     */
    if (!sub || !tenantId || (ruolo !== 'operatore' && ruolo !== 'amministratore')) {
      richiesta.log.warn({ sub }, 'token valido ma identità incompleta (tenant o ruolo assenti)');
      throw ErroreApi.permessoNegato();
    }

    richiesta.identita = { utenteId: sub, tenantId, ruolo };
  });
}

/**
 * Guardia delle rotte da amministratore (impostazioni in scrittura, utenti,
 * MCP…): il 403 che il mock già restituisce, dallo stesso punto.
 */
export function richiediAmministratore(richiesta: FastifyRequest): void {
  if (richiesta.identita.ruolo !== 'amministratore') {
    throw ErroreApi.permessoNegato();
  }
}
