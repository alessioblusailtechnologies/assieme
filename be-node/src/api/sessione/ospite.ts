import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

import { ErroreApi } from '../../contratto/errori.js';
import type { Identita } from '../../db/identita.js';

/**
 * Il token del link di una chat cliente.
 *
 * Non emettiamo niente: questo token **è** la credenziale, dalla creazione
 * fino alla revoca. Il front-end non parla mai con Supabase e `conIdentita`
 * costruisce da sé i claim che la RLS legge, quindi non serve un JWT — e
 * non averlo significa che non esiste niente, in giro, che valga fuori
 * dalla nostra API (piano §4.1).
 *
 * Del token si conserva solo lo `sha256`: chi legge il database non entra
 * nelle chat dei clienti. Il segreto in chiaro si vede una volta sola,
 * quando l'agenzia crea la chat; poi si rigenera, non si rilegge.
 */

/** Abbastanza lungo da non tentare nessuno: 32 byte in base64url. */
export function nuovoTokenOspite(): string {
  return randomBytes(32).toString('base64url');
}

export function impronta(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface RigaChat {
  id: string;
  tenant_id: string;
  ospite_id: string;
  stato: string;
  scaduta: boolean;
  esaurita: boolean;
}

export interface ChatOspite {
  identita: Identita;
  chatId: string;
}

/**
 * Da token a identità, o niente.
 *
 * Tutte le ragioni per cui un link non vale più — sospeso, scaduto,
 * domande finite — danno lo **stesso** errore verso l'esterno: chi ha in
 * mano un link revocato non deve poter distinguere «non è mai esistito» da
 * «è scaduto ieri». La differenza la legge l'agenzia, nei suoi strumenti.
 */
export async function risolviOspite(db: pg.Pool, token: string): Promise<ChatOspite> {
  /* Un token vuoto o assurdo non arriva nemmeno al database. */
  if (!token || token.length < 20 || token.length > 200) throw ErroreApi.nonAutenticato();

  const righe = await db.query<RigaChat>(
    `select id, tenant_id, ospite_id, stato,
            (scade_il is not null and scade_il <= now()) as scaduta,
            (tetto_domande is not null and domande_fatte >= tetto_domande) as esaurita
       from velia.chat_clienti
      where token_hash = $1`,
    [impronta(token)],
  );
  const chat = righe.rows[0];
  if (!chat || chat.stato !== 'attiva' || chat.scaduta || chat.esaurita) {
    throw ErroreApi.nonAutenticato('Questo collegamento non è più valido.');
  }

  return {
    chatId: chat.id,
    identita: { utenteId: chat.ospite_id, tenantId: chat.tenant_id, ruolo: 'ospite' },
  };
}

/**
 * Confronto a tempo costante di due impronte, per i punti in cui si
 * verifica un token già noto. Le impronte hanno lunghezza fissa: se non ce
 * l'hanno, non sono impronte.
 */
export function improntaUguale(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
