import type pg from 'pg';

import type { RicordoAppreso } from '../../contratto/conversazioni.js';
import { improntaRicordo } from '../../contratto/memoria.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import { emettiEvento } from '../eventi.js';
import type { EstrattoreRicordi, ScambioConversazione } from './estrattore.js';
import { ambitoEffettivo, valutaPerimetro } from './perimetro.js';

/**
 * L'apprendimento durante la conversazione (RF-G-01): il gestore della chat
 * lo chiama appena ha persistito la risposta, prima del `fine`, così
 * l'utente vede «Cerco qualcosa da ricordare» e poi ciò che è stato imparato.
 * Si leggono gli scambi non ancora appresi, si chiedono al motore (lo
 * stesso della chat, col modello del tenant) i candidati, si applica il
 * perimetro (RF-G-05), si scartano i doppioni e si persiste ciò che resta
 * col collegamento alla conversazione d'origine. Il worker è l'unico
 * scrivano: il modello propone, non scrive.
 *
 * Idempotente: `appresa_fino_a` avanza solo quando si impara, e un secondo
 * giro sugli stessi scambi trova zero scambi nuovi e non chiama il motore.
 * Esiste anche come job `memoria` a sé (per rilavorare una conversazione a
 * mano): stessa funzione, ingresso diverso.
 */

export interface DipendenzeMemoria {
  estrattore: EstrattoreRicordi;
}

export interface EsitoApprendimento {
  appresi: RicordoAppreso[];
  candidati: number;
}

interface RigaConversazione {
  id: string;
  tenant_id: string;
  autore_id: string;
  appresa_fino_a: string | null;
  memoria_attiva: boolean;
  /** RF-D-02: lo stesso modello della chat, scelto dal tenant. */
  modello_motore: string | null;
}

interface RigaMessaggio extends ScambioConversazione {
  /** Come testo: un Date di JS perderebbe i microsecondi di Postgres e l'ultima risposta resterebbe «nuova». */
  inviato_il: string;
}

const NIENTE: EsitoApprendimento = { appresi: [], candidati: 0 };

/**
 * Impara dagli scambi nuovi della conversazione. Gli eventi (scarti col
 * motivo, ricordi appresi) vanno sul job passato: quello della chat, o
 * quello di memoria.
 */
export async function apprendi(
  db: pg.Pool,
  estrattore: EstrattoreRicordi,
  conversazioneId: string,
  jobId: string,
): Promise<EsitoApprendimento> {
  const conv = await db.query<RigaConversazione>(
    `select c.id, c.tenant_id, c.autore_id, ap.appresa_fino_a::text as appresa_fino_a, t.memoria_attiva, t.modello_motore
     from velia.conversazioni c
     join velia.tenant t on t.id = c.tenant_id
     left join velia.apprendimenti ap on ap.conversazione_id = c.id
     where c.id = $1`,
    [conversazioneId],
  );
  const conversazione = conv.rows[0];
  /* Conversazione cancellata nel frattempo, o memoria spenta per il tenant: niente. */
  if (!conversazione?.memoria_attiva) return NIENTE;

  const scambi = await db.query<RigaMessaggio>(
    `select autore, testo, inviato_il::text as inviato_il from velia.messaggi
     where conversazione_id = $1 and inviato_il > coalesce($2::timestamptz, '-infinity'::timestamptz)
     order by inviato_il`,
    [conversazioneId, conversazione.appresa_fino_a],
  );
  /* Senza una risposta non c'è nulla da imparare, e il cursore NON avanza:
     la domanda resta nel contesto del giro che seguirà la risposta. */
  const ultimo = scambi.rows.at(-1);
  if (!ultimo || !scambi.rows.some((s) => s.autore === 'assistente')) return NIENTE;

  const noti = await db.query<{ testo: string; impronta: string }>(
    `select testo, impronta from velia.ricordi
     where tenant_id = $1 and (ambito = 'tenant' or utente_id = $2)
     order by created_at`,
    [conversazione.tenant_id, conversazione.autore_id],
  );
  const impronteNote = new Set(noti.rows.map((r) => r.impronta));

  const esito = await estrattore.estrai(
    scambi.rows.map(({ autore, testo }) => ({ autore, testo })),
    noti.rows.map((r) => r.testo),
    { ...(conversazione.modello_motore && { modello: conversazione.modello_motore }) },
  );
  await db.query(
    `insert into velia.consumi
       (tenant_id, job_id, origine, modello, token_input, token_output,
        token_cache_lettura, token_cache_scrittura, costo_usd)
     values ($1, $2, 'app', $3, $4, $5, $6, $7, $8)`,
    [
      conversazione.tenant_id,
      jobId,
      esito.modello,
      esito.token.input,
      esito.token.output,
      esito.token.cacheLettura,
      esito.token.cacheScrittura,
      esito.costoUsd,
    ],
  );

  const appresi: RicordoAppreso[] = [];
  for (const candidato of esito.candidati) {
    const verifica = valutaPerimetro(candidato);
    if (verifica.esito === 'scartato') {
      /* Il motivo si racconta, il testo no: non deve restare da nessuna parte. */
      await emettiEvento(db, jobId, 'candidato-scartato', { motivo: verifica.motivo, categoria: candidato.categoria });
      continue;
    }
    const impronta = improntaRicordo(candidato.testo);
    if (impronteNote.has(impronta)) {
      await emettiEvento(db, jobId, 'candidato-scartato', { motivo: 'già noto', categoria: candidato.categoria });
      continue;
    }
    const ambito = ambitoEffettivo(candidato);
    const testo = candidato.testo.trim();
    const inserito = await db.query<{ id: string }>(
      `insert into velia.ricordi
         (tenant_id, testo, impronta, ambito, utente_id, categoria, origine_conversazione_id)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        conversazione.tenant_id,
        testo,
        impronta,
        ambito,
        ambito === 'personale' ? conversazione.autore_id : null,
        candidato.categoria,
        conversazioneId,
      ],
    );
    impronteNote.add(impronta);
    const ricordo: RicordoAppreso = { id: inserito.rows[0]!.id, testo, categoria: candidato.categoria, ambito };
    appresi.push(ricordo);
    await emettiEvento(db, jobId, 'ricordo-appreso', { ricordoId: ricordo.id, categoria: ricordo.categoria, ambito });
  }

  await db.query(
    `insert into velia.apprendimenti (conversazione_id, appresa_fino_a)
     values ($1, $2::timestamptz)
     on conflict (conversazione_id) do update set appresa_fino_a = excluded.appresa_fino_a`,
    [conversazioneId, ultimo.inviato_il],
  );
  return { appresi, candidati: esito.candidati.length };
}

/** Il job `memoria` a sé: la stessa funzione, con i propri eventi `inizio`/`fine`. */
export function creaGestoreMemoria(dip: DipendenzeMemoria) {
  return async function gestisciMemoria(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const conversazioneId = job.payload['conversazioneId'];
    if (typeof conversazioneId !== 'string' || !conversazioneId) {
      throw new ErroreNonRitentabile('payload del job senza conversazioneId');
    }
    await emettiEvento(db, job.id, 'inizio', { conversazioneId });
    const esito = await apprendi(db, dip.estrattore, conversazioneId, job.id);
    await emettiEvento(db, job.id, 'fine', { appresi: esito.appresi.length, candidati: esito.candidati });
  };
}
