import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import type {
  ClasseModello,
  MovimentoCrediti,
  OperazioneCrediti,
  RiepilogoCrediti,
} from '../../contratto/crediti.js';
import { ErroreApi } from '../../contratto/errori.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { saldoCrediti } from '../../worker/crediti.js';

/**
 * I crediti visti dal tenant: saldo, listino dei pesi, consumo del mese e
 * registro dei movimenti. Nessuna scrittura dal client: i pacchetti li
 * accredita il gestore (a mano, poi Stripe) e gli addebiti li fa il worker.
 *
 * Il blocco a credito esaurito (`richiediCrediti`) sta alle porte delle
 * operazioni AI: chat, tabelle, agenti. Un job già partito si completa.
 */

interface RigaMovimento {
  id: string;
  tipo: MovimentoCrediti['tipo'];
  crediti: number;
  operazione: OperazioneCrediti | null;
  modello: string | null;
  token_input: string | null;
  token_output: string | null;
  costo_usd: string | null;
  token_stimati: boolean;
  descrizione: string;
  created_at: Date;
}

export function registraRotteCrediti(app: FastifyInstance): void {
  app.get('/api/crediti', async (richiesta) => {
    const { tenantId } = richiesta.identita;
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<RiepilogoCrediti> => {
      const saldo = await saldoCrediti(client, tenantId);
      const pesi = await client.query<{ classe: string; crediti: number }>(`select classe, crediti from velia.crediti_pesi`);
      const mese = await client.query<{ operazione: OperazioneCrediti; crediti: string }>(
        `select operazione, sum(-crediti) as crediti from velia.crediti_movimenti
         where tenant_id = $1 and tipo = 'addebito'
           and date_trunc('month', created_at at time zone 'Europe/Rome') = date_trunc('month', now() at time zone 'Europe/Rome')
         group by operazione`,
        [tenantId],
      );
      const movimenti = await client.query<RigaMovimento>(
        `select id, tipo, crediti, operazione, modello, token_input, token_output, costo_usd, token_stimati, descrizione, created_at
         from velia.crediti_movimenti where tenant_id = $1
         order by created_at desc, id limit 100`,
        [tenantId],
      );

      const listino = { opus: 0, sonnet: 0, haiku: 0, open: 0, conversione: 0, perUsd: 0 } as Record<ClasseModello | 'conversione' | 'perUsd', number>;
      for (const p of pesi.rows) {
        const chiave = p.classe === 'per_usd' ? 'perUsd' : p.classe;
        if (chiave in listino) listino[chiave as keyof typeof listino] = p.crediti;
      }
      const meseCorrente = { risposta: 0, tabella: 0, agente: 0, conversione: 0 } as Record<OperazioneCrediti, number>;
      for (const m of mese.rows) if (m.operazione) meseCorrente[m.operazione] = Math.round(Number(m.crediti) * 10) / 10;

      return {
        saldo: {
          inclusi: saldo.inclusi,
          inclusiUsati: saldo.inclusi_usati,
          acquistati: saldo.acquistati,
          acquistatiUsati: saldo.acquistati_usati,
          disponibili: saldo.disponibili,
        },
        pesi: listino,
        meseCorrente,
        movimenti: movimenti.rows.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          crediti: Number(m.crediti),
          ...(m.operazione && { operazione: m.operazione }),
          ...(m.modello && { modello: m.modello }),
          ...(m.token_input !== null && { tokenInput: Number(m.token_input) }),
          ...(m.token_output !== null && { tokenOutput: Number(m.token_output) }),
          ...(m.costo_usd !== null && { costoUsd: Number(m.costo_usd) }),
          ...(m.token_stimati && { tokenStimati: true }),
          descrizione: m.descrizione,
          istante: m.created_at.toISOString(),
        })),
      };
    });
  });
}

/**
 * Alle porte di un'operazione AI: senza crediti non si parte. Il messaggio
 * dice cosa fare; il codice permette al FE di distinguere dal 429 di
 * frequenza degli agenti.
 */
export async function richiediCrediti(db: pg.Pool | pg.ClientBase, tenantId: string): Promise<void> {
  const saldo = await saldoCrediti(db, tenantId);
  if (saldo.disponibili <= 0) {
    throw new ErroreApi(
      429,
      'CREDITI_ESAURITI',
      'I crediti dell’agenzia sono esauriti: ricarica un pacchetto dalle Impostazioni, oppure attendi il rinnovo del canone.',
    );
  }
}
