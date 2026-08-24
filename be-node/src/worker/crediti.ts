import type pg from 'pg';

import { classeModello, type OperazioneCrediti } from '../contratto/crediti.js';

/**
 * L'addebito dei crediti a fine job: il worker è l'unico scrivano anche
 * qui. I crediti seguono il lavoro fatto: il costo della sessione (token
 * letti e scritti, come lo riporta l'SDK o la tariffa del fornitore) al
 * cambio del listino (`per_usd`, 25 = 1 credito ogni 4 centesimi), minimo
 * 1. Un «ciao» costa 1, un confronto documentale con Opus intorno a 10.
 *
 * Senza un costo (sessioni che non lo riportano) vale il peso della classe
 * del modello; la conversione di un documento è fissa. Un addebito che
 * fallisce non fa fallire il job: la risposta è già scritta, il credito si
 * sistema dopo — e lo si vede nel log.
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
    utenteId?: string | null;
    descrizione: string;
  },
): Promise<number> {
  const crediti = await creditiPer(db, dati);
  if (crediti <= 0) return 0;
  try {
    await db.query(
      `insert into velia.crediti_movimenti
         (tenant_id, tipo, crediti, operazione, modello, job_id, utente_id, descrizione)
       values ($1, 'addebito', $2, $3, $4, $5, $6, $7)`,
      [dati.tenantId, -crediti, dati.operazione, dati.modello ?? null, dati.jobId ?? null, dati.utenteId ?? null, dati.descrizione],
    );
  } catch (errore) {
    console.error('[crediti] addebito fallito', { jobId: dati.jobId, operazione: dati.operazione }, errore);
    return 0;
  }
  return crediti;
}

/** Quanti crediti vale un'operazione, dal listino in tabella. */
export async function creditiPer(
  db: pg.Pool | pg.ClientBase,
  dati: { operazione: OperazioneCrediti; modello?: string; costoUsd?: number },
): Promise<number> {
  const pesi = await db.query<{ classe: string; crediti: number }>(`select classe, crediti from velia.crediti_pesi`);
  const listino = new Map(pesi.rows.map((p) => [p.classe, p.crediti]));
  if (dati.operazione === 'conversione') return listino.get('conversione') ?? 1;
  const perUsd = listino.get('per_usd');
  if (dati.costoUsd !== undefined && perUsd) {
    return Math.max(1, Math.ceil(dati.costoUsd * perUsd));
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
  const r = await db.query<SaldoRiga>(`select * from velia.saldo_crediti($1)`, [tenantId]);
  return r.rows[0] ?? { inclusi: 0, inclusi_usati: 0, acquistati: 0, acquistati_usati: 0, disponibili: 0 };
}
