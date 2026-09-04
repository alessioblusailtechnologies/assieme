import type pg from 'pg';

import type {
  Citazione,
  EsportazioneElaborata,
  EventoStream,
  Provenienza,
  PropostaArchivio,
} from '../../contratto/conversazioni.js';
import { eseguiEsportazioneElaborata, type OpzioniSessioneDocumentale } from '../sandbox/esportazione.js';
import type { AvviatoreSandbox } from '../sandbox/sandbox.js';
import type { Job } from '../coda.js';
import { ErroreNonRitentabile } from '../errori.js';
import { emettiEvento } from '../eventi.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';
import type { EstrattoreRicordi } from '../memoria/estrattore.js';
import { apprendi } from '../memoria/gestore.js';
import { AccorpatoreTesto } from './accorpatore.js';
import { ancoraCitazioni } from './ancoraggio.js';
import { caricaDna, promptRipresa, promptSistema, promptUtente, type MessaggioStoria, type TemplateNelPrompt } from './regole.js';
import type { EsitoSessione, Motore, PassoSessione } from './sessione.js';
import { creaStrumentiMotore, type StrumentiMotore } from './strumenti.js';
import type { GeneratoreTitolo } from './titolista.js';
import { avvisiEsposizione, avvisiRimandi, ErroreValidazione, separaBlocco, validaBlocco } from './validazione.js';
import { materializzaWorkspace, type Workspace } from './workspace.js';

/**
 * Il job `interrogazione` — il §4.3 del piano per intero: workspace
 * materializzata, sessione del motore coi soli tool di lettura, eventi
 * verso il FE a ogni passo, validazione dell'output, persistenza del
 * messaggio solo a risposta completa, audit e consumi.
 *
 * Il worker è l'unico scrivano: il modello produce testo, qui lo si verifica
 * e lo si scrive. Ogni messaggio è un job nuovo; il motore però riprende la
 * sessione SDK del messaggio precedente quando la sua trascrizione è ancora
 * sul disco del worker (i documenti già letti restano nel contesto, in
 * cache: follow-up a -76% di costo, misura del 26/08/2026); altrimenti la
 * storia si ricostruisce dal database (piano §4.3.5).
 */

export interface DipendenzeInterrogazione {
  motore: Motore;
  archivio: ArchivioFile;
  /** Radice di workspace e cache sul disco del worker. */
  radice: string;
  /** Il titolo sensato al posto del provvisorio; senza, resta il provvisorio. */
  generatoreTitolo?: GeneratoreTitolo;
  /** Quanto aspettare un allegato ancora in elaborazione prima di partire senza. */
  attesaAllegatiMs?: number;
  /** RF-G-01: chi impara dagli scambi a risposta data; senza, la memoria non si aggiorna. */
  estrattore?: EstrattoreRicordi;
  /**
   * L'Esportazione elaborata: la sandbox documentale e il motore con i suoi
   * tetti (più turni e più spesa della chat). Senza, il tool non c'è e una
   * richiesta esplicita risponde che non è disponibile.
   */
  sandbox?: { avviatore: AvviatoreSandbox; sessione: OpzioniSessioneDocumentale };
  /**
   * La ripresa di sessione fra un messaggio e l'altro: `esiste` dice se la
   * trascrizione di una sessione SDK è ancora su questo disco. Senza, ogni
   * messaggio riparte con la storia nel prompt.
   */
  ripresaSessione?: { esiste: (sessioneId: string) => Promise<boolean> };
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
  /** L'Esportazione elaborata chiesta dal pulsante: il job produce un documento, non una risposta. */
  esportazione?: EsportazioneElaborata;
}

interface RigaConversazione {
  id: string;
  tenant_id: string;
  documenti_in_contesto: string[];
  /** RF-D-02: il modello scelto dal tenant; null = default di piattaforma. */
  modello_motore: string | null;
  /** RF-G-01: se il tenant impara dalle conversazioni. */
  memoria_attiva: boolean;
  /** La sessione SDK dell'ultima risposta, da riprendere; null = mai risposto (o ripresa spenta). */
  sessione_sdk: string | null;
}

const MESSAGGIO_BUDGET =
  '\n\n*(Risposta parziale: il limite di ricerca previsto per una singola domanda è stato raggiunto. Prova a restringere la domanda o a indicare i documenti da consultare.)*';

