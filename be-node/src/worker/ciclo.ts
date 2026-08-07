import type pg from 'pg';

import { aggiornaStatoJob, archivia, prossimo } from './coda.js';
import { emettiEvento } from './eventi.js';
import { gestori, type StrumentiJob } from './gestori.js';

export interface OpzioniCiclo {
  /** Dopo quante consegne un job che fallisce ancora diventa `fallito`. */
  tentativiMassimi?: number;
  /** Invisibilità del messaggio mentre il worker lo lavora. */
  visibilitaSecondi?: number;
}

/**
 * Lavora UN messaggio, se c'è. Restituisce true se ha lavorato qualcosa.
 *
 * Semantica at-least-once, quindi idempotenza prima di tutto: il gestore
 * viene invocato solo se il job non è già assestato — un doppio arrivo
 * (worker morto dopo il lavoro ma prima dell'archiviazione) si archivia
 * senza rieseguire. L'annullamento esplicito si rispetta qui, tra una
 * consegna e l'altra.
 */
export async function lavoraUno(db: pg.Pool, opzioni: OpzioniCiclo = {}): Promise<boolean> {
  const tentativiMassimi = opzioni.tentativiMassimi ?? 3;
  const messaggio = await prossimo(db, opzioni.visibilitaSecondi ?? 60);
  if (!messaggio) return false;

  const { job, msgId, consegne } = messaggio;

  if (job.stato === 'annullato' || job.stato === 'completato' || job.stato === 'fallito') {
    await archivia(db, msgId);
    return true;
  }

  const gestore = gestori[job.tipo];
  if (!gestore) {
    await aggiornaStatoJob(db, job.id, 'fallito', {
      errore: `nessun gestore per il tipo '${job.tipo}'`,
    });
    await archivia(db, msgId);
    return true;
  }

  await aggiornaStatoJob(db, job.id, 'in-esecuzione', { tentativi: consegne });
  const strumenti: StrumentiJob = { db };

  try {
    await gestore(job, strumenti);
    await aggiornaStatoJob(db, job.id, 'completato');
    await archivia(db, msgId);
  } catch (errore) {
    const messaggioErrore = errore instanceof Error ? errore.message : String(errore);
    if (consegne >= tentativiMassimi) {
      // Fallimento persistente: si racconta (RF-E-11), non si nasconde.
      await aggiornaStatoJob(db, job.id, 'fallito', {
        tentativi: consegne,
        errore: messaggioErrore,
      });
      await emettiEvento(db, job.id, 'errore', { messaggio: messaggioErrore });
      await archivia(db, msgId);
    } else {
      // Si lascia il messaggio in coda: ricomparirà da solo allo scadere
      // della visibilità. Lo stato torna in-coda perché l'utente veda
      // l'attesa, e il nuovo tentativo sta nel log del job.
      await aggiornaStatoJob(db, job.id, 'in-coda', {
        tentativi: consegne,
        errore: messaggioErrore,
      });
      await emettiEvento(db, job.id, 'nuovo-tentativo', {
        tentativo: consegne,
        di: tentativiMassimi,
      });
    }
  }
  return true;
}

/**
 * Il ciclo del worker: pesca finché c'è lavoro, altrimenti attende.
 * Si ferma pulito quando il segnale viene abortito.
 */
export async function avviaCiclo(
  db: pg.Pool,
  segnale: AbortSignal,
  opzioni: OpzioniCiclo & { attesaVuotaMs?: number } = {},
): Promise<void> {
  const attesa = opzioni.attesaVuotaMs ?? 1000;
  while (!segnale.aborted) {
    let lavorato = false;
    try {
      lavorato = await lavoraUno(db, opzioni);
    } catch (errore) {
      // Un errore di infrastruttura (rete, DB) non deve uccidere il worker:
      // si logga e si riprova con calma.
      console.error('[worker] errore di ciclo:', errore);
    }
    if (!lavorato && !segnale.aborted) {
      await new Promise((r) => setTimeout(r, attesa));
    }
  }
}
