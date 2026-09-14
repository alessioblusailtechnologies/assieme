import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { documentiDeiRiferimenti, idrataRiferimenti } from '../../agenti/riferimenti.js';
import {
  testoLeggibile,
  type PianoAgente,
  type RigaLog,
  type RiferimentoRichiesta,
  type StatoPiano,
} from '../../contratto/agenti.js';
import type { Citazione, DestinatarioBozza, DocumentoGenerato } from '../../contratto/conversazioni.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';

/**
 * Il job `agente` (RF-E-02…E-13).
 *
 * Dal 14/09/2026 (fase 4 di PIANO-AGENTI.md) un'esecuzione è una
 * conversazione. Il worker ne apre una dell'agente, ci scrive come domanda
 * la richiesta coi riferimenti risolti adesso e il piano confermato, e la
 * fa lavorare dallo **stesso turno della chat**: archivi e clienti, file in
 * qualsiasi formato, sandbox, citazioni validate; e le email, che partono
 * subito ma solo verso i destinatari del piano. La conversazione non sta
 * nello storico della chat: si apre dall'esecuzione e si prosegue da lì.
 *
 * L'esecuzione si racconta da sola (RF-E-06/11): il log dice che cosa è
 * successo, i tentativi si contano, il fallimento persistente arriva dopo
 * tre. Un tentativo ripetuto riprende la stessa conversazione, e un'email
 * già partita non riparte.
 */

export interface DipendenzeAgenti {
  /** Il turno della chat: l'agente non ha un motore suo. */
  interrogazione: (job: Job, strumenti: { db: pg.Pool }) => Promise<void>;
}

interface RigaLavoro {
  esecuzione_id: string;
  stato: string;
  modalita: 'manuale' | 'pianificata';
  log: RigaLog[];
  avviata_il: Date;
  conversazione_id: string | null;
  agente_id: string;
  tenant_id: string;
  nome: string;
  richiesta: string;
  piano: PianoAgente | null;
  piano_stato: StatoPiano;
  creato_da: string | null;
}

export interface DocumentoRisolto {
  id: string;
  titolo: string;
}

