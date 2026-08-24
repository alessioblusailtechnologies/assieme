import type pg from 'pg';

import { classeModello, type OperazioneCrediti } from '../contratto/crediti.js';

export interface TokenSessione {
  input: number;
  output: number;
  cacheLettura: number;
  cacheScrittura: number;
}

/**
 * L'addebito dei crediti a fine job: il worker è l'unico scrivano anche
 * qui. I crediti seguono il lavoro fatto: il costo della sessione (token
 * letti e scritti, contati turno per turno dallo stream e prezzati al
 * listino del modello) al cambio del listino (`per_usd`, 25 = 1 credito
 * ogni 4 centesimi), con un decimale e senza minimo artificiale sotto lo
 * 0,1. Un «ciao» costa pochi decimi, un confronto documentale con Opus
 * intorno a 10.
 *
 * Ogni addebito porta con sé token e costo da cui nasce: il numero si può
 * verificare, non è a spanne. Senza un costo (sessioni che non lo
 * riportano) vale il «tipico» della classe del modello; la conversione di
 * un documento è fissa. Un addebito che fallisce non fa fallire il job.
 */
export async function addebitaCrediti(
  db: pg.Pool | pg.ClientBase,
  dati: {
    tenantId: string;
    /** Il job che ha fatto il lavoro; assente per gli addebiti fuori dal worker. */
    jobId?: string;
    operazione: OperazioneCrediti;
    /** L'id SDK del modello usato; assente per la conversione. */
    modello?: string;
    /** Il costo della sessione in dollari: è ciò che fa i crediti. */
    costoUsd?: number;
    /** I token della sessione, per il registro. */
    token?: TokenSessione;
    /** Vero se l'input è stimato dal contesto (gateway che non lo riporta). */
    tokenStimati?: boolean | undefined;
    utenteId?: string | null;
    descrizione: string;
  },
): Promise<number> {
  const crediti = await creditiPer(db, dati);
  if (crediti <= 0) return 0;
  const tokenInput = dati.token ? dati.token.input + dati.token.cacheLettura + dati.token.cacheScrittura : null;
  try {
    await db.query(
      `insert into velia.crediti_movimenti
         (tenant_id, tipo, crediti, operazione, modello, job_id, utente_id, descrizione,
          token_input, token_output, costo_usd, token_stimati)
       values ($1, 'addebito', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        dati.tenantId,
        -crediti,
        dati.operazione,
        dati.modello ?? null,
        dati.jobId ?? null,
        dati.utenteId ?? null,
        dati.descrizione,
        tokenInput,
        dati.token?.output ?? null,
        dati.costoUsd ?? null,
        dati.tokenStimati ?? false,
      ],
    );
  } catch (errore) {
    console.error('[crediti] addebito fallito', { jobId: dati.jobId, operazione: dati.operazione }, errore);
    return 0;
  }
  return crediti;
}

/** Quanti crediti vale un'operazione, dal listino in tabella: un decimale, minimo 0,1 se c'è stato lavoro. */
export async function creditiPer(
  db: pg.Pool | pg.ClientBase,
  dati: { operazione: OperazioneCrediti; modello?: string; costoUsd?: number },
): Promise<number> {
  const pesi = await db.query<{ classe: string; crediti: number }>(`select classe, crediti from velia.crediti_pesi`);
  const listino = new Map(pesi.rows.map((p) => [p.classe, Number(p.crediti)]));
  if (dati.operazione === 'conversione') return listino.get('conversione') ?? 1;
  const perUsd = listino.get('per_usd');
  if (dati.costoUsd !== undefined && perUsd) {
    if (dati.costoUsd <= 0) return 0;
    return Math.max(0.1, Math.round(dati.costoUsd * perUsd * 10) / 10);
  }
  return listino.get(classeModello(dati.modello ?? '')) ?? listino.get('opus') ?? 10;
}

export interface SaldoRiga {
  inclusi: number;
  inclusi_usati: number;
  acquistati: number;
  acquistati_usati: number;
  disponibili: number;
}

export async function saldoCrediti(db: pg.Pool | pg.ClientBase, tenantId: string): Promise<SaldoRiga> {
  const r = await db.query<Record<keyof SaldoRiga, string | number>>(`select * from velia.saldo_crediti($1)`, [tenantId]);
  const riga = r.rows[0];
  if (!riga) return { inclusi: 0, inclusi_usati: 0, acquistati: 0, acquistati_usati: 0, disponibili: 0 };
  return {
    inclusi: Number(riga.inclusi),
    inclusi_usati: Number(riga.inclusi_usati),
    acquistati: Number(riga.acquistati),
    acquistati_usati: Number(riga.acquistati_usati),
    disponibili: Number(riga.disponibili),
  };
}
