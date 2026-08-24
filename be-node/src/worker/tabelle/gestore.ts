import type pg from 'pg';

import type { CellaTabella } from '../../contratto/tabelle.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import type { EsitoSessione, Motore } from '../motore/sessione.js';
import { materializzaWorkspace, type Workspace } from '../motore/workspace.js';
import {
  promptRigaEstrazione,
  PROMPT_ESTRAZIONE,
  separaBloccoCelle,
  valutaCelle,
  type ColonnaDaEstrarre,
} from './estrazione.js';

/**
 * Il job `tabella` (RF-C-11/12): riempie le celle in attesa, un documento
 * alla volta — una sessione del motore per riga estrae TUTTE le colonne in
 * attesa di quel documento («per gruppi per documento»: una sessione per
 * cella moltiplicherebbe workspace e prompt per niente; il piano lasciava la
 * scelta alla misura, e i numeri stanno nei consumi, riga per riga).
 *
 * La riconciliazione è il ciclo stesso: a ogni giro si rilegge dal database
 * la prossima riga con celle in attesa, quindi una colonna aggiunta a
 * generazione in corso entra in coda e una riga tolta smette di esistere —
 * come il timer del mock, ma con la verità in Postgres. Non c'è streaming:
 * il FE interroga il dettaglio finché `stato === 'in-generazione'`.
 */

export interface DipendenzeTabelle {
  motore: Motore;
  archivio: ArchivioFile;
  /** Radice di workspace e cache sul disco del worker. */
  radice: string;
}

interface RigaDaLavorare {
  documento_id: string;
  etichetta: string;
}

const MOTIVO_DOCUMENTO_SPARITO = 'Il documento non è più disponibile negli archivi.';
const MOTIVO_BUDGET =
  'Il limite di ricerca previsto per un documento è stato raggiunto prima di completare l’estrazione.';
const MOTIVO_ESTRAZIONE_FALLITA =
  'L’estrazione non è riuscita per questo documento: rimuovilo e riaggiungilo per riprovare.';