export function creaGestoreAgenti(dip: DipendenzeAgenti) {
  return async function gestisciAgente(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const esecuzioneId = job.payload['esecuzioneId'];
    if (typeof esecuzioneId !== 'string' || !esecuzioneId) {
      throw new ErroreNonRitentabile('payload del job senza esecuzioneId');
    }

    const r = await db.query<RigaLavoro>(
      `select e.id as esecuzione_id, e.stato, e.modalita, e.log, e.avviata_il, e.conversazione_id,
              a.id as agente_id, a.tenant_id, a.nome, a.richiesta, a.piano, a.piano_stato, a.creato_da
       from velia.agenti_esecuzioni e
       join velia.agenti a on a.id = e.agente_id
       where e.id = $1`,
      [esecuzioneId],
    );
    const lavoro = r.rows[0];
    if (!lavoro) return; // agente o esecuzione eliminati: job orfano
    if (lavoro.stato === 'completata' || lavoro.stato === 'fallita') return; // già assestata

    const log: RigaLog[] = [...lavoro.log];
    const annota = async (livello: RigaLog['livello'], messaggio: string): Promise<void> => {
      log.push({ istante: new Date().toISOString(), livello, messaggio });
      await db.query(`update velia.agenti_esecuzioni set log = $2 where id = $1`, [
        esecuzioneId,
        JSON.stringify(log),
      ]);
    };
    const nonAvviata = async (motivo: string, perLog: string): Promise<void> => {
      await annota('errore', perLog);
      await db.query(
        `update velia.agenti_esecuzioni set stato = 'fallita', conclusa_il = now(), errore = $2 where id = $1`,
        [esecuzioneId, motivo],
      );
    };

    /* Un piano non confermato non parte. API e tick lo impediscono già: qui
       arriva solo un'esecuzione accodata prima che la richiesta cambiasse. */
    if (lavoro.piano_stato !== 'confermato') {
      await nonAvviata(
        'Il piano dell’agente non è confermato: confermalo e riprova.',
        'Il piano dell’agente non è confermato: esecuzione non avviata.',
      );
      return;
    }

    /* Chi scrive la conversazione e firma le email: chi l'ha avviata a mano,
       o chi ha creato l'agente se è partita da sola. */
    const avviataDa = job.payload['utenteId'];
    const autore =
      lavoro.modalita === 'manuale' && typeof avviataDa === 'string' && avviataDa ? avviataDa : lavoro.creato_da;
    if (!autore) {
      await nonAvviata(
        'Chi aveva creato l’agente non è più nell’agenzia: duplica l’agente e conferma la copia.',
        'Nessuno a nome di cui lavorare: esecuzione non avviata.',
      );
      return;
    }

    try {
      await db.query(
        `update velia.agenti_esecuzioni set stato = 'in-corso', tentativi = $2 where id = $1`,
        [esecuzioneId, job.tentativi],
      );
      if (job.tentativi > 1) {
        await annota('avviso', `Nuovo tentativo (${job.tentativi} di 3).`);
      } else {
        await annota('info', await frasePartenza(db, lavoro, job));
      }

      const client = await db.connect();
      let riferimenti: RiferimentoRichiesta[];
      try {
        riferimenti = await idrataRiferimenti(client, lavoro.tenant_id, lavoro.richiesta);
      } finally {
        client.release();
      }
      const destinatari = destinatariDelPiano(lavoro.piano);

      /* La conversazione nasce al primo tentativo; i successivi la riprendono. */
      let conversazioneId = lavoro.conversazione_id;
      if (!conversazioneId) {
        const documenti = await documentiPronti(db, lavoro.tenant_id, documentiDeiRiferimenti(riferimenti));
        const clienti = riferimenti.filter((x) => x.tipo === 'cliente');
        const clienteId = clienti.length === 1 ? clienti[0]!.chiave : null;
        const c = await db.query<{ id: string }>(
          `insert into velia.conversazioni
             (tenant_id, autore_id, titolo, documenti_in_contesto, cliente_id, agente_id, condivisa)
           values ($1, $2, $3, $4, $5, $6, true)
           returning id`,
          [
            lavoro.tenant_id,
            autore,
            titoloConversazione(lavoro.nome, lavoro.avviata_il),
            documenti.map((d) => d.id),
            clienteId,
            lavoro.agente_id,
          ],
        );
        conversazioneId = c.rows[0]!.id;
        await db.query(
          `insert into velia.messaggi
             (conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati, cliente_id)
           values ($1, $2, 'utente', $3, $4, '{}', $5)`,
          [
            conversazioneId,
            lavoro.tenant_id,
            autore,
            messaggioDellEsecuzione({
              nome: lavoro.nome,
              modalita: lavoro.modalita,
              avviataIl: lavoro.avviata_il,
              richiesta: testoLeggibile(lavoro.richiesta, riferimenti),
              piano: lavoro.piano,
              destinatari,
            }),
            clienteId,
          ],
        );
        await db.query(`update velia.agenti_esecuzioni set conversazione_id = $2 where id = $1`, [
          esecuzioneId,
          conversazioneId,
        ]);
        await annota(
          'info',
          documenti.length
            ? `Aperta la conversazione dell’esecuzione, con ${documenti.length === 1 ? '1 documento' : `${documenti.length} documenti`} della richiesta.`
            : 'Aperta la conversazione dell’esecuzione: i documenti li cerca negli archivi.',
        );
      }

      const domanda = await db.query<{ id: string; testo: string }>(
        `select id, testo from velia.messaggi
          where conversazione_id = $1 and autore = 'utente'
          order by inviato_il, id limit 1`,
        [conversazioneId],
      );
      const messaggioUtente = domanda.rows[0];
      if (!messaggioUtente) throw new ErroreNonRitentabile('la conversazione dell’esecuzione non ha più la sua domanda');

      const messaggioAssistenteId = randomUUID();
      await annota('info', 'Il motore lavora sulla richiesta, come in chat.');
      await dip.interrogazione(
        {
          ...job,
          tipo: 'interrogazione',
          payload: {
            conversazioneId,
            messaggioUtenteId: messaggioUtente.id,
            messaggioAssistenteId,
            utenteId: autore,
            testo: messaggioUtente.testo,
            agente: { esecuzioneId, agenteId: lavoro.agente_id, nome: lavoro.nome, destinatari },
          },
        },
        { db },
      );

      const risposta = await db.query<{ testo: string; citazioni: Citazione[]; documenti: DocumentoGenerato[] }>(
        `select testo, citazioni, documenti from velia.messaggi where id = $1`,
        [messaggioAssistenteId],
      );
      const esito = risposta.rows[0];
      if (!esito) throw new ErroreNonRitentabile('il turno si è chiuso senza una risposta');

      for (const d of esito.documenti ?? []) {
        await annota('info', `File prodotto: «${d.nome}» (${d.formato.toUpperCase()}).`);
      }
      const inviate = await db.query<{ a: string; simulata: boolean }>(
        `select a, simulata from velia.email_inviate where esecuzione_id = $1 order by created_at`,
        [esecuzioneId],
      );
      for (const e of inviate.rows) {
        await annota('info', `Email inviata a ${e.a}${e.simulata ? ' (simulata)' : ''}.`);
      }
      if (destinatari.length && !inviate.rowCount) {
        await annota('avviso', 'Il piano prevedeva email, ma nessuna è partita: l’esito dice perché.');
      }
      await annota(
        'info',
        `Esito composto: ${esito.citazioni.length === 1 ? '1 citazione' : `${esito.citazioni.length} citazioni`}.`,
      );
      await db.query(
        `update velia.agenti_esecuzioni
         set stato = 'completata', conclusa_il = now(), output = $2, citazioni = $3, errore = null
         where id = $1`,
        [esecuzioneId, esito.testo, JSON.stringify(esito.citazioni)],
      );
    } catch (errore) {
      const definitivo = errore instanceof ErroreNonRitentabile || job.tentativi >= 3;
      /* Il turno della chat, quando si ferma, lo dice con un evento scritto
         per chi legge: si riusa quello, invece di inventarne un altro. */
      const detto = await ultimoErrore(db, job.id).catch(() => undefined);
      const messaggio =
        detto ??
        (errore instanceof ErroreNonRitentabile
          ? 'L’esecuzione si è interrotta.'
          : 'Il motore non ha risposto entro il tempo previsto.');
      await annota('errore', definitivo ? `${messaggio} Esecuzione interrotta.` : messaggio).catch(
        () => undefined,
      );
      if (definitivo) {
        await db
          .query(
            `update velia.agenti_esecuzioni
             set stato = 'fallita', conclusa_il = now(), errore = $2
             where id = $1 and stato in ('in-coda', 'in-corso')`,
            [
              esecuzioneId,
              job.tentativi >= 3 && !(errore instanceof ErroreNonRitentabile)
                ? `${messaggio.replace(/\.$/, '')}, per tre tentativi consecutivi.`
                : messaggio,
            ],
          )
          .catch(() => undefined);
      } else {
        // Il ciclo lo rimetterà in coda: lo stato lo dice al polling.
        await db
          .query(`update velia.agenti_esecuzioni set stato = 'in-coda' where id = $1`, [esecuzioneId])
          .catch(() => undefined);
      }
      throw errore;
    }
  };
}

