import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import { ErroreApi } from '../../contratto/errori.js';
import { improntaRicordo, schemaModificheRicordo, type Ricordo } from '../../contratto/memoria.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';

/**
 * La memoria vista dal pannello (RF-G-03): ciò che il sistema ha imparato,
 * consultabile, modificabile e cancellabile ricordo per ricordo.
 *
 * La separazione degli ambiti la fa il server (RF-G-02): la RLS restituisce
 * i ricordi del tenant più i personali dell'utente corrente, mai quelli dei
 * colleghi — nessun parametro dal client. Niente POST: un ricordo nasce solo
 * dal job di apprendimento (RF-G-01).
 */

interface RigaRicordo {
  id: string;
  testo: string;
  ambito: Ricordo['ambito'];
  categoria: Ricordo['categoria'];
  origine_conversazione_id: string | null;
  created_at: Date;
  updated_at: Date;
  attivo: boolean;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLONNE = 'id, testo, ambito, categoria, origine_conversazione_id, created_at, updated_at, attivo';

export function registraRotteRicordi(app: FastifyInstance): void {
  /** Il più recente in cima, come nel mock. */
  app.get('/api/ricordi', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<RigaRicordo>(
        `select ${COLONNE} from velia.ricordi where tenant_id = $1 order by updated_at desc, id`,
        [richiesta.identita.tenantId],
      );
      return r.rows.map(versoRicordo);
    });
  });

  /**
   * Correzione, categoria, sospensione, spostamento d'ambito. Da personale a
   * tenant il ricordo si condivide; al contrario diventa di chi lo sposta.
   */
  app.patch<{ Params: { id: string } }>('/api/ricordi/:id', async (richiesta) => {
    const esito = schemaModificheRicordo.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al ricordo non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await ricordoPerId(client, richiesta.identita.tenantId, richiesta.params.id);

      const assegnazioni: string[] = ['updated_at = now()'];
      const parametri: unknown[] = [esistente.id, richiesta.identita.tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      if (m.testo !== undefined) {
        assegnazioni.push(`testo = ${par(m.testo)}`, `impronta = ${par(improntaRicordo(m.testo))}`);
      }
      if (m.ambito !== undefined) {
        assegnazioni.push(
          `ambito = ${par(m.ambito)}`,
          `utente_id = ${par(m.ambito === 'personale' ? richiesta.identita.utenteId : null)}::uuid`,
        );
      }
      if (m.categoria !== undefined) assegnazioni.push(`categoria = ${par(m.categoria)}`);
      if (m.attivo !== undefined) assegnazioni.push(`attivo = ${par(m.attivo)}`);

      const r = await client.query<RigaRicordo>(
        `update velia.ricordi set ${assegnazioni.join(', ')}
         where id = $1 and tenant_id = $2 returning ${COLONNE}`,
        parametri,
      );
      if (!r.rows[0]) throw ErroreApi.nonTrovato('Ricordo inesistente.');
      return versoRicordo(r.rows[0]);
    });
  });

  /** Cancellazione effettiva (RF-G-05): il ricordo sparisce e non condiziona più nulla. */
  app.delete<{ Params: { id: string } }>('/api/ricordi/:id', async (richiesta, risposta) => {
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await ricordoPerId(client, richiesta.identita.tenantId, richiesta.params.id);
      await client.query(`delete from velia.ricordi where id = $1 and tenant_id = $2`, [
        esistente.id,
        richiesta.identita.tenantId,
      ]);
    });
    return risposta.code(204).send();
  });
}

function versoRicordo(r: RigaRicordo): Ricordo {
  return {
    id: r.id,
    testo: r.testo,
    ambito: r.ambito,
    categoria: r.categoria,
    ...(r.origine_conversazione_id && { origineConversazioneId: r.origine_conversazione_id }),
    creatoIl: r.created_at.toISOString(),
    aggiornatoIl: r.updated_at.toISOString(),
    attivo: r.attivo,
  };
}

/** Con la RLS in sessione, «non visibile» e «inesistente» sono lo stesso 404. */
async function ricordoPerId(client: pg.ClientBase, tenantId: string, id: string): Promise<RigaRicordo> {
  const nonTrovato = ErroreApi.nonTrovato('Ricordo inesistente.');
  if (!E_UUID.test(id)) throw nonTrovato;
  const r = await client.query<RigaRicordo>(
    `select ${COLONNE} from velia.ricordi where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
  if (!r.rows[0]) throw nonTrovato;
  return r.rows[0];
}
