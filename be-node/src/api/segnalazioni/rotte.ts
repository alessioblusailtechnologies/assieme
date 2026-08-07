import type { FastifyInstance } from 'fastify';

import { ErroreApi } from '../../contratto/errori.js';
import { schemaNuovaSegnalazione, type Segnalazione } from '../../contratto/segnalazioni.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';

export function registraRotteSegnalazioni(app: FastifyInstance): void {
  /**
   * RF-A-08: documento mancante, obsoleto o errato — l'utente lo dice al
   * gestore della piattaforma. La RLS pretende che tenant e utente della
   * riga siano quelli del JWT: segnalare a nome d'altri non è un divieto
   * applicativo, è una riga che il database non lascia scrivere.
   */
  app.post('/api/segnalazioni', async (richiesta, risposta) => {
    const esito = schemaNuovaSegnalazione.safeParse(richiesta.body);
    if (!esito.success) {
      throw ErroreApi.datiNonValidi('Segnalazione non valida: servono un tipo e un messaggio.');
    }
    const { tipo, messaggio, documentoId } = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<Segnalazione> => {
      // Il riferimento passa dalla lettura di catalogo (RLS): se l'utente
      // non può vedere il documento, non può nemmeno segnalarlo.
      if (documentoId) {
        const doc = await client.query(
          `select 1 from velia.documenti where archivio = 'pubblico' and id = $1`,
          [documentoId],
        );
        if (!doc.rowCount) throw ErroreApi.nonTrovato('Documento inesistente.');
      }

      const r = await client.query<{ id: string; creata_il: Date }>(
        `insert into velia.segnalazioni (tenant_id, utente_id, documento_id, tipo, messaggio)
         values ($1, $2, $3, $4, $5)
         returning id, creata_il`,
        [
          richiesta.identita.tenantId,
          richiesta.identita.utenteId,
          documentoId ?? null,
          tipo,
          messaggio,
        ],
      );
      const riga = r.rows[0]!;

      void risposta.code(201);
      return {
        id: riga.id,
        tipo,
        messaggio,
        ...(documentoId && { documentoId }),
        creataIl: riga.creata_il.toISOString(),
      };
    });
  });
}
