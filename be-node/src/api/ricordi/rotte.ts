import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import type { Citazione } from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import { improntaRicordo, schemaModificheRicordo, type Ricordo } from '../../contratto/memoria.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import {
  costruisciGrafoMemoria,
  type CitazioniDiConversazione,
  type ConversazionePerGrafo,
  type DocumentoCatalogo,
  type DocumentoPerGrafo,
} from './grafo.js';

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
   * Il globo della memoria: ricordi, conversazioni d'origine, passaggi
   * citati (le ancore `[pag. N]`), documenti e compagnie, come nodi e
   * legami. Quattro letture sotto la stessa identità — la RLS decide cosa
   * entra nel globo, esattamente come decide cosa entra negli elenchi —
   * e l'assemblaggio è una funzione pura (`grafo.ts`).
   */
  app.get('/api/ricordi/grafo', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const tenantId = richiesta.identita.tenantId;

      const ricordi = (
        await client.query<RigaRicordo>(
          `select ${COLONNE} from velia.ricordi where tenant_id = $1`,
          [tenantId],
        )
      ).rows.map(versoRicordo);

      /* Le conversazioni recenti bastano al lavoro vivo; quelle d'origine
         dei ricordi si ripescano per id, così un ricordo vecchio non resta
         mai senza il suo ponte. */
      const recenti = await client.query<ConversazionePerGrafo>(
        `select id, titolo from velia.conversazioni
          where tenant_id = $1 order by updated_at desc limit 400`,
        [tenantId],
      );
      const conversazioni = new Map(recenti.rows.map((c) => [c.id, c]));
      const origini = [
        ...new Set(
          ricordi.flatMap((r) =>
            r.origineConversazioneId && !conversazioni.has(r.origineConversazioneId)
              ? [r.origineConversazioneId]
              : [],
          ),
        ),
      ];
      if (origini.length) {
        const riprese = await client.query<ConversazionePerGrafo>(
          `select id, titolo from velia.conversazioni
            where tenant_id = $1 and id = any($2::uuid[])`,
          [tenantId, origini],
        );
        for (const c of riprese.rows) conversazioni.set(c.id, c);
      }

      const idConversazioni = [...conversazioni.keys()];
      const citazioniPerConversazione: CitazioniDiConversazione[] = idConversazioni.length
        ? (
            await client.query<{ conversazione_id: string; citazioni: Citazione[] }>(
              `select conversazione_id, citazioni from velia.messaggi
                where tenant_id = $1 and conversazione_id = any($2::uuid[])
                  and jsonb_array_length(citazioni) > 0`,
              [tenantId, idConversazioni],
            )
          ).rows.map((m) => ({ conversazioneId: m.conversazione_id, citazioni: m.citazioni }))
        : [];

      const idDocumenti = [
        ...new Set(
          citazioniPerConversazione.flatMap((m) => m.citazioni.map((c) => c.documentoId)),
        ),
      ];
      const documenti: DocumentoPerGrafo[] = idDocumenti.length
        ? (
            await client.query<{
              id: string;
              titolo: string;
              compagnia_id: string | null;
              compagnia_nome: string | null;
            }>(
              `select d.id, d.titolo, d.compagnia_id, c.nome as compagnia_nome
                 from velia.documenti d
                 left join velia.compagnie c on c.id = d.compagnia_id
                where d.id = any($1::text[])`,
              [idDocumenti],
            )
          ).rows.map((d) => ({
            id: d.id,
            titolo: d.titolo,
            ...(d.compagnia_id && { compagniaId: d.compagnia_id }),
            ...(d.compagnia_nome && { compagniaNome: d.compagnia_nome }),
          }))
        : [];

      /* La trama del globo: le edizioni correnti del catalogo pubblico,
         con compagnia e ramo per i cluster. */
      const catalogo: DocumentoCatalogo[] = (
        await client.query<{
          id: string;
          titolo: string;
          prodotto: string;
          compagnia_id: string;
          compagnia_nome: string;
          ramo_id: string;
          ramo_nome: string;
        }>(
          `select d.id, d.titolo, d.prodotto, d.compagnia_id,
                  c.nome as compagnia_nome, d.ramo_id, r.nome as ramo_nome
             from velia.documenti d
             join velia.compagnie c on c.id = d.compagnia_id
             join velia.rami r on r.id = d.ramo_id
            where d.archivio = 'pubblico' and d.edizione_corrente
              and d.prodotto is not null and d.stato = 'pronto'`,
        )
      ).rows.map((d) => ({
        id: d.id,
        titolo: d.titolo,
        prodotto: d.prodotto,
        compagniaId: d.compagnia_id,
        compagniaNome: d.compagnia_nome,
        ramoId: d.ramo_id,
        ramoNome: d.ramo_nome,
      }));

      return costruisciGrafoMemoria(
        ricordi,
        [...conversazioni.values()],
        citazioniPerConversazione,
        documenti,
        catalogo,
      );
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