// ---------------------------------------------------------------------------
// Le parti pure e le letture
// ---------------------------------------------------------------------------

/** I destinatari del piano, una volta sola ciascuno e nell'ordine: il numero con cui il modello li indica. */
export function destinatariDelPiano(piano: PianoAgente | null): DestinatarioBozza[] {
  const visti = new Set<string>();
  const destinatari: DestinatarioBozza[] = [];
  for (const email of piano?.email ?? []) {
    const d = email.destinatario;
    if (d.tipo === 'non-risolto') continue;
    const chiave = d.a.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    destinatari.push(d);
  }
  return destinatari;
}

const quando = (istante: Date): string =>
  new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(istante);

function titoloConversazione(nome: string, avviataIl: Date): string {
  return `${nome}, ${quando(avviataIl)}`;
}

/**
 * La domanda della conversazione dell'esecuzione: la richiesta come l'ha
 * scritta l'agenzia, poi il piano confermato. Resta nella conversazione, e
 * chi la apre dall'esecuzione legge esattamente che cosa è stato chiesto.
 */
export function messaggioDellEsecuzione(r: {
  nome: string;
  modalita: 'manuale' | 'pianificata';
  avviataIl: Date;
  richiesta: string;
  piano: PianoAgente | null;
  destinatari: DestinatarioBozza[];
}): string {
  const parti = [
    r.richiesta.trim(),
    '',
    `Esecuzione ${r.modalita} dell’agente «${r.nome}», ${quando(r.avviataIl)}. Nessuno risponde a domande mentre lavori: se manca qualcosa, dillo nell’esito.`,
  ];
  const piano = r.piano;
  if (piano?.passi.length) {
    parti.push('', 'Il piano confermato dall’agenzia, da seguire:');
    piano.passi.forEach((p, i) => parti.push(`${i + 1}. ${p.titolo}${p.dettaglio ? `: ${p.dettaglio}` : ''}`));
  }
  if (piano?.file.length) {
    parti.push('', 'File da preparare:');
    for (const f of piano.file) parti.push(`- ${f.formato.toUpperCase()}: ${f.descrizione}`);
  }
  const email: string[] = [];
  for (const e of piano?.email ?? []) {
    const d = e.destinatario;
    if (d.tipo === 'non-risolto') continue;
    const numero = r.destinatari.findIndex((x) => x.a.toLowerCase() === d.a.toLowerCase()) + 1;
    const chi = d.nome ? `${d.nome} <${d.a}>` : d.a;
    email.push(`${numero}. ${chi}: ${e.contenuto}${e.allegati.length ? ` Allegati: ${e.allegati.join(', ')}.` : ''}`);
  }
  if (email.length) {
    parti.push('', 'Email da mandare con `invia_email`, indicando il destinatario per numero:', ...email);
  }
  return parti.join('\n');
}

