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

/** Rotte fuori dall'autenticazione: la sonda di vita e l'ingresso stesso. */
const ROTTE_PUBBLICHE = new Set(['/api/salute', '/api/sessione/accesso', '/api/sessione/aggiorna']);

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
 * sulla richiesta. Sostituisce l'header di sviluppo `X-Assieme-Ruolo` del
 * mock: il ruolo e il tenant arrivano da `app_metadata`, che l'utente non
 * può scrivere.
 *
 * Un token valido ma senza tenant o ruolo è un utente mal provisionato:
 * 403, non 500 — e il log dice perché.
 */
export function registraAuth(app: FastifyInstance, verifica?: VerificaToken): void {
  let verificatore: VerificaToken | undefined = verifica;

  app.decorateRequest('identita');

  app.addHook('onRequest', async (richiesta) => {
    if (ROTTE_PUBBLICHE.has(richiesta.url.split('?')[0] ?? '')) return;

    const intestazione = richiesta.headers.authorization;
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
