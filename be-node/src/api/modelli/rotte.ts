import type { FastifyInstance } from 'fastify';

import { configurazione } from '../../config.js';
import { ErroreApi } from '../../contratto/errori.js';
import {
  CATALOGO_MODELLI,
  modelloAttivo,
  schemaSceltaModello,
  versoModello,
} from '../../contratto/modelli.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { registraStorico } from '../template/rotte.js';

/**
 * Modello e provider (RF-D-02/03), il primo pezzo della Fase 6 portato dal
 * backend: il catalogo e il modello attivo — che È quello del motore
 * (`MODELLO_MOTORE`, oggi Claude Opus 5 per chat e tabelle), non una
 * preferenza salvata da qualche parte che il worker ignora.
 *
 * La scelta (PUT) tiene il contratto del mock: 404 sull'ignoto, 409
 * NON_DISPONIBILE su ciò che non si può ancora selezionare. Finché la
 * scelta per agenzia non è cablata fino al job, l'unico disponibile è il
 * modello configurato: confermarlo è idempotente e lascia la voce nello
 * storico; tutto il resto risponde con un motivo leggibile invece di
 * fingere un cambio che non avverrebbe.
 */
export function registraRotteModelli(app: FastifyInstance): void {
  /** RF-D-03: i modelli offerti dalla piattaforma, disponibili e non. */
  app.get('/api/modelli', () => CATALOGO_MODELLI.map(versoModello));

  app.get('/api/modelli/attivo', () => versoModello(modelloAttivo(configurazione().MODELLO_MOTORE)));

  /** RF-D-02: la scelta vale per tutto il tenant. Solo amministratore. */
  app.put('/api/modelli/attivo', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaSceltaModello.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Indica il modello da attivare.');

    const modello = CATALOGO_MODELLI.find((m) => m.id === esito.data.modelloId);
    if (!modello) throw ErroreApi.nonTrovato('Modello inesistente.');
    if (!modello.disponibile) {
      throw ErroreApi.conflitto(
        'NON_DISPONIBILE',
        `${modello.nome} non è ancora disponibile sulla piattaforma.`,
      );
    }

    await conIdentita(poolDb(), richiesta.identita, (client) =>
      registraStorico(
        client,
        richiesta.identita,
        'modifica',
        'modello',
        `Scelto il modello ${modello.nome} (${modello.provider})`,
      ),
    );
    return versoModello(modello);
  });
}
