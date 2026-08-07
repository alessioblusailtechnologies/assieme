import type pg from 'pg';

import type { Job } from './coda.js';
import { emettiEvento } from './eventi.js';

/** Gli strumenti che ogni gestore riceve; crescono con le fasi. */
export interface StrumentiJob {
  db: pg.Pool;
}

export type GestoreJob = (job: Job, strumenti: StrumentiJob) => Promise<void>;

/**
 * Un gestore per tipo di job. Quelli veri arrivano con le fasi
 * (ingestion → Fase 1, interrogazione → Fase 3, agente → Fase 7,
 * memoria → Fase 8); `prova` esiste per dimostrare il giro completo
 * coda → worker → eventi → LISTEN già in Fase 0, ed è quello che i test
 * end-to-end esercitano.
 */
export const gestori: Partial<Record<Job['tipo'], GestoreJob>> = {
  prova: async (job, { db }) => {
    await emettiEvento(db, job.id, 'inizio', {});
    const passi = Number(job.payload['passi'] ?? 2);
    for (let i = 1; i <= passi; i++) {
      await emettiEvento(db, job.id, 'avanzamento', { passo: i, di: passi });
    }
    if (job.payload['fallisci'] === true) {
      throw new Error('fallimento richiesto dal payload di prova');
    }
    await emettiEvento(db, job.id, 'fine', {});
  },
};
