import { configurazione } from '../config.js';
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

/* Il nome vero, non «lavori» scritto a mano: da quando esiste
   `CODA_LAVORI` (una coda per la macchina locale, così non contende i job
   col worker di dev) un log che dice sempre la stessa cosa manda fuori
   strada proprio chi sta cercando di capire perché un job non parte. */
console.log(`[worker] avviato, in ascolto sulla coda «${configurazione().CODA_LAVORI}»`);
await avviaCiclo(poolDb(), controllo.signal);
await chiudiPool();
console.log('[worker] fermato');
