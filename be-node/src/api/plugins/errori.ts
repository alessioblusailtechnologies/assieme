import type { FastifyError, FastifyInstance } from 'fastify';

import { ErroreApi } from '../../contratto/errori.js';

/**
 * Il gestore centrale degli errori: l'unico punto in cui un'eccezione
 * diventa una risposta HTTP.
 *
 * - `ErroreApi` esce con il suo stato e il suo corpo `{codice, messaggio}`.
 * - Gli errori di validazione di Fastify/Zod diventano 400 DATI_NON_VALIDI.
 * - Tutto il resto è un 500 ERRORE_INTERNO: il dettaglio va nel log,
 *   mai al client (il FE mostra il messaggio, e lo stack non è un messaggio).
 */
export function registraGestoreErrori(app: FastifyInstance): void {
  app.setErrorHandler((errore: FastifyError | ErroreApi, richiesta, risposta) => {
    if (errore instanceof ErroreApi) {
      void risposta.status(errore.stato).send(errore.corpo());
      return;
    }

    if (errore.validation) {
      void risposta.status(400).send({
        codice: 'DATI_NON_VALIDI',
        messaggio: 'La richiesta contiene dati mancanti o non validi.',
      });
      return;
    }

    richiesta.log.error({ err: errore }, 'errore non gestito');
    void risposta.status(500).send({
      codice: 'ERRORE_INTERNO',
      messaggio: 'Il servizio non è momentaneamente disponibile.',
    });
  });

  app.setNotFoundHandler((_richiesta, risposta) => {
    void risposta.status(404).send({
      codice: 'NON_TROVATO',
      messaggio: 'Risorsa non trovata.',
    });
  });
}
