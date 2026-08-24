import type pg from 'pg';

import type { Citazione, EventoStream, Provenienza } from '../../contratto/conversazioni.js';
import { accoda, type Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import { emettiEvento } from '../eventi.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import { caricaDna, promptSistema, promptUtente, type MessaggioStoria } from './regole.js';
import type { EsitoSessione, Motore } from './sessione.js';
import type { GeneratoreSuggerimenti } from './suggeritore.js';
import type { GeneratoreTitolo } from './titolista.js';
import { avvisiEsposizione, ErroreValidazione, separaBlocco, validaBlocco } from './validazione.js';
import { materializzaWorkspace, type Workspace } from './workspace.js';

/**
 * Il job `interrogazione` — il §4.3 del piano per intero: workspace
 * materializzata, sessione del motore coi soli tool di lettura, eventi
 * verso il FE a ogni passo, validazione dell'output, persistenza del
 * messaggio solo a risposta completa, audit e consumi.
 *
 * Il worker è l'unico scrivano: il modello produce testo, qui lo si verifica
 * e lo si scrive. Ogni messaggio è un job nuovo; la storia si ricostruisce
 * dal database (piano §4.3.5).
 */

export interface DipendenzeInterrogazione {
  motore: Motore;
  archivio: ArchivioFile;
  /** Radice di workspace e cache sul disco del worker. */
  radice: string;
  /** Il titolo sensato al posto del provvisorio; senza, resta il provvisorio. */
  generatoreTitolo?: GeneratoreTitolo;
  /** Le prossime domande per la schermata iniziale; senza, la home usa gli esempi. */
  generatoreSuggerimenti?: GeneratoreSuggerimenti;
  /** Quanto aspettare un allegato ancora in elaborazione prima di partire senza. */
  attesaAllegatiMs?: number;
}

interface PayloadInterrogazione {
  conversazioneId: string;
  messaggioUtenteId: string;
  messaggioAssistenteId: string;
  utenteId: string;
  testo: string;
  /**
   * Il titolo messo dall'API all'invio del primo messaggio (le prime parole
   * della domanda): a risposta pronta si sostituisce con uno sensato, ma
   * solo se è ancora questo — se l'utente ha rinominato, la sua parola vince.
   */
  titoloProvvisorio?: string;
}

interface RigaConversazione {
  id: string;
  tenant_id: string;
  documenti_in_contesto: string[];
  /** RF-D-02: il modello scelto dal tenant; null = default di piattaforma. */
  modello_motore: string | null;
  /** RF-G-01: se il tenant impara dalle conversazioni. */
  memoria_attiva: boolean;
}

const MESSAGGIO_BUDGET =
  '\n\n*(Risposta parziale: il limite di ricerca previsto per una singola domanda è stato raggiunto. Prova a restringere la domanda o a indicare i documenti da consultare.)*';

export function creaGestoreInterrogazione(dip: DipendenzeInterrogazione) {
  const attesaAllegati = dip.attesaAllegatiMs ?? 120_000;

  return async function gestisciInterrogazione(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const payload = leggiPayload(job);
    const emetti = (evento: EventoStream) => emettiEvento(db, job.id, evento.tipo, evento);

    const conv = await db.query<RigaConversazione>(
      `select c.id, c.tenant_id, c.documenti_in_contesto, t.modello_motore, t.memoria_attiva
       from velia.conversazioni c
       join velia.tenant t on t.id = c.tenant_id
       where c.id = $1`,
      [payload.conversazioneId],
    );
    const conversazione = conv.rows[0];
    if (!conversazione) throw new ErroreNonRitentabile(`conversazione ${payload.conversazioneId} inesistente`);
    const { tenant_id: tenantId } = conversazione;

    const annullato = async (): Promise<boolean> => {
      const r = await db.query<{ stato: string }>(`select stato from velia.jobs where id = $1`, [job.id]);
      return r.rows[0]?.stato === 'annullato';
    };

    await aspettaAllegati(db, conversazione.documenti_in_contesto, attesaAllegati, emetti, annullato);
    if (await annullato()) return;

    /* Il passo si racconta solo se c'è qualcosa da raccogliere: per un
       saluto senza documenti non c'è nessun «preparo» da mostrare. */
    if (conversazione.documenti_in_contesto.length) {
      await emetti({ tipo: 'attivita', etichetta: 'Raccolgo i documenti della conversazione' });
    }
    let workspace: Workspace | undefined;
    try {
      workspace = await materializzaWorkspace({
        db,
        archivio: dip.archivio,
        tenantId,
        radice: dip.radice,
        jobId: job.id,
        contestoIds: conversazione.documenti_in_contesto,
      });

      const storia = await db.query<MessaggioStoria & { id: string }>(
        `select id, autore, testo from velia.messaggi
         where conversazione_id = $1 and id <> $2 and inviato_il <= (select inviato_il from velia.messaggi where id = $2)
         order by inviato_il`,
        [payload.conversazioneId, payload.messaggioUtenteId],
      );

      const contesto = conversazione.documenti_in_contesto
        .map((id) => {
          const path = workspace!.perId.get(id);
          const doc = path ? workspace!.perPath.get(path) : undefined;
          return path && doc ? { path, titolo: doc.titolo, archivio: doc.archivio, doc } : undefined;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));

      const dna = await caricaDna(
        db,
        tenantId,
        payload.utenteId,
        {
          ramiIds: [...new Set(contesto.map((c) => c.doc.ramoId).filter((x): x is string => Boolean(x)))],
          compagnieIds: [...new Set(contesto.map((c) => c.doc.compagniaId).filter((x): x is string => Boolean(x)))],
        },
        workspace.perPath,
      );

      const esito = await dip.motore.interroga(
        {
          directory: workspace.directory,
          titoloPer: (path) => workspace!.perPath.get(path)?.titolo,
          ...(conversazione.modello_motore && { modello: conversazione.modello_motore }),
          promptSistema: promptSistema(dna),
          promptUtente: promptUtente({
            documenti: contesto.map(({ path, titolo, archivio }) => ({ path, titolo, archivio })),
            mancanti: workspace.mancanti.map(({ titolo, motivo }) => ({ titolo, motivo })),
            storia: storia.rows.map(({ autore, testo }) => ({ autore, testo })),
            domanda: payload.testo,
          }),
        },
        {
          passo: async (p) => {
            if (p.tipo === 'attivita') await emetti({ tipo: 'attivita', etichetta: p.etichetta });
            else await emetti({ tipo: 'testo', delta: p.delta });
          },
          annullato,
        },
      );

      if (esito.terminato === 'annullato') {
        /* Niente persistenza, niente `fine`: il client se n'è già andato e
           il job è `annullato` (lo ha segnato l'API). Restano audit e consumi:
           i token si sono spesi comunque. */
        await registraConsumi(db, tenantId, job.id, esito);
        return;
      }

      if (esito.terminato === 'errore') {
        await registraConsumi(db, tenantId, job.id, esito);
        await emetti({ tipo: 'errore', messaggio: 'Il motore si è interrotto durante la risposta.' });
        throw new ErroreNonRitentabile(esito.errore ?? 'sessione terminata con errore');
      }

      let testoFinale: string;
      let citazioni: Citazione[] = [];
      let provenienze: Provenienza[] = [];
      let nonSupportato = false;
      let avvisi: string[] = [];

      if (esito.terminato === 'budget') {
        /* Mai silenziosamente (piano §4.3.6): la risposta parziale si dichiara. */
        await emetti({ tipo: 'testo', delta: MESSAGGIO_BUDGET });
        testoFinale = separaBlocco(esito.testo).visibile + MESSAGGIO_BUDGET;
        nonSupportato = true;
        avvisi = [`budget raggiunto: ${esito.errore ?? ''}`];
        await emetti({ tipo: 'non-supportato' });
      } else {
        const { visibile, blocco, problemi } = separaBlocco(esito.testo);
        testoFinale = visibile;
        if (!blocco) {
          await registraConsumi(db, tenantId, job.id, esito);
          await emetti({
            tipo: 'errore',
            messaggio: 'La risposta non ha superato la verifica delle fonti. Riprova a inviare la domanda.',
          });
          throw new ErroreNonRitentabile(problemi.join('; '));
        }
        try {
          const valido = validaBlocco(blocco, workspace.perPath, dna);
          citazioni = valido.citazioni;
          provenienze = valido.provenienze;
          nonSupportato = valido.nonSupportato;
          avvisi = [...valido.avvisi, ...avvisiEsposizione(testoFinale)];
        } catch (errore) {
          await registraConsumi(db, tenantId, job.id, esito);
          await emetti({
            tipo: 'errore',
            messaggio: 'La risposta citava passaggi non verificabili ed è stata scartata. Riprova a inviare la domanda.',
          });
          const dettagli = errore instanceof ErroreValidazione ? errore.dettagli.join('; ') : String(errore);
          throw new ErroreNonRitentabile(`validazione fallita: ${dettagli}`);
        }
        for (const c of citazioni) await emetti({ tipo: 'citazione', citazione: c });
        for (const p of provenienze) await emetti({ tipo: 'provenienza', provenienza: p });
        if (nonSupportato) await emetti({ tipo: 'non-supportato' });
      }

      /* Persistenza solo a risposta completa (piano §3.1), poi `fine`: chi
         ricarica dopo il `fine` trova il messaggio. */
      await db.query(
        `insert into velia.messaggi
           (id, conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati,
            citazioni, provenienze, non_supportato, job_id)
         values ($1, $2, $3, 'assistente', $4, $5, '{}', $6, $7, $8, $9)
         on conflict (id) do update set testo = excluded.testo, citazioni = excluded.citazioni,
           provenienze = excluded.provenienze, non_supportato = excluded.non_supportato`,
        [
          payload.messaggioAssistenteId,
          payload.conversazioneId,
          tenantId,
          payload.utenteId,
          testoFinale,
          JSON.stringify(citazioni),
          JSON.stringify(provenienze),
          nonSupportato,
          job.id,
        ],
      );
      await db.query(`update velia.conversazioni set updated_at = now() where id = $1`, [
        payload.conversazioneId,
      ]);
      await db.query(
        `insert into velia.audit_risposte
           (tenant_id, conversazione_id, messaggio_id, job_id, utente_id, domanda, risposta,
            documenti_letti, citazioni, non_supportato, modello, turni, durata_ms,
            token_input, token_output, token_cache_lettura, token_cache_scrittura, costo_usd)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          tenantId,
          payload.conversazioneId,
          payload.messaggioAssistenteId,
          job.id,
          payload.utenteId,
          payload.testo,
          testoFinale,
          esito.documentiLetti,
          JSON.stringify({ citazioni, avvisi }),
          nonSupportato,
          esito.modello,
          esito.turni,
          esito.durataMs,
          esito.token.input,
          esito.token.output,
          esito.token.cacheLettura,
          esito.token.cacheScrittura,
          esito.costoUsd,
        ],
      );
      await registraConsumi(db, tenantId, job.id, esito);

      /* RF-G-01: la memoria impara durante la conversazione — a risposta
         scritta si accoda il job che legge gli scambi nuovi. Un accodamento
         mancato non è un errore della risposta. */
      if (conversazione.memoria_attiva) {
        try {
          await accoda(db, 'memoria', { conversazioneId: payload.conversazioneId }, { tenantId, utenteId: payload.utenteId });
        } catch (errore) {
          await emettiEvento(db, job.id, 'memoria-saltata', {
            motivo: errore instanceof Error ? errore.message : String(errore),
          });
        }
      }

      /* Prima del `fine`: alla chiusura il FE ricarica lo storico, e deve
         già trovarci il titolo sensato. Un titolo mancato non è un errore. */
      if (payload.titoloProvvisorio && dip.generatoreTitolo) {
        try {
          const titolo = await dip.generatoreTitolo.genera(payload.testo, testoFinale);
          if (titolo) {
            await db.query(
              `update velia.conversazioni set titolo = $2 where id = $1 and titolo = $3`,
              [payload.conversazioneId, titolo, payload.titoloProvvisorio],
            );
          }
        } catch (errore) {
          await emettiEvento(db, job.id, 'titolo-saltato', {
            motivo: errore instanceof Error ? errore.message : String(errore),
          });
        }
      }

      /* Le prossime domande per la home: fresche a ogni risposta, per
         utente. Un giro mancato non è un errore: restano le precedenti. */
      if (dip.generatoreSuggerimenti) {
        try {
          const proposte = await dip.generatoreSuggerimenti.genera(payload.testo, testoFinale);
          if (proposte.length) {
            await db.query(`delete from velia.suggerimenti where utente_id = $1`, [payload.utenteId]);
            for (const testoProposta of proposte) {
              await db.query(
                `insert into velia.suggerimenti (tenant_id, utente_id, testo, conversazione_id)
                 values ($1, $2, $3, $4)`,
                [tenantId, payload.utenteId, testoProposta, payload.conversazioneId],
              );
            }
          }
        } catch (errore) {
          await emettiEvento(db, job.id, 'suggerimenti-saltati', {
            motivo: errore instanceof Error ? errore.message : String(errore),
          });
        }
      }

      await emetti({ tipo: 'fine' });
    } finally {
      await workspace?.rimuovi().catch(() => undefined);
    }
  };
}

function leggiPayload(job: Job): PayloadInterrogazione {
  const p = job.payload;
  for (const campo of ['conversazioneId', 'messaggioUtenteId', 'messaggioAssistenteId', 'utenteId', 'testo']) {
    if (typeof p[campo] !== 'string' || !p[campo]) {
      throw new ErroreNonRitentabile(`payload del job senza ${campo}`);
    }
  }
  return p as unknown as PayloadInterrogazione;
}

/**
 * Un allegato del contesto può essere ancora in conversione (il FE lo mette
 * nel contesto appena caricato, il contratto non ha uno stato): si aspetta
 * un po', dicendolo all'utente, poi si parte con ciò che c'è.
 */
async function aspettaAllegati(
  db: pg.Pool,
  contestoIds: string[],
  attesaMs: number,
  emetti: (e: EventoStream) => Promise<number>,
  annullato: () => Promise<boolean>,
): Promise<void> {
  if (!contestoIds.length) return;
  const scadenza = Date.now() + attesaMs;
  let avvisato = false;
  for (;;) {
    const r = await db.query<{ titolo: string }>(
      `select titolo from velia.documenti
       where id = any($1) and archivio = 'conversazione' and stato in ('in-coda', 'in-elaborazione')`,
      [contestoIds],
    );
    if (!r.rowCount || Date.now() > scadenza) return;
    if (!avvisato) {
      await emetti({ tipo: 'attivita', etichetta: `Aspetto l’elaborazione di «${r.rows[0]!.titolo}»` });
      avvisato = true;
    }
    await new Promise((res) => setTimeout(res, 2000));
    if (await annullato()) return;
  }
}

async function registraConsumi(db: pg.Pool, tenantId: string, jobId: string, esito: EsitoSessione): Promise<void> {
  await db.query(
    `insert into velia.consumi
       (tenant_id, job_id, origine, modello, token_input, token_output,
        token_cache_lettura, token_cache_scrittura, costo_usd)
     values ($1, $2, 'app', $3, $4, $5, $6, $7, $8)`,
    [
      tenantId,
      jobId,
      esito.modello,
      esito.token.input,
      esito.token.output,
      esito.token.cacheLettura,
      esito.token.cacheScrittura,
      esito.costoUsd,
    ],
  );
}
