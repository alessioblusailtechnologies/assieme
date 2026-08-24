import type { FastifyInstance } from 'fastify';

import { configurazione } from '../../config.js';
import { ErroreApi } from '../../contratto/errori.js';
import {
  catalogoModelli,
  modelloAttivo,
  schemaSceltaModello,
  versoModello,
} from '../../contratto/modelli.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { registraStorico } from '../template/rotte.js';

/**
 * Modello e provider (RF-D-02/03): il catalogo e il modello attivo — che È
 * quello con cui il tenant lavora davvero: la sua scelta se c'è
 * (`velia.tenant.modello_motore`, letta dal worker a ogni job), altrimenti
 * il default di piattaforma (`MODELLO_MOTORE`).
 *
 * La scelta si scrive con la connessione di sistema dopo la guardia da
 * amministratore: la riga di tenant porta i limiti di piano, e una policy
 * di update la consegnerebbe a chiunque via PostgREST.
 */
export function registraRotteModelli(app: FastifyInstance): void {
  /** RF-D-03: i modelli offerti dalla piattaforma, disponibili e non. */
  /** Le voci HostYourAI (RF-D-03) sono selezionabili solo con la chiave in .env: il catalogo dice la verità. */
  const catalogo = () => catalogoModelli({ hostyourai: Boolean(configurazione().HOSTYOURAI_API_KEY) });

  app.get('/api/modelli', () => catalogo().map(versoModello));

  app.get('/api/modelli/attivo', async (richiesta) => {
    const scelta = await sceltaDelTenant(richiesta.identita.tenantId);
    return versoModello(modelloAttivo(scelta ?? configurazione().MODELLO_MOTORE));
  });

  /** RF-D-02: la scelta vale per tutto il tenant. Solo amministratore. */
  app.put('/api/modelli/attivo', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaSceltaModello.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Indica il modello da attivare.');

    const modello = catalogo().find((m) => m.id === esito.data.modelloId);
    if (!modello) throw ErroreApi.nonTrovato('Modello inesistente.');
    if (!modello.disponibile || !modello.sdk) {
      throw ErroreApi.conflitto(
        'NON_DISPONIBILE',
        modello.fornitore === 'hostyourai'
          ? `${modello.nome} richiede la chiave HostYourAI della piattaforma, non ancora configurata.`
          : `${modello.nome} non è ancora disponibile sulla piattaforma.`,
      );
    }

    await poolDb().query(`update velia.tenant set modello_motore = $2 where id = $1`, [
      richiesta.identita.tenantId,
      modello.sdk,
    ]);
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

async function sceltaDelTenant(tenantId: string): Promise<string | undefined> {
  const r = await poolDb().query<{ modello_motore: string | null }>(
    `select modello_motore from velia.tenant where id = $1`,
    [tenantId],
  );
  return r.rows[0]?.modello_motore ?? undefined;
}
