import { configurazione } from '../config.js';
import { poolDb, chiudiPool } from '../db/pool.js';
import { avviaCiclo } from './ciclo.js';
import { nomeCoda } from './coda.js';

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
const { CONCORRENZA_CHAT } = configurazione();
console.log(
  `[worker] avviato, in ascolto sulla coda «${nomeCoda('lavori')}» e, per la chat, ` +
    `sulla coda «${nomeCoda('chat')}» (${CONCORRENZA_CHAT} domande alla volta)`,
);
/* Un ciclo per i lavori e i suoi per la chat (21/09/2026): una domanda non
   aspetta più la fine di un'ingestion, e nemmeno quella di un'altra domanda
   finché i cicli della chat bastano. */
await Promise.all([
  avviaCiclo(poolDb(), controllo.signal, { corsia: 'lavori' }),
  ...Array.from({ length: CONCORRENZA_CHAT }, () => avviaCiclo(poolDb(), controllo.signal, { corsia: 'chat' })),
]);
await chiudiPool();
console.log('[worker] fermato');
