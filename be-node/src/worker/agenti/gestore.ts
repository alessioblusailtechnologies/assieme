import type pg from 'pg';

import { documentiDeiRiferimenti, idrataRiferimenti } from '../../agenti/riferimenti.js';
import {
  testoLeggibile,
  type PianoAgente,
  type RigaLog,
  type RiferimentoRichiesta,
  type StatoPiano,
} from '../../contratto/agenti.js';
import { modelloDelTenant } from '../../contratto/modelli.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import { ancoraCitazioni } from '../motore/ancoraggio.js';
import { caricaDna, catalogoArchivioPubblico, promptSistema } from '../motore/regole.js';
import type { EsitoSessione, Motore } from '../motore/sessione.js';
import { ErroreValidazione, separaBlocco, validaBlocco } from '../motore/validazione.js';
import { materializzaWorkspace, type Workspace } from '../motore/workspace.js';

/**
 * Il job `agente` (RF-E-02…E-13): la stessa interrogazione della chat con un
 * ingresso diverso.
 *
 * Dal 14/09/2026 l'ingresso è la richiesta dell'agente, coi riferimenti
 * risolti AL MOMENTO dell'esecuzione (un documento eliminato non c'è più,
 * un prodotto porta i documenti della sua edizione), e i passi del piano
 * confermato. Un piano non confermato non parte. È un ponte: nella fase 4
 * di PIANO-AGENTI.md l'esecuzione diventa una conversazione lavorata dal
 * motore della chat, con i suoi file e le sue email.
 *
 * L'esecuzione si racconta da sola (RF-E-06/11): il log cresce passo per
 * passo sulla riga che il FE interroga, i tentativi si contano, il
 * fallimento persistente arriva dopo tre. Le citazioni passano dalla stessa
 * validazione della chat (RF-E-08): un esito che cita passaggi non
 * verificabili è un'esecuzione fallita, non un documento consegnato.
 */

export interface DipendenzeAgenti {
  motore: Motore;
  archivio: ArchivioFile;
  radice: string;
}

interface RigaLavoro {
  esecuzione_id: string;
  stato: string;
  modalita: 'manuale' | 'pianificata';
  log: RigaLog[];
  agente_id: string;
  tenant_id: string;
  nome: string;
  richiesta: string;
  piano: PianoAgente | null;
  piano_stato: StatoPiano;
  creato_da: string | null;
  modello_motore: string | null;
}

export interface DocumentoRisolto {
  id: string;
  titolo: string;
}

const NOTA_BUDGET =
  '\n\n*(Esito parziale: il limite di ricerca previsto per una singola esecuzione è stato raggiunto.)*';

