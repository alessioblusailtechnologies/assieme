import { poolDb, chiudiPool } from '../db/pool.js';
import { avviaCiclo } from './ciclo.js';

/**
 * Il processo worker: `npm run dev:worker`.
 *
 * Solo connessioni in uscita verso Postgres: nessuna porta aperta, nessun
 * contatto diretto con l'API — il vincolo di deployment fissato in
 * chat-analisi.txt e nel piano (§3).
 */
const controllo = new AbortController();

process.on('SIGINT', () => controllo.abort());
process.on('SIGTERM', () => controllo.abort());

console.log('[worker] avviato, in ascolto sulla coda «lavori»');
await avviaCiclo(poolDb(), controllo.signal);
await chiudiPool();
console.log('[worker] fermato');