export function creaGestoreInterrogazione(dip: DipendenzeInterrogazione) {
  const attesaAllegati = dip.attesaAllegatiMs ?? 120_000;

  return async function gestisciInterrogazione(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const payload = leggiPayload(job);
    /* Il testo si accorpa (stream fluido, meno scritture); ogni altro evento
       lo svuota prima, così l'ordine resta quello del modello. */
    const accorpatore = new AccorpatoreTesto((delta) =>
      emettiEvento(db, job.id, 'testo', { tipo: 'testo', delta } satisfies EventoStream),
    );
    const emetti = async (evento: EventoStream): Promise<number> => {
      if (evento.tipo === 'testo') {
        await accorpatore.aggiungi(evento.delta);
        return 0;
      }
      await accorpatore.svuota();
      return emettiEvento(db, job.id, evento.tipo, evento);
    };

    const conv = await db.query<RigaConversazione>(
      `select c.id, c.tenant_id, c.documenti_in_contesto, c.sessione_sdk, t.modello_motore, t.memoria_attiva
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
    let strumentiChat: StrumentiMotore | undefined;
    /* Una risposta che non arriva al messaggio non lascia file orfani nello Storage. */
    let documentiSalvati = false;
    try {
      workspace = await materializzaWorkspace({
        db,
        archivio: dip.archivio,
        tenantId,
        radice: dip.radice,
        jobId: job.id,
        /* La stessa directory da un messaggio all'altro: la ripresa di sessione la richiede. */
        cartella: payload.conversazioneId,
        contestoIds: conversazione.documenti_in_contesto,
      });

      /* Si riprende solo se la trascrizione è ancora su questo disco (altro
         host, disco ripulito: no): il job pieno resta il piano B, sempre. */
      const riprendi =
        dip.ripresaSessione && conversazione.sessione_sdk && (await dip.ripresaSessione.esiste(conversazione.sessione_sdk))
          ? conversazione.sessione_sdk
          : undefined;

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

      /* I template dell'agenzia nel prompt e il tool `genera_documento`:
         l'utente ottiene il file senza uscire dalla chat. */
      const templateAgenzia = await db.query<TemplateNelPrompt>(
        `select nome, formato, predefinito from velia.template where tenant_id = $1 order by created_at, id`,
        [tenantId],
      );
      /* L'Esportazione elaborata (sandbox documentale), sia dal pulsante sia
         a parole: la stessa funzione, con la workspace già materializzata. */
      const elaborata = dip.sandbox
        ? async (r: {
            formato: 'pdf' | 'docx' | 'xlsx';
            templateId?: string | undefined;
            istruzioni?: string | undefined;
            contenuto?: string | undefined;
            titolo?: string | undefined;
          }) => {
            const e = await eseguiEsportazioneElaborata(
              {
                db,
                archivio: dip.archivio,
                avviatore: dip.sandbox!.avviatore,
                sessione: dip.sandbox!.sessione,
                workspace: workspace!,
                emetti,
                annullato,
              },
              {
                tenantId,
                conversazioneId: payload.conversazioneId,
                jobId: job.id,
                formato: r.formato,
                templateId: r.templateId,
                istruzioni: r.istruzioni,
                contenuto: r.contenuto,
                titolo: r.titolo,
                modello: conversazione.modello_motore ?? undefined,
              },
            );
            await registraConsumi(db, tenantId, job.id, e.esito);
            return e;
          }
        : undefined;

      if (payload.esportazione) {
        /* Il job È un'esportazione: niente risposta del motore di chat. */
        const richiesta = payload.esportazione;
        if (!elaborata) {
          await emetti({
            tipo: 'errore',
            messaggio: 'La generazione di documenti da template non è disponibile in questo ambiente.',
          });
          throw new ErroreNonRitentabile('sandbox non configurata');
        }
        let contenuto: string | undefined;
        if (richiesta.messaggioId) {
          const m = await db.query<{ testo: string }>(
            `select testo from velia.messaggi where id = $1 and conversazione_id = $2 and autore = 'assistente'`,
            [richiesta.messaggioId, payload.conversazioneId],
          );
          contenuto = m.rows[0]?.testo;
        }
        let e;
        try {
          e = await elaborata({
            formato: richiesta.formato,
            templateId: richiesta.templateId,
            istruzioni: richiesta.istruzioni,
            contenuto,
          });
        } catch (errore) {
          /* La sandbox non è partita (Docker spento, immagine assente, Fly
             irraggiungibile) o si è persa a metà lavoro (la Machine è morta,
             il socket si è chiuso: «terminated»): il motivo, già ripulito
             dall'avviatore, va detto in chat; ritentare da capo non si fa da
             soli: è una sessione lunga, e la ripartenza la decide l'utente. */
          const grezzo = errore instanceof Error ? errore.message : String(errore);
          const motivo = /^terminated$|other side closed|socket hang up|ECONNRESET/i.test(grezzo)
            ? 'la connessione con la sandbox si è chiusa a metà lavoro'
            : grezzo;
          await emetti({ tipo: 'errore', messaggio: `Il motore documentale si è fermato: ${motivo}.` });
          throw new ErroreNonRitentabile(`sandbox: ${grezzo}`);
        }
        if (e.esito.terminato === 'annullato') return;
        if (e.esito.terminato === 'errore') {
          await dip.archivio.elimina(e.percorsi).catch(() => undefined);
          await emetti({ tipo: 'errore', messaggio: 'Il motore documentale si è interrotto.' });
          throw new ErroreNonRitentabile(e.esito.errore ?? 'sessione documentale terminata con errore');
        }
        const testo = e.generati.length
          ? separaBlocco(e.esito.testo).visibile.trim() || 'Il documento è pronto qui sotto.'
          : `${separaBlocco(e.esito.testo).visibile.trim()}\n\n*(Il motore documentale non ha consegnato un documento.)*`.trim();
        await db.query(
          `insert into velia.messaggi
             (id, conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati,
              citazioni, provenienze, non_supportato, job_id, documenti)
           values ($1, $2, $3, 'assistente', $4, $5, '{}', '[]', '[]', false, $6, $7)
           on conflict (id) do update set testo = excluded.testo, documenti = excluded.documenti`,
          [payload.messaggioAssistenteId, payload.conversazioneId, tenantId, payload.utenteId, testo, job.id, JSON.stringify(e.generati)],
        );
        documentiSalvati = true;
        await db.query(`update velia.conversazioni set updated_at = now() where id = $1`, [payload.conversazioneId]);
        await emetti({ tipo: 'fine' });
        return;
      }

      strumentiChat = creaStrumentiMotore({
        db,
        archivio: dip.archivio,
        tenantId,
        conversazioneId: payload.conversazioneId,
        messaggioId: payload.messaggioAssistenteId,
        suDocumento: async (documento) => {
          await emetti({ tipo: 'documento', documento });
        },
        /*
         * Il riordino proposto si deposita e si racconta, non si esegue. La
         * riga nasce `proposta`: diventerà `applicata` solo se qualcuno
         * clicca, e allora sarà l'API a scrivere, con la sua identità.
         */
        suProposta: async (bozza) => {
          const r = await db.query<{ id: string }>(
            `insert into velia.proposte_archivio
               (tenant_id, conversazione_id, messaggio_id, operazioni, motivo)
             values ($1, $2, $3, $4::jsonb, $5)
             returning id`,
            [
              tenantId,
              payload.conversazioneId,
              payload.messaggioAssistenteId,
              JSON.stringify(bozza.operazioni),
              bozza.motivo ?? null,
            ],
          );
          const proposta: PropostaArchivio = {
            id: r.rows[0]!.id,
            operazioni: bozza.operazioni,
            stato: 'proposta',
            ...(bozza.motivo && { motivo: bozza.motivo }),
          };
          await emetti({ tipo: 'proposta', proposta });
          return proposta;
        },
        ...(elaborata && {
          elaborata: async (r) => {
            const nomeTemplate = r.template;
            const e = await elaborata({
              formato: r.formato,
              templateId: nomeTemplate,
              istruzioni: r.istruzioni,
              contenuto: r.contenuto,
              titolo: r.titolo,
            });
            /* I file consegnati dalla sandbox sono documenti della risposta di chat. */
            strumentiChat!.generati.push(...e.generati);
            strumentiChat!.percorsi.push(...e.percorsi);
            return { testo: separaBlocco(e.esito.testo).visibile.trim(), documenti: e.generati };
          },
        }),
      });

      const contestoPrompt = {
        documenti: contesto.map(({ path, titolo, archivio }) => ({ path, titolo, archivio })),
        mancanti: workspace.mancanti.map(({ titolo, motivo }) => ({ titolo, motivo })),
        domanda: payload.testo,
      };
      const richiestaBase = {
        directory: workspace.directory,
        titoloPer: (path: string) => workspace!.perPath.get(path)?.titolo,
        ...(conversazione.modello_motore && { modello: conversazione.modello_motore }),
        promptSistema: promptSistema(dna, templateAgenzia.rows, true),
        strumenti: { server: strumentiChat.server, nomi: strumentiChat.nomi },
      };
      const osservatore = {
        passo: async (p: PassoSessione) => {
          if (p.tipo === 'attivita') await emetti({ tipo: 'attivita', etichetta: p.etichetta });
          else await emetti({ tipo: 'testo', delta: p.delta });
        },
        annullato,
      };
      const richiestaPiena = () => ({
        ...richiestaBase,
        promptUtente: promptUtente({ ...contestoPrompt, storia: storia.rows.map(({ autore, testo }) => ({ autore, testo })) }),
        ...(dip.ripresaSessione && { sessione: { persisti: true } }),
      });

      let esito: EsitoSessione;
      if (riprendi) {
        esito = await dip.motore.interroga(
          { ...richiestaBase, promptUtente: promptRipresa(contestoPrompt), sessione: { persisti: true, riprendi } },
          osservatore,
        );
        /* Una ripresa che muore prima del primo turno (trascrizione corrotta,
           SDK che non la ritrova) non deve costare la risposta: job pieno. */
        if (esito.terminato === 'errore' && esito.turni === 0 && !esito.testo) {
          await registraConsumi(db, tenantId, job.id, esito);
          esito = await dip.motore.interroga(richiestaPiena(), osservatore);
        }
      } else {
        esito = await dip.motore.interroga(richiestaPiena(), osservatore);
      }
      if (esito.sessioneId && esito.terminato !== 'errore') {
        await db.query(`update velia.conversazioni set sessione_sdk = $2, sessione_sdk_al = now() where id = $1`, [
          payload.conversazioneId,
          esito.sessioneId,
        ]);
      }

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
          /* La pagina la decide l'ancora sotto cui sta l'estratto, non il modello. */
          const ancorate = await ancoraCitazioni(workspace.directory, valido.citazioni, workspace.perPath);
          citazioni = ancorate.citazioni;
          provenienze = valido.provenienze;
          nonSupportato = valido.nonSupportato;
          avvisi = [
            ...valido.avvisi,
            ...ancorate.avvisi,
            ...avvisiEsposizione(testoFinale),
            ...avvisiRimandi(testoFinale, citazioni),
          ];
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
            citazioni, provenienze, non_supportato, job_id, documenti)
         values ($1, $2, $3, 'assistente', $4, $5, '{}', $6, $7, $8, $9, $10)
         on conflict (id) do update set testo = excluded.testo, citazioni = excluded.citazioni,
           provenienze = excluded.provenienze, non_supportato = excluded.non_supportato,
           documenti = excluded.documenti`,
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
          JSON.stringify(strumentiChat.generati),
        ],
      );
      documentiSalvati = true;
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
         scritta, prima del `fine`, così l'utente vede il passo e l'esito.
         Un apprendimento mancato non è un errore della risposta. */
      if (conversazione.memoria_attiva && dip.estrattore && !(await annullato())) {
        await emetti({ tipo: 'attivita', etichetta: 'Cerco qualcosa da ricordare' });
        try {
          const esito = await apprendi(db, dip.estrattore, payload.conversazioneId, job.id);
          if (esito.appresi.length) await emetti({ tipo: 'memoria', ricordi: esito.appresi });
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

      /* I suggerimenti della home non si scrivono più qui (29/08/2026): non
         sono «le prossime domande» di questa conversazione ma domande di
         partenza sul contesto dell'agenzia, generate dall'API. */
      await emetti({ tipo: 'fine' });
    } finally {
      if (!documentiSalvati && strumentiChat?.percorsi.length) {
        await dip.archivio.elimina(strumentiChat.percorsi).catch(() => undefined);
      }
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
