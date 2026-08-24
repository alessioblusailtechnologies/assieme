import { resolve } from 'node:path';

import type pg from 'pg';

import { configurazione } from '../config.js';
import { creaGestoreAgenti } from './agenti/gestore.js';
import type { Job } from './coda.js';
import { emettiEvento } from './eventi.js';
import { ArchivioStorage } from './ingestion/archivio-file.js';
import { ClassificatoreHaiku } from './ingestion/classificatore.js';
import { ConvertitoreHaiku } from './ingestion/convertitore.js';
import { creaGestoreIngestion } from './ingestion/gestore.js';
import { EstrattoreMotore } from './memoria/estrattore.js';
import { creaGestoreMemoria } from './memoria/gestore.js';
import { creaGestoreInterrogazione } from './motore/gestore.js';
import type { ChiaviFornitori } from './motore/fornitori.js';
import { MotoreAgentSdk } from './motore/sessione.js';
import { GeneratoreSuggerimentiHaiku } from './motore/suggeritore.js';
import { GeneratoreTitoloHaiku } from './motore/titolista.js';
import { creaGestoreTabelle } from './tabelle/gestore.js';

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
let interrogazioneVera: GestoreJob | undefined;
let tabellaVera: GestoreJob | undefined;
let agenteVero: GestoreJob | undefined;
let memoriaVera: GestoreJob | undefined;
let estrattoreVero: EstrattoreMotore | undefined;

/** Le chiavi dei fornitori terzi (RF-D-03), lette una volta dalla configurazione. */
const fornitori = (c: ReturnType<typeof configurazione>): ChiaviFornitori => ({
  hostyourai: { ...(c.HOSTYOURAI_API_KEY && { chiave: c.HOSTYOURAI_API_KEY }), baseUrl: c.HOSTYOURAI_BASE_URL },
});

/** La memoria (Fase 8) usa lo stesso motore della chat, col modello del tenant: pochi turni, nessun documento. */
function estrattoreMemoria(): EstrattoreMotore {
  if (!estrattoreVero) {
    const c = configurazione();
    estrattoreVero = new EstrattoreMotore(
      new MotoreAgentSdk({
        modello: c.MODELLO_MOTORE,
        maxTurni: 4,
        budgetUsd: c.MOTORE_BUDGET_USD,
        fornitori: fornitori(c),
        ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
      }),
      resolve(c.CARTELLA_WORKER),
    );
  }
  return estrattoreVero;
}

export const gestori: Partial<Record<Job['tipo'], GestoreJob>> = {
  ingestion: async (job, strumenti) => {
    ingestionVera ??= creaGestoreIngestion({
      convertitore: new ConvertitoreHaiku(),
      classificatore: new ClassificatoreHaiku(),
      archivio: new ArchivioStorage(),
    });
    await ingestionVera(job, strumenti);
  },

  /** Fase 3: il motore agentico (Agent SDK) sulla workspace del tenant. */
  interrogazione: async (job, strumenti) => {
    if (!interrogazioneVera) {
      const c = configurazione();
      interrogazioneVera = creaGestoreInterrogazione({
        motore: new MotoreAgentSdk({
          modello: c.MODELLO_MOTORE,
          maxTurni: c.MOTORE_MAX_TURNI,
          budgetUsd: c.MOTORE_BUDGET_USD,
          fornitori: fornitori(c),
          ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
        }),
        archivio: new ArchivioStorage(),
        generatoreTitolo: new GeneratoreTitoloHaiku(),
        generatoreSuggerimenti: new GeneratoreSuggerimentiHaiku(),
        estrattore: estrattoreMemoria(),
        radice: resolve(c.CARTELLA_WORKER),
      });
    }
    await interrogazioneVera(job, strumenti);
  },

  /** Fase 7: l'esecuzione di un agente — la stessa interrogazione, ingresso diverso. */
  agente: async (job, strumenti) => {
    if (!agenteVero) {
      const c = configurazione();
      agenteVero = creaGestoreAgenti({
        motore: new MotoreAgentSdk({
          modello: c.MODELLO_MOTORE,
          maxTurni: c.MOTORE_MAX_TURNI,
          budgetUsd: c.MOTORE_BUDGET_USD,
          fornitori: fornitori(c),
          ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
        }),
        archivio: new ArchivioStorage(),
        radice: resolve(c.CARTELLA_WORKER),
      });
    }
    await agenteVero(job, strumenti);
  },

  /** Fase 5: l'estrazione delle celle, per gruppi per documento. */
  tabella: async (job, strumenti) => {
    if (!tabellaVera) {
      const c = configurazione();
      tabellaVera = creaGestoreTabelle({
        motore: new MotoreAgentSdk({
          modello: c.MODELLO_TABELLE ?? c.MODELLO_MOTORE,
          maxTurni: c.MOTORE_MAX_TURNI,
          budgetUsd: c.MOTORE_BUDGET_USD,
          fornitori: fornitori(c),
          ...(c.MOTORE_EFFORT && { effort: c.MOTORE_EFFORT }),
        }),
        archivio: new ArchivioStorage(),
        radice: resolve(configurazione().CARTELLA_WORKER),
      });
    }
    await tabellaVera(job, strumenti);
  },

  /** Fase 8: il job di memoria a sé (rilavorare una conversazione a mano); la chat impara in linea. */
  memoria: async (job, strumenti) => {
    memoriaVera ??= creaGestoreMemoria({ estrattore: estrattoreMemoria() });
    await memoriaVera(job, strumenti);
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
