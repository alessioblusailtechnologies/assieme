import type pg from 'pg';

import { improntaRicordo } from '../../contratto/memoria.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import { emettiEvento } from '../eventi.js';
import type { EstrattoreRicordi, ScambioConversazione } from './estrattore.js';
import { ambitoEffettivo, valutaPerimetro } from './perimetro.js';

/**
 * Il job `memoria` — l'apprendimento a fine conversazione (RF-G-01):
 * il tick di pg_cron lo accoda quando una conversazione è ferma da un po';
 * qui si leggono gli scambi non ancora appresi, si chiede al modello
 * economico i candidati, si applica il perimetro (RF-G-05) e si scartano i
 * doppioni, e si persiste ciò che resta col collegamento alla conversazione
 * d'origine. Il worker è l'unico scrivano: il modello propone, non scrive.
 *
 * Idempotente: `appresa_fino_a` avanza alla fine, e un doppio arrivo trova
 * zero scambi nuovi. Il modello non è mai chiamato due volte sugli stessi
 * scambi salvo fallimento a metà — e allora l'impronta ferma i doppioni.
 */

export interface DipendenzeMemoria {
  estrattore: EstrattoreRicordi;
}

interface RigaConversazione {
  id: string;
  tenant_id: string;
  autore_id: string;
  appresa_fino_a: string | null;
  memoria_attiva: boolean;
}

interface RigaMessaggio extends ScambioConversazione {
  /** Come testo: un Date di JS perderebbe i microsecondi di Postgres e l'ultima risposta resterebbe «nuova». */
  inviato_il: string;
}

export function creaGestoreMemoria(dip: DipendenzeMemoria) {
  return async function gestisciMemoria(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const conversazioneId = job.payload['conversazioneId'];
    if (typeof conversazioneId !== 'string' || !conversazioneId) {
      throw new ErroreNonRitentabile('payload del job senza conversazioneId');
    }

    const conv = await db.query<RigaConversazione>(
      `select c.id, c.tenant_id, c.autore_id, ap.appresa_fino_a::text as appresa_fino_a, t.memoria_attiva
       from velia.conversazioni c
       join velia.tenant t on t.id = c.tenant_id
       left join velia.apprendimenti ap on ap.conversazione_id = c.id
       where c.id = $1`,
      [conversazioneId],
    );
    const conversazione = conv.rows[0];
    /* Conversazione cancellata nel frattempo: niente da imparare, il job si chiude. */
    if (!conversazione) return;

    const chiudi = async (finoA: string | null): Promise<void> => {
      await db.query(
        `insert into velia.apprendimenti (conversazione_id, appresa_fino_a, accodato_il)
         values ($1, $2::timestamptz, null)
         on conflict (conversazione_id) do update
           set accodato_il = null,
               appresa_fino_a = coalesce(excluded.appresa_fino_a, velia.apprendimenti.appresa_fino_a)`,
        [conversazioneId, finoA],
      );
    };

    if (!conversazione.memoria_attiva) {
      await chiudi(null);
      return;
    }

    const scambi = await db.query<RigaMessaggio>(
      `select autore, testo, inviato_il::text as inviato_il from velia.messaggi
       where conversazione_id = $1 and inviato_il > coalesce($2::timestamptz, '-infinity'::timestamptz)
       order by inviato_il`,
      [conversazioneId, conversazione.appresa_fino_a],
    );
    const ultimo = scambi.rows.at(-1);
    if (!ultimo || !scambi.rows.some((s) => s.autore === 'assistente')) {
      await chiudi(ultimo?.inviato_il ?? null);
      return;
    }

    await emettiEvento(db, job.id, 'inizio', { conversazioneId, scambi: scambi.rows.length });

    const noti = await db.query<{ testo: string; impronta: string }>(
      `select testo, impronta from velia.ricordi
       where tenant_id = $1 and (ambito = 'tenant' or utente_id = $2)
       order by created_at`,
      [conversazione.tenant_id, conversazione.autore_id],
    );
    const impronteNote = new Set(noti.rows.map((r) => r.impronta));

    const esito = await dip.estrattore.estrai(
      scambi.rows.map(({ autore, testo }) => ({ autore, testo })),
      noti.rows.map((r) => r.testo),
    );
    await db.query(
      `insert into velia.consumi (tenant_id, job_id, origine, modello, token_input, token_output, costo_usd)
       values ($1, $2, 'app', $3, $4, $5, $6)`,
      [conversazione.tenant_id, job.id, esito.modello, esito.token.input, esito.token.output, esito.costoUsd],
    );

    let appresi = 0;
    for (const candidato of esito.candidati) {
      const verifica = valutaPerimetro(candidato);
      if (verifica.esito === 'scartato') {
        /* Il motivo si racconta, il testo no: non deve restare da nessuna parte. */
        await emettiEvento(db, job.id, 'candidato-scartato', { motivo: verifica.motivo, categoria: candidato.categoria });
        continue;
      }
      const impronta = improntaRicordo(candidato.testo);
      if (impronteNote.has(impronta)) {
        await emettiEvento(db, job.id, 'candidato-scartato', { motivo: 'già noto', categoria: candidato.categoria });
        continue;
      }
      const ambito = ambitoEffettivo(candidato);
      const inserito = await db.query<{ id: string }>(
        `insert into velia.ricordi
           (tenant_id, testo, impronta, ambito, utente_id, categoria, origine_conversazione_id)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [
          conversazione.tenant_id,
          candidato.testo.trim(),
          impronta,
          ambito,
          ambito === 'personale' ? conversazione.autore_id : null,
          candidato.categoria,
          conversazioneId,
        ],
      );
      impronteNote.add(impronta);
      appresi += 1;
      await emettiEvento(db, job.id, 'ricordo-appreso', {
        ricordoId: inserito.rows[0]!.id,
        categoria: candidato.categoria,
        ambito,
      });
    }

    await chiudi(ultimo.inviato_il);
    await emettiEvento(db, job.id, 'fine', { appresi, candidati: esito.candidati.length });
  };
}