export function creaGestoreAgenti(dip: DipendenzeAgenti) {
  return async function gestisciAgente(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const esecuzioneId = job.payload['esecuzioneId'];
    if (typeof esecuzioneId !== 'string' || !esecuzioneId) {
      throw new ErroreNonRitentabile('payload del job senza esecuzioneId');
    }

    const r = await db.query<RigaLavoro>(
      `select e.id as esecuzione_id, e.stato, e.modalita, e.log,
              a.id as agente_id, a.tenant_id, a.nome, a.richiesta, a.piano, a.piano_stato,
              a.creato_da, t.modello_motore
       from velia.agenti_esecuzioni e
       join velia.agenti a on a.id = e.agente_id
       join velia.tenant t on t.id = a.tenant_id
       where e.id = $1`,
      [esecuzioneId],
    );
    const lavoro = r.rows[0];
    if (!lavoro) return; // agente o esecuzione eliminati: job orfano
    if (lavoro.stato === 'completata' || lavoro.stato === 'fallita') return; // già assestata
    const modelloTenant = modelloDelTenant(lavoro.modello_motore);

    const log: RigaLog[] = [...lavoro.log];
    const annota = async (livello: RigaLog['livello'], messaggio: string): Promise<void> => {
      log.push({ istante: new Date().toISOString(), livello, messaggio });
      await db.query(`update velia.agenti_esecuzioni set log = $2 where id = $1`, [
        esecuzioneId,
        JSON.stringify(log),
      ]);
    };

    /* Un piano non confermato non parte. API e tick lo impediscono già: qui
       arriva solo un'esecuzione accodata prima che la richiesta cambiasse. */
    if (lavoro.piano_stato !== 'confermato') {
      await annota('errore', 'Il piano dell’agente non è confermato: esecuzione non avviata.');
      await db.query(
        `update velia.agenti_esecuzioni set stato = 'fallita', conclusa_il = now(), errore = $2 where id = $1`,
        [esecuzioneId, 'Il piano dell’agente non è confermato: confermalo e riprova.'],
      );
      return;
    }

    let workspace: Workspace | undefined;
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
      const risolti = await documentiPronti(db, lavoro.tenant_id, documentiDeiRiferimenti(riferimenti));
      const clienti = riferimenti.filter((x) => x.tipo === 'cliente');
      await annota(
        'info',
        risolti.length
          ? `Raccolti i documenti della richiesta: ${risolti.length === 1 ? '1 documento' : `${risolti.length} documenti`}.`
          : 'La richiesta non indica documenti: l’agente li cerca negli archivi.',
      );

      workspace = await materializzaWorkspace({
        db,
        archivio: dip.archivio,
        tenantId: lavoro.tenant_id,
        radice: dip.radice,
        jobId: job.id,
        contestoIds: risolti.map((d) => d.id),
        /* Un cliente solo è quello di cui si parla: la sua scheda va su disco. */
        ...(clienti.length === 1 && { clienteId: clienti[0]!.chiave }),
      });

      const fontiPrompt = risolti
        .map((d) => {
          const path = workspace!.perId.get(d.id);
          return path ? { path, titolo: d.titolo } : undefined;
        })
        .filter((x): x is { path: string; titolo: string } => Boolean(x));

      const ambiti = await ambitiDeiDocumenti(db, risolti.map((d) => d.id));
      const dna = await caricaDna(db, lavoro.tenant_id, lavoro.creato_da, ambiti, workspace.perPath);

      await annota('info', 'Interrogazione del modello e composizione dell’esito.');
      const esito = await dip.motore.interroga(
        {
          directory: workspace.directory,
          titoloPer: (p) => workspace!.perPath.get(p)?.titolo,
          ...(modelloTenant && { modello: modelloTenant }),
          promptSistema: promptSistema(dna, { catalogo: catalogoArchivioPubblico(workspace.perPath) }),
          promptUtente: promptAgente({
            richiesta: testoLeggibile(lavoro.richiesta, riferimenti),
            piano: lavoro.piano,
            fonti: fontiPrompt,
            clienti: clienti.map((c) => c.titolo),
          }),
        },
        { passo: () => Promise.resolve(), annullato: () => Promise.resolve(false) },
      );
      await registraConsumi(db, lavoro.tenant_id, job.id, esito);
      if (esito.terminato === 'errore' || esito.terminato === 'annullato') {
        throw new Error(esito.errore ?? 'la sessione si è chiusa senza un risultato');
      }

      let output: string;
      let citazioni: unknown[] = [];
      if (esito.terminato === 'budget') {
        output = separaBlocco(esito.testo).visibile + NOTA_BUDGET;
        await annota('avviso', 'Limite di ricerca raggiunto: esito parziale, senza citazioni verificate.');
      } else {
        const { visibile, blocco, problemi } = separaBlocco(esito.testo);
        if (!blocco) {
          throw new ErroreNonRitentabile(`esito senza blocco di citazioni: ${problemi.join('; ')}`);
        }
        try {
          const valido = validaBlocco(blocco, workspace.perPath, dna);
          /* La pagina la decide l'ancora sotto cui sta l'estratto, non il modello. */
          const ancorate = await ancoraCitazioni(workspace.directory, valido.citazioni, workspace.perPath);
          citazioni = ancorate.citazioni;
          for (const a of ancorate.avvisi) await annota('avviso', a);
        } catch (errore) {
          const dettagli = errore instanceof ErroreValidazione ? errore.dettagli.join('; ') : String(errore);
          throw new ErroreNonRitentabile(`l'esito citava passaggi non verificabili: ${dettagli}`);
        }
        output = visibile;
      }

      await annota(
        'info',
        `Esito composto: ${citazioni.length === 1 ? '1 citazione' : `${citazioni.length} citazioni`}.`,
      );
      await db.query(
        `update velia.agenti_esecuzioni
         set stato = 'completata', conclusa_il = now(), output = $2, citazioni = $3,
             errore = null
         where id = $1`,
        [esecuzioneId, output, JSON.stringify(citazioni)],
      );
    } catch (errore) {
      const definitivo = errore instanceof ErroreNonRitentabile || job.tentativi >= 3;
      const messaggio =
        errore instanceof ErroreNonRitentabile
          ? 'L’esito non ha superato la verifica delle fonti.'
          : 'Il motore non ha risposto entro il tempo previsto.';
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
    } finally {
      await workspace?.rimuovi().catch(() => undefined);
    }
  };
}

