import type { FastifyInstance } from 'fastify';

import { configurazione } from '../../config.js';
import { ErroreApi } from '../../contratto/errori.js';
import {
  catalogoLivelli,
  livelloAttivo,
  modelloDelTenant,
  schemaSceltaModello,
  versoPubblico,
  type Livello,
} from '../../contratto/modelli.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { registraStorico } from '../template/rotte.js';

/**
 * Modello e provider (RF-D-02/03): i livelli e quello attivo, che È il
 * livello con cui il tenant lavora davvero: la sua scelta se c'è ancora
 * (`velia.tenant.modello_motore`, letta dal worker a ogni job), altrimenti
 * il default di piattaforma (`MODELLO_MOTORE`).
 *
 * La scelta si scrive con la connessione di sistema dopo la guardia da
 * amministratore: la riga di tenant porta i limiti di piano, e una policy
 * di update la consegnerebbe a chiunque via PostgREST.
 */
/**
 * RF-D-03: i livelli come stanno su questa piattaforma. Uno servito da un
 * fornitore terzo si sceglie solo con la sua chiave in .env: vale per la
 * scelta del tenant e per quella fatta in chat per un messaggio.
 */
export function livelliDellaPiattaforma(): Livello[] {
  const c = configurazione();
  return catalogoLivelli({
    hostyourai: Boolean(c.HOSTYOURAI_API_KEY),
    aki: Boolean(c.AKI_API_KEY),
    deepseek: Boolean(c.DEEPSEEK_API_KEY),
    mistral: Boolean(c.MISTRAL_API_KEY),
    gemini: Boolean(c.GEMINI_API_KEY),
  });
}

export function registraRotteModelli(app: FastifyInstance): void {
  const catalogo = livelliDellaPiattaforma;

  app.get('/api/modelli', () => catalogo().map(versoPubblico));

  app.get('/api/modelli/attivo', async (richiesta) => {
    const scelta = modelloDelTenant(await sceltaDelTenant(richiesta.identita.tenantId));
    return versoPubblico(livelloAttivo(scelta ?? configurazione().MODELLO_MOTORE, catalogo()));
  });

  /** RF-D-02: la scelta vale per tutto il tenant. Solo amministratore. */
  app.put('/api/modelli/attivo', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaSceltaModello.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Indica il livello da attivare.');

    const livello = catalogo().find((l) => l.id === esito.data.modelloId);
    if (!livello) throw ErroreApi.nonTrovato('Livello inesistente.');
    if (!livello.disponibile) {
      throw ErroreApi.conflitto('NON_DISPONIBILE', `Il livello ${livello.nome} non è ancora disponibile sulla piattaforma.`);
    }

    await poolDb().query(`update velia.tenant set modello_motore = $2 where id = $1`, [
      richiesta.identita.tenantId,
      livello.sdk,
    ]);
    await conIdentita(poolDb(), richiesta.identita, (client) =>
      registraStorico(client, richiesta.identita, 'modifica', 'modello', `Scelto il livello ${livello.nome}`),
    );
    return versoPubblico(livello);
  });
}

async function sceltaDelTenant(tenantId: string): Promise<string | undefined> {
  const r = await poolDb().query<{ modello_motore: string | null }>(
    `select modello_motore from velia.tenant where id = $1`,
    [tenantId],
  );
  return r.rows[0]?.modello_motore ?? undefined;
}
