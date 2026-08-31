import type pg from 'pg';

import type { NuovaFonteAgente, ParametroAgente, RigaLog } from '../../contratto/agenti.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import { ancoraCitazioni } from '../motore/ancoraggio.js';
import { caricaDna, promptSistema } from '../motore/regole.js';
import type { EsitoSessione, Motore } from '../motore/sessione.js';
import { ErroreValidazione, separaBlocco, validaBlocco } from '../motore/validazione.js';
import { materializzaWorkspace, type Workspace } from '../motore/workspace.js';

/**
 * Il job `agente` (RF-E-02…E-13): la stessa interrogazione della chat con un
 * ingresso diverso — le istruzioni scritte una volta nell'agente, le fonti
 * risolte AL MOMENTO dell'esecuzione (insiemi vivi: «tutto il ramo auto» è
 * l'archivio di oggi, non quello di quando l'agente fu creato — RF-E-10), i
 * parametri dell'avvio manuale nel prompt.
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
  parametri_avvio: Record<string, string> | null;
  log: RigaLog[];
  agente_id: string;
  tenant_id: string;
  nome: string;
  istruzioni: string;
  fonti: NuovaFonteAgente[];
  formato_output: 'testo' | 'tabella' | 'documento';
  template_output_id: string | null;
  parametri: ParametroAgente[];
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
      `select e.id as esecuzione_id, e.stato, e.modalita, e.parametri as parametri_avvio, e.log,
              a.id as agente_id, a.tenant_id, a.nome, a.istruzioni, a.fonti, a.formato_output,
              a.template_output_id, a.parametri, a.creato_da, t.modello_motore
       from velia.agenti_esecuzioni e
       join velia.agenti a on a.id = e.agente_id
       join velia.tenant t on t.id = a.tenant_id
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

      for (const parametro of lavoro.parametri) {
        const valore = lavoro.parametri_avvio?.[parametro.chiave];
        if (!valore) continue;
        const testo =
          parametro.tipo === 'documento' ? `«${await titoloDocumento(db, valore)}»` : `«${valore}»`;
        await annota('info', `Parametro ${parametro.chiave} = ${testo}.`);
      }

      const risolti = await risolviFonti(db, lavoro.tenant_id, lavoro.fonti, lavoro.creato_da);
      await annota(
        'info',
        `Raccolte le fonti: ${risolti.length === 1 ? '1 documento' : `${risolti.length} documenti`} da ${
          lavoro.fonti.length === 1 ? '1 fonte configurata' : `${lavoro.fonti.length} fonti configurate`
        }.`,
      );

      workspace = await materializzaWorkspace({
        db,
        archivio: dip.archivio,
        tenantId: lavoro.tenant_id,
        radice: dip.radice,
        jobId: job.id,
        contestoIds: risolti.map((d) => d.id),
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
          ...(lavoro.modello_motore && { modello: lavoro.modello_motore }),
          promptSistema: promptSistema(dna),
          promptUtente: promptAgente({
            istruzioni: lavoro.istruzioni,
            formato: lavoro.formato_output,
            fonti: fontiPrompt,
            parametri: await valoriParametri(db, lavoro),
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

      const template = lavoro.template_output_id
        ? await db.query<{ nome: string }>(`select nome from velia.template where id = $1`, [
            lavoro.template_output_id,
          ])
        : undefined;
      if (template?.rows[0]) {
        await annota('info', `Documento generato sul template «${template.rows[0].nome}».`);
      }

      await annota(
        'info',
        `Esito composto: ${citazioni.length === 1 ? '1 citazione' : `${citazioni.length} citazioni`}.`,
      );
      await db.query(
        `update velia.agenti_esecuzioni
         set stato = 'completata', conclusa_il = now(), output = $2, citazioni = $3,
             template_output_id = $4, errore = null
         where id = $1`,
        [
          esecuzioneId,
          output,
          JSON.stringify(citazioni),
          template?.rows[0] ? lavoro.template_output_id : null,
        ],
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

/** Il prompt dell'esecuzione: istruzioni, fonti risolte, parametri, formato. */
export function promptAgente(r: {
  istruzioni: string;
  formato: 'testo' | 'tabella' | 'documento';
  fonti: Array<{ path: string; titolo: string }>;
  parametri: Array<{ etichetta: string; valore: string }>;
}): string {
  const parti = [
    'Esegui questo task, definito una volta e ripetuto nel tempo (sei un agente, non una conversazione: nessuna domanda di ritorno — se un dato manca, dichiaralo nell’esito).',
    '',
    `Istruzioni del task:\n${r.istruzioni}`,
  ];
  if (r.parametri.length) {
    parti.push('', 'Parametri di questa esecuzione:');
    for (const p of r.parametri) parti.push(`- ${p.etichetta}: ${p.valore}`);
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
    parti.push('', 'Le fonti configurate non hanno prodotto documenti: dichiaralo nell’esito.');
  }
  if (r.formato === 'tabella') {
    parti.push('', 'Formato dell’esito: una tabella Markdown (più righe di sintesi attorno se servono).');
  }
  return parti.join('\n');
}