// ---------------------------------------------------------------------------
// Le parti pure e le letture
// ---------------------------------------------------------------------------

/** Il prompt dell'esecuzione: la richiesta, i passi del piano confermato, le fonti risolte. */
export function promptAgente(r: {
  richiesta: string;
  piano: PianoAgente | null;
  fonti: Array<{ path: string; titolo: string }>;
  clienti: string[];
}): string {
  const parti = [
    'Esegui questa richiesta, definita una volta e ripetuta nel tempo (sei un agente, non una conversazione: nessuna domanda di ritorno — se un dato manca, dichiaralo nell’esito).',
    '',
    `Richiesta:\n${r.richiesta}`,
  ];
  if (r.piano?.passi.length) {
    parti.push('', 'Il piano confermato dall’agenzia, da seguire:');
    r.piano.passi.forEach((p, i) => parti.push(`${i + 1}. ${p.titolo}${p.dettaglio ? `: ${p.dettaglio}` : ''}`));
  }
  if (r.clienti.length) {
    parti.push('', `Clienti referenziati: ${r.clienti.join(', ')} (le loro schede sono in \`tenant/clienti/\`).`);
  }
  if (r.fonti.length) {
    const elenco = r.fonti.slice(0, 30);
    parti.push('', `Fonti documentali di questa esecuzione (${r.fonti.length}):`);
    for (const f of elenco) parti.push(`- \`${f.path}\` — ${f.titolo}`);
    if (r.fonti.length > elenco.length) {
      parti.push(`- …e altri ${r.fonti.length - elenco.length} documenti nelle stesse cartelle.`);
    }
    parti.push('Lavora su queste fonti; il resto della workspace è contesto consultabile se il task lo richiede.');
  } else {
    parti.push('', 'La richiesta non referenzia documenti: cercali negli archivi della workspace, partendo dagli `INDICE.md`.');
  }
  if (r.piano && (r.piano.file.length || r.piano.email.length)) {
    parti.push(
      '',
      'In questa esecuzione non puoi ancora produrre file né inviare email: scrivi nell’esito il contenuto che avrebbero avuto, e dichiaralo.',
    );
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

async function ambitiDeiDocumenti(
  db: pg.Pool,
  ids: string[],
): Promise<{ ramiIds: string[]; compagnieIds: string[] }> {
  if (!ids.length) return { ramiIds: [], compagnieIds: [] };
  const r = await db.query<{ ramo_id: string | null; compagnia_id: string | null }>(
    `select distinct ramo_id, compagnia_id from velia.documenti where id = any($1)`,
    [ids],
  );
  return {
    ramiIds: [...new Set(r.rows.map((x) => x.ramo_id).filter((x): x is string => Boolean(x)))],
    compagnieIds: [...new Set(r.rows.map((x) => x.compagnia_id).filter((x): x is string => Boolean(x)))],
  };
}

async function registraConsumi(
  db: pg.Pool,
  tenantId: string,
  jobId: string,
  esito: EsitoSessione,
): Promise<void> {
  await db.query(
    `insert into velia.consumi
       (tenant_id, job_id, origine, modello, token_input, token_output,
        token_cache_lettura, token_cache_scrittura, costo_usd)
     values ($1, $2, 'agente', $3, $4, $5, $6, $7, $8)`,
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