/** I documenti dei riferimenti che si possono leggere adesso, nell'ordine in cui sono citati. */
async function documentiPronti(db: pg.Pool, tenantId: string, ids: string[]): Promise<DocumentoRisolto[]> {
  if (!ids.length) return [];
  const r = await db.query<DocumentoRisolto>(
    `select id, titolo from velia.documenti
      where id = any($1) and path_md is not null
        and (archivio = 'pubblico' or (tenant_id = $2 and stato = 'pronto'))
      order by array_position($1::text[], id)`,
    [ids, tenantId],
  );
  return r.rows;
}

async function frasePartenza(db: pg.Pool, lavoro: RigaLavoro, job: Job): Promise<string> {
  if (lavoro.modalita === 'pianificata') return 'Esecuzione pianificata avviata.';
  const utenteId = job.payload['utenteId'];
  if (typeof utenteId === 'string' && utenteId) {
    const r = await db.query<{ nome: string; cognome: string }>(
      `select nome, cognome from velia.utenti where id = $1`,
      [utenteId],
    );
    if (r.rows[0]) return `Esecuzione manuale avviata da ${r.rows[0].nome} ${r.rows[0].cognome}.`;
  }
  return 'Esecuzione manuale avviata.';
}

/** L'ultimo errore che il turno della chat ha detto, se ne ha detto uno. */
async function ultimoErrore(db: pg.Pool, jobId: string): Promise<string | undefined> {
  const r = await db.query<{ messaggio: string | null }>(
    `select dati->>'messaggio' as messaggio from velia.eventi_job
      where job_id = $1 and tipo = 'errore'
      order by id desc limit 1`,
    [jobId],
  );
  return r.rows[0]?.messaggio ?? undefined;
}