/** Le fonti dell'agente risolte ADESSO: è qui che l'insieme è vivo (RF-E-10). */
export async function risolviFonti(
  db: pg.Pool,
  tenantId: string,
  fonti: NuovaFonteAgente[],
  creatoDa: string | null,
): Promise<DocumentoRisolto[]> {
  const visti = new Set<string>();
  const risolti: DocumentoRisolto[] = [];
  const aggiungi = (righe: DocumentoRisolto[]): void => {
    for (const d of righe) {
      if (!visti.has(d.id)) {
        visti.add(d.id);
        risolti.push(d);
      }
    }
  };

  for (const fonte of fonti) {
    if (fonte.tipo === 'documento') {
      const r = await db.query<DocumentoRisolto>(
        `select id, titolo from velia.documenti
         where id = $1 and path_md is not null
           and (archivio = 'pubblico' or (tenant_id = $2 and stato = 'pronto'))`,
        [fonte.documentoId, tenantId],
      );
      aggiungi(r.rows);
    } else if (fonte.tipo === 'selezione') {
      const condizioni = [`d.path_md is not null`];
      const parametri: unknown[] = [];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      condizioni.push(
        fonte.archivio === 'pubblico'
          ? `d.archivio = 'pubblico'`
          : `d.archivio = 'privato' and d.tenant_id = ${par(tenantId)} and d.stato = 'pronto'`,
      );
      if (fonte.ramoId) condizioni.push(`d.ramo_id = ${par(fonte.ramoId)}`);
      if (fonte.compagniaId) condizioni.push(`d.compagnia_id = ${par(fonte.compagniaId)}`);
      /* I preferiti sono per utente: per un agente valgono quelli di chi
         l'ha creato — è la sua selezione che l'agente monitora. */
      if (fonte.soloPreferiti) {
        condizioni.push(
          `exists (select 1 from velia.preferiti p where p.documento_id = d.id and p.utente_id = ${par(creatoDa)})`,
        );
      }
      const r = await db.query<DocumentoRisolto>(
        `select d.id, d.titolo from velia.documenti d where ${condizioni.join(' and ')} order by d.id`,
        parametri,
      );
      aggiungi(r.rows);
    } else {
      const r = await db.query<DocumentoRisolto>(
        `select d.id, d.titolo from velia.riferimenti rf
         join velia.documenti d on d.id = rf.documento_id
         where rf.tenant_id = $1 and rf.attivo and d.stato = 'pronto' and d.path_md is not null
         order by rf.created_at`,
        [tenantId],
      );
      aggiungi(r.rows);
    }
  }
  return risolti;
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

async function titoloDocumento(db: pg.Pool, id: string): Promise<string> {
  const r = await db.query<{ titolo: string }>(`select titolo from velia.documenti where id = $1`, [id]);
  return r.rows[0]?.titolo ?? id;
}

async function valoriParametri(
  db: pg.Pool,
  lavoro: RigaLavoro,
): Promise<Array<{ etichetta: string; valore: string }>> {
  const valori: Array<{ etichetta: string; valore: string }> = [];
  for (const parametro of lavoro.parametri) {
    const grezzo = lavoro.parametri_avvio?.[parametro.chiave];
    if (!grezzo) continue;
    valori.push({
      etichetta: parametro.etichetta,
      valore: parametro.tipo === 'documento' ? `il documento «${await titoloDocumento(db, grezzo)}»` : grezzo,
    });
  }
  return valori;
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
