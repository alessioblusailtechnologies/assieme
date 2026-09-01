import type pg from 'pg';

import { aggiornaStatoJob, archivia, estendiVisibilita, prossimo, rimettiInCoda } from './coda.js';
import { ErroreNonRitentabile } from './errori.js';
import { emettiEvento } from './eventi.js';
import { gestori, type StrumentiJob } from './gestori.js';

export interface OpzioniCiclo {
  /** Dopo quante consegne un job che fallisce ancora diventa `fallito`. */
  tentativiMassimi?: number;
  /** Invisibilità del messaggio mentre il worker lo lavora. */
  visibilitaSecondi?: number;
  /** Quanto aspetta un tentativo fallito prima di tornare pescabile. */
  ritentaTraSecondi?: number;
}

/**
 * Il respiro fra un tentativo e il successivo (01/09/2026).
 *
 * Fino a ieri non c'era: il messaggio restava in coda invisibile e
 * ricompariva allo scadere della visibilità — un minuto buono di silenzio
 * per chi in chat stava aspettando una risposta, con la domanda già
 * partita e nessun segno di vita. Ora si rimette in coda subito; due
 * secondi bastano perché un guasto momentaneo (un riavvio del worker, il
 * modello sovraccarico) sia passato, e a non rifare tre giri nello stesso
 * istante.
 */
const RITENTA_TRA_SECONDI = 2;

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
  const visibilitaSecondi = opzioni.visibilitaSecondi ?? 60;
  const messaggio = await prossimo(db, visibilitaSecondi);
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
  /* La riga era stata letta PRIMA dell'aggiornamento: il gestore deve vedere
     il tentativo in corso, non quello precedente (i gestori di tabelle e
     agenti ci decidono il «fallimento definitivo»). */
  job.tentativi = consegne;
  const strumenti: StrumentiJob = { db };

  /* Il battito: finché il gestore lavora, il messaggio resta invisibile
     agli altri consumer. Un battito mancato (rete) non è un errore: il
     prossimo lo recupera, e nel peggiore dei casi vale la regola di prima. */
  const battito = setInterval(
    () => void estendiVisibilita(db, msgId, visibilitaSecondi).catch(() => undefined),
    Math.max(5_000, Math.floor((visibilitaSecondi * 1000) / 3)),
  );

  try {
    await gestore(job, strumenti);
    /* `completato` solo se nel frattempo nessuno l'ha annullato (l'API lo
       fa quando il client chiude lo stream): l'annullamento non si sovrascrive. */
    await db.query(
      `update velia.jobs set stato = 'completato', errore = null
       where id = $1 and stato = 'in-esecuzione'`,
      [job.id],
    );
    await archivia(db, msgId);
  } catch (errore) {
    const messaggioErrore = errore instanceof Error ? errore.message : String(errore);
    if (errore instanceof ErroreNonRitentabile || consegne >= tentativiMassimi) {
      // Fallimento persistente: si racconta (RF-E-11), non si nasconde.
      await aggiornaStatoJob(db, job.id, 'fallito', {
        tentativi: consegne,
        errore: messaggioErrore,
      });
      /* All'utente non va il messaggio dell'eccezione: è roba interna
         (comandi, percorsi, a volte ciò che un comando aveva in riga) e il
         gestore, quando ha qualcosa di sensato da dire, lo ha già detto con
         un evento suo. Il dettaglio resta nel job, per l'audit. */
      await emettiEvento(db, job.id, 'errore', {
        messaggio: 'Il lavoro si è interrotto per un problema tecnico. Riprova fra poco.',
      });
      await archivia(db, msgId);
    } else {
      /* Si ritenta: lo stato torna in-coda perché l'utente veda l'attesa, e
         il messaggio torna pescabile fra pochi secondi invece che allo
         scadere della visibilità. */
      await aggiornaStatoJob(db, job.id, 'in-coda', {
        tentativi: consegne,
        errore: messaggioErrore,
      });
      await rimettiInCoda(db, msgId, opzioni.ritentaTraSecondi ?? RITENTA_TRA_SECONDI);
      /* Il perché resta nei log del worker: il job lo dimentica appena un
         tentativo riesce (`errore = null`), e senza questa riga di un
         fallimento intermedio non resta traccia leggibile. */
      console.warn(
        `[worker] tentativo ${consegne}/${tentativiMassimi} fallito su ${job.tipo} ${job.id}: ${messaggioErrore}`,
      );
      /* E l'attesa si racconta: un minuto di silenzio senza spiegazione è
         peggio di un intoppo dichiarato. */
      await emettiEvento(db, job.id, 'attivita', {
        tipo: 'attivita',
        etichetta: 'Un tentativo non è riuscito: riprovo',
      });
      await emettiEvento(db, job.id, 'nuovo-tentativo', {
        tentativo: consegne,
        di: tentativiMassimi,
      });
    }
  } finally {
    clearInterval(battito);
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
