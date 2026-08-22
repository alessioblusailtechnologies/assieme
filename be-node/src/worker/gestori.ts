import type pg from 'pg';

import type { Job } from './coda.js';
import { emettiEvento } from './eventi.js';
import { ArchivioStorage } from './ingestion/archivio-file.js';
import { ClassificatoreHaiku } from './ingestion/classificatore.js';
import { ConvertitoreHaiku } from './ingestion/convertitore.js';
import { creaGestoreIngestion } from './ingestion/gestore.js';

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
/**
 * Il gestore di ingestion vero si costruisce alla prima chiamata, non
 * all'importazione: creare il client Anthropic pretende la chiave in .env,
 * e l'API server importa questo modulo senza mai fare ingestion.
 */
let ingestionVera: GestoreJob | undefined;

export const gestori: Partial<Record<Job['tipo'], GestoreJob>> = {
  ingestion: async (job, strumenti) => {
    ingestionVera ??= creaGestoreIngestion({
      convertitore: new ConvertitoreHaiku(),
      classificatore: new ClassificatoreHaiku(),
      archivio: new ArchivioStorage(),
    });
    await ingestionVera(job, strumenti);
  },

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