export function creaGestoreTabelle(dip: DipendenzeTabelle) {
  return async function gestisciTabella(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const tabellaId = job.payload['tabellaId'];
    if (typeof tabellaId !== 'string' || !tabellaId) {
      throw new ErroreNonRitentabile('payload del job senza tabellaId');
    }

    const t = await db.query<{ tenant_id: string }>(
      `select tenant_id from velia.tabelle where id = $1`,
      [tabellaId],
    );
    const tenantId = t.rows[0]?.tenant_id;
    if (!tenantId) return; // tabella eliminata: il job è orfano, non un errore

    const annullato = async (): Promise<boolean> => {
      const r = await db.query<{ stato: string }>(`select stato from velia.jobs where id = $1`, [job.id]);
      return r.rows[0]?.stato === 'annullato';
    };

    let workspace: Workspace | undefined;
    const idsGiaCercati = new Set<string>();

    /** intestazione → descrizione dei criteri predefiniti, per arricchire il prompt. */
    const descrizioni = new Map<string, string>();
    for (const c of (
      await db.query<{ intestazione: string; descrizione: string }>(
        `select intestazione, descrizione from velia.tabelle_criteri`,
      )
    ).rows) {
      descrizioni.set(c.intestazione, c.descrizione);
    }

    try {
      for (;;) {
        if (await annullato()) return;

        const prossima = await db.query<RigaDaLavorare>(
          `select r.documento_id, r.etichetta
           from velia.tabelle_righe r
           where r.tabella_id = $1
             and exists (
               select 1 from velia.tabelle_celle c
               where c.tabella_id = r.tabella_id and c.documento_id = r.documento_id
                 and c.stato = 'in-attesa'
             )
           order by r.posizione
           limit 1`,
          [tabellaId],
        );
        const riga = prossima.rows[0];
        if (!riga) {
          /* Nessuna cella in attesa: la tabella si chiude — a meno che una
             mutazione non ne abbia aggiunte fra la ricerca e la chiusura. */
          const chiusa = await db.query(
            `update velia.tabelle set stato = 'completa', updated_at = now()
             where id = $1 and stato = 'in-generazione'
               and not exists (
                 select 1 from velia.tabelle_celle where tabella_id = $1 and stato = 'in-attesa'
               )`,
            [tabellaId],
          );
          if (chiusa.rowCount) break;
          const ancora = await db.query(
            `select 1 from velia.tabelle_celle where tabella_id = $1 and stato = 'in-attesa' limit 1`,
            [tabellaId],
          );
          if (!ancora.rowCount) break; // già assestata (o in errore): niente da fare
          continue;
        }

        const colonne = await db.query<ColonnaDaEstrarre & { criterio: string | null }>(
          `select co.id, co.intestazione, co.origine, co.criterio
           from velia.tabelle_celle ce
           join velia.tabelle_colonne co on co.id = ce.colonna_id
           where ce.tabella_id = $1 and ce.documento_id = $2 and ce.stato = 'in-attesa'
           order by co.posizione`,
          [tabellaId, riga.documento_id],
        );
        if (!colonne.rowCount) continue;
        const idsColonne = colonne.rows.map((c) => c.id);

        /* La workspace si materializza una volta per job; se una riga porta
           un documento che non c'è (aggiunto dopo, o un allegato), si
           rimaterializza una volta sola per quell'id prima di arrendersi. */
        const documentiIds = (
          await db.query<{ documento_id: string }>(
            `select documento_id from velia.tabelle_righe where tabella_id = $1`,
            [tabellaId],
          )
        ).rows.map((r) => r.documento_id);
        workspace ??= await materializza(db, dip, tenantId, job.id, documentiIds);
        let path = workspace.perId.get(riga.documento_id);
        if (!path && !idsGiaCercati.has(riga.documento_id)) {
          idsGiaCercati.add(riga.documento_id);
          await workspace.rimuovi().catch(() => undefined);
          workspace = await materializza(db, dip, tenantId, job.id, documentiIds);
          path = workspace.perId.get(riga.documento_id);
        }
        if (!path) {
          await scriviCelleUguali(db, tabellaId, riga.documento_id, idsColonne, {
            stato: 'pronta',
            esito: 'non-determinabile',
            motivo: MOTIVO_DOCUMENTO_SPARITO,
          });
          continue;
        }
        const doc = workspace.perPath.get(path)!;

        const esito = await dip.motore.interroga(
          {
            directory: workspace.directory,
            titoloPer: (p) => workspace!.perPath.get(p)?.titolo,
            promptSistema: PROMPT_ESTRAZIONE,
            promptUtente: promptRigaEstrazione({
              path,
              titolo: doc.titolo,
              colonne: colonne.rows.map((c) => ({
                ...c,
                ...(c.origine === 'predefinita' &&
                  descrizioni.has(c.intestazione) && { descrizione: descrizioni.get(c.intestazione)! }),
              })),
            }),
          },
          { passo: () => Promise.resolve(), annullato },
        );
        await registraConsumi(db, tenantId, job.id, esito);
        if (esito.terminato === 'annullato') return;

        if (esito.terminato !== 'completato') {
          /* Il budget o un errore su UNA riga non fermano la tabella: le sue
             celle dichiarano il motivo e si passa alla riga dopo. */
          await scriviCelleUguali(db, tabellaId, riga.documento_id, idsColonne, {
            stato: 'pronta',
            esito: 'non-determinabile',
            motivo: esito.terminato === 'budget' ? MOTIVO_BUDGET : MOTIVO_ESTRAZIONE_FALLITA,
          });
          await db.query(`update velia.tabelle set updated_at = now() where id = $1`, [tabellaId]);
          continue;
        }

        const { blocco, problemi } = separaBloccoCelle(esito.testo);
        if (!blocco) {
          await scriviCelleUguali(db, tabellaId, riga.documento_id, idsColonne, {
            stato: 'pronta',
            esito: 'non-determinabile',
            motivo: MOTIVO_ESTRAZIONE_FALLITA,
          });
          await db.query(`update velia.tabelle set updated_at = now() where id = $1`, [tabellaId]);
          console.warn(`[tabelle] ${tabellaId} · ${riga.etichetta}: ${problemi.join('; ')}`);
          continue;
        }

        const { celle, avvisi } = valutaCelle(blocco, colonne.rows, workspace.perPath);
        for (const [colonnaId, cella] of celle) {
          await scriviCella(db, tabellaId, riga.documento_id, colonnaId, cella);
        }
        await db.query(`update velia.tabelle set updated_at = now() where id = $1`, [tabellaId]);
        if (avvisi.length) {
          console.warn(`[tabelle] ${tabellaId} · ${riga.etichetta}: ${avvisi.join('; ')}`);
        }
      }
    } catch (errore) {
      /* Un guasto d'infrastruttura si ritenta (il ciclo lo rimette in coda e
         la tabella resta in-generazione: il FE continua a interrogare); se il
         fallimento è definitivo — non ritentabile, o l'ultimo tentativo — la
         tabella lo dichiara, perché il polling deve potersi fermare. */
      if (errore instanceof ErroreNonRitentabile || job.tentativi >= 3) {
        await db
          .query(
            `update velia.tabelle set stato = 'errore', updated_at = now()
             where id = $1 and stato = 'in-generazione'`,
            [tabellaId],
          )
          .catch(() => undefined);
      }
      throw errore;
    } finally {
      await workspace?.rimuovi().catch(() => undefined);
    }
  };
}

function materializza(
  db: pg.Pool,
  dip: DipendenzeTabelle,
  tenantId: string,
  jobId: string,
  contestoIds: string[],
): Promise<Workspace> {
  return materializzaWorkspace({
    db,
    archivio: dip.archivio,
    tenantId,
    radice: dip.radice,
    jobId,
    contestoIds,
  });
}

async function scriviCella(
  db: pg.Pool,
  tabellaId: string,
  documentoId: string,
  colonnaId: string,
  cella: CellaTabella,
): Promise<void> {
  if (cella.stato !== 'pronta') return;
  await db.query(
    `update velia.tabelle_celle
     set stato = 'pronta', esito = $4, valore = $5, nota = $6, motivo = $7, citazioni = $8
     where tabella_id = $1 and documento_id = $2 and colonna_id = $3 and stato = 'in-attesa'`,
    [
      tabellaId,
      documentoId,
      colonnaId,
      cella.esito,
      cella.esito === 'presente' ? cella.valore : null,
      cella.esito === 'non-presente' ? (cella.nota ?? null) : null,
      cella.esito === 'non-determinabile' ? cella.motivo : null,
      JSON.stringify(cella.esito === 'presente' ? cella.citazioni : []),
    ],
  );
}

async function scriviCelleUguali(
  db: pg.Pool,
  tabellaId: string,
  documentoId: string,
  colonneIds: string[],
  cella: CellaTabella,
): Promise<void> {
  for (const colonnaId of colonneIds) {
    await scriviCella(db, tabellaId, documentoId, colonnaId, cella);
  }
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
