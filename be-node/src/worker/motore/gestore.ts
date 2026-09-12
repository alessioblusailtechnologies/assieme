import type pg from 'pg';

import type {
  Citazione,
  EsportazioneElaborata,
  EventoStream,
  Provenienza,
  PropostaArchivio,
} from '../../contratto/conversazioni.js';
import { modelloDelLivello, modelloDelTenant, servitoDaAnthropic } from '../../contratto/modelli.js';
import { trascriviConversazione, type MessaggioDaTrascrivere } from '../../generazione/filo.js';
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
import { DiarioPassi } from './diario-passi.js';
import { senzaTrattiniLunghi } from './flusso-testo.js';
import {
  caricaDna,
  catalogoArchivioPubblico,
  promptRipresa,
  promptSistema,
  promptSistemaCliente,
  promptUtente,
  type MessaggioStoria,
  type ModelloNelPrompt,
} from './regole.js';
import type { EsitoSessione, Motore, PassoSessione } from './sessione.js';
import { creaStrumentiMotore, type StrumentiMotore } from './strumenti.js';
import type { GeneratoreTitolo } from './titolista.js';
import { avvisiEsposizione, avvisiRimandi, ErroreValidazione, haRimandi, separaBlocco, validaBlocco } from './validazione.js';
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
  /**
   * La radice dei link delle pagine condivise (`BASE_LINK_PAGINE`). Senza,
   * il motore non ha lo strumento `condividi_link`.
   */
  baseLinkPagine?: string;
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
  /** Il livello scelto nel composer per questo messaggio: vince su quello del tenant, solo qui. */
  livello?: string;
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
  /** Il modello chiesto per quella sessione; null = il default di piattaforma. */
  sessione_sdk_modello: string | null;
  /** La chat cliente da cui nasce la conversazione, se è una chat cliente (07/09/2026). */
  chat_cliente_id: string | null;
  /** Le istruzioni che l'agenzia ha scritto per quella chat. */
  chat_istruzioni: string | null;
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
    /*
     * Il diario dei passi si tiene qui dentro `emetti`, e non presso chi li
     * produce: le attività arrivano da quattro posti diversi (l'attesa degli
     * allegati, gli hook della sessione, la narrazione del modello, la
     * sandbox), e registrarle a monte vorrebbe dire ricordarsene in ognuno.
     * Da qui non ne sfugge nessuna, oggi né quando ne arriverà una quinta.
     */
    const diario = new DiarioPassi();

    const emetti = async (evento: EventoStream): Promise<number> => {
      if (evento.tipo === 'testo') {
        await accorpatore.aggiungi(senzaTrattiniLunghi(evento.delta));
        return 0;
      }
      await accorpatore.svuota();
      if (evento.tipo === 'attivita') {
        /* L'istante torna indietro e viaggia sull'evento: il cronometro che
           si vede durante l'attesa e quello che resta dopo dicono lo stesso. */
        evento = { ...evento, istante: diario.apri(evento.etichetta, evento.strumento) };
      }
      return emettiEvento(db, job.id, evento.tipo, evento);
    };

    const conv = await db.query<RigaConversazione>(
      `select c.id, c.tenant_id, c.documenti_in_contesto, c.sessione_sdk, c.sessione_sdk_modello,
              t.modello_motore, t.memoria_attiva,
              c.chat_cliente_id, k.istruzioni as chat_istruzioni
       from velia.conversazioni c
       join velia.tenant t on t.id = c.tenant_id
       left join velia.chat_clienti k on k.id = c.chat_cliente_id
       where c.id = $1`,
      [payload.conversazioneId],
    );
    const conversazione = conv.rows[0];
    if (!conversazione) throw new ErroreNonRitentabile(`conversazione ${payload.conversazioneId} inesistente`);
    const { tenant_id: tenantId } = conversazione;
    /* Il livello scelto nel composer vince su quello del tenant, per questo
       messaggio soltanto; undefined = il default di piattaforma. */
    const modelloTurno = modelloDelLivello(payload.livello) ?? modelloDelTenant(conversazione.modello_motore);
    const origineConsumi = conversazione.chat_cliente_id ? ('chat-cliente' as const) : ('app' as const);

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
        /* Con una chat cliente qui dentro finisce il solo cono, e non
           l'archivio dell'agenzia: è il presidio che regge da solo, perché
           su questo percorso non c'è la RLS. */
        ...(conversazione.chat_cliente_id && { chatClienteId: conversazione.chat_cliente_id }),
      });

      /* Si riprende solo se la trascrizione è ancora su questo disco (altro
         host, disco ripulito: no) e se è nata con lo stesso modello: da
         quando il livello si cambia anche dal composer, una sessione nata su
         un fornitore riletta da un altro si porta dietro firme di
         ragionamento che quello non riconosce, e la cache comunque non vale.
         Il job pieno resta il piano B, sempre. */
      const stessoModello = (conversazione.sessione_sdk_modello ?? undefined) === modelloTurno;
      const riprendi =
        dip.ripresaSessione &&
        conversazione.sessione_sdk &&
        stessoModello &&
        (await dip.ripresaSessione.esiste(conversazione.sessione_sdk))
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

      /* In una chat cliente il DNA d'Agenzia non si carica nemmeno: non
         entra nel prompt (piano §6), e leggere istruzioni e ricordi
         dell'agenzia per poi buttarli via sarebbe solo un modo per
         ritrovarseli addosso alla prossima modifica distratta. */
      const dna = conversazione.chat_cliente_id
        ? { istruzioni: [], riferimenti: [], ricordi: [] }
        : await caricaDna(
            db,
            tenantId,
            payload.utenteId,
            {
              ramiIds: [...new Set(contesto.map((c) => c.doc.ramoId).filter((x): x is string => Boolean(x)))],
              compagnieIds: [
                ...new Set(contesto.map((c) => c.doc.compagniaId).filter((x): x is string => Boolean(x))),
              ],
            },
            workspace.perPath,
          );

      /* I modelli di riferimento dell'agenzia nel prompt, con la loro riga
         «quando usarlo»: il motore sceglie da lì il modello giusto. */
      const modelliAgenzia = await db.query<ModelloNelPrompt>(
        `select nome, formato, descrizione from velia.template where tenant_id = $1 order by created_at, id`,
        [tenantId],
      );
      /* «Genera da modello» (sandbox documentale), sia dal pulsante sia
         a parole: la stessa funzione, con la workspace già materializzata. */
      const elaborata = dip.sandbox
        ? async (
            r: {
              formato?: string | undefined;
              modelloId?: string | undefined;
              istruzioni?: string | undefined;
              contenuto?: string | undefined;
              titolo?: string | undefined;
            },
            daChat = false,
          ) => {
            const e = await eseguiEsportazioneElaborata(
              {
                db,
                archivio: dip.archivio,
                avviatore: dip.sandbox!.avviatore,
                sessione: dip.sandbox!.sessione,
                workspace: workspace!,
                /* Chiamata dalla chat, la sandbox lavora dentro una risposta
                   che scrive il motore della chat: il suo testo è il
                   resoconto per lui (gli torna come esito del tool), e nella
                   bolla restano solo le attività. Prima finiva nello stream
                   e l'utente vedeva due risposte incollate, la prima sparita
                   al ricaricamento. */
                emetti: daChat ? async (ev: EventoStream) => (ev.tipo === 'testo' ? 0 : emetti(ev)) : emetti,
                annullato,
              },
              {
                tenantId,
                conversazioneId: payload.conversazioneId,
                jobId: job.id,
                formato: r.formato,
                modelloId: r.modelloId,
                istruzioni: r.istruzioni,
                contenuto: r.contenuto,
                titolo: r.titolo,
                /* La sandbox ha solo la chiave Anthropic: un livello servito
                   da un fornitore terzo lì usa il modello suo. */
                modello: modelloTurno && servitoDaAnthropic(modelloTurno) ? modelloTurno : undefined,
              },
            );
            await registraConsumi(db, tenantId, job.id, e.esito, origineConsumi);
            return e;
          }
        : undefined;

      if (payload.esportazione) {
        /* Il job È un'esportazione: niente risposta del motore di chat. */
        const richiesta = payload.esportazione;
        if (!elaborata) {
          await emetti({
            tipo: 'errore',
            messaggio: 'La generazione di documenti da modello non è disponibile in questo ambiente.',
          });
          throw new ErroreNonRitentabile('sandbox non configurata');
        }
        let contenuto: string | undefined;
        if (richiesta.ambito === 'conversazione') {
          /* Il documento si fa su tutto il filo (12/09/2026): domande e
             risposte in fila, come le legge chi ha seguito la consulenza.
             Fuori i due messaggi di questa richiesta: «Genera da modello:
             "Proposta breve"» è un comando alla macchina, non un pezzo
             della consulenza, e la risposta non è ancora stata scritta. */
          const m = await db.query<MessaggioDaTrascrivere & { autore: 'utente' | 'assistente' }>(
            `select autore, testo, citazioni from velia.messaggi
             where conversazione_id = $1 and id <> $2 order by inviato_il, id`,
            [payload.conversazioneId, payload.messaggioUtenteId],
          );
          contenuto = trascriviConversazione(m.rows).testo || undefined;
        } else if (richiesta.messaggioId) {
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
            modelloId: richiesta.modelloId,
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
          ? senzaTrattiniLunghi(separaBlocco(e.esito.testo).visibile.trim()) || 'Il documento è pronto qui sotto.'
          : `${senzaTrattiniLunghi(separaBlocco(e.esito.testo).visibile.trim())}\n\n*(Il motore documentale non ha consegnato un documento.)*`.trim();
        diario.chiudi();
        await db.query(
          `insert into velia.messaggi
             (id, conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati,
              citazioni, provenienze, non_supportato, job_id, documenti, passi)
           values ($1, $2, $3, 'assistente', $4, $5, '{}', '[]', '[]', false, $6, $7, $8)
           on conflict (id) do update set testo = excluded.testo, documenti = excluded.documenti,
             passi = excluded.passi`,
          [payload.messaggioAssistenteId, payload.conversazioneId, tenantId, payload.utenteId, testo, job.id, JSON.stringify(e.generati), JSON.stringify(diario.elenco())],
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
        richieste: {
          utente: [...storia.rows.filter((m) => m.autore === 'utente').map((m) => m.testo), payload.testo],
          agenzia: [...dna.istruzioni.map((i) => `${i.titolo} ${i.testo}`), ...dna.ricordi.map((r) => r.testo)],
        },
        /* I link delle pagine condivise, a nome di chi scrive (fase 2 di PIANO-LINK-E-FORMATI.md). */
        ...(dip.baseLinkPagine && { pagine: { baseLink: dip.baseLinkPagine, utenteId: payload.utenteId } }),
        ...(elaborata && {
          elaborata: async (r) => {
            const e = await elaborata(
              {
                formato: r.formato,
                modelloId: r.modelloId,
                istruzioni: r.istruzioni,
                contenuto: r.contenuto,
                titolo: r.titolo,
              },
              true,
            );
            /* I file consegnati dalla sandbox sono documenti della risposta di chat. */
            strumentiChat!.generati.push(...e.generati);
            strumentiChat!.percorsi.push(...e.percorsi);
            return { testo: senzaTrattiniLunghi(separaBlocco(e.esito.testo).visibile.trim()), documenti: e.generati };
          },
        }),
      });

      const contestoPrompt = {
        documenti: contesto.map(({ path, titolo, archivio }) => ({ path, titolo, archivio })),
        mancanti: workspace.mancanti.map(({ titolo, motivo }) => ({ titolo, motivo })),
        domanda: payload.testo,
      };
      /*
       * In una chat cliente cambiano tre cose insieme, e vanno insieme:
       *
       * - il prompt, perché `REGOLE_MOTORE` si apre dichiarando che si
       *   risponde «per un professionista del settore», e da lì discende
       *   tutto il resto — il gergo dato per noto, il tu, la sintesi;
       * - il DNA d'Agenzia, che resta fuori: istruzioni e ricordi sono
       *   scritti per il lavoro interno e possono contenere criteri che al
       *   cliente non vanno detti;
       * - gli strumenti, che si riducono ai tre di lettura: un cliente non
       *   genera documenti a nome dell'agenzia, non riordina il suo
       *   archivio e non le manda email.
       */
      const perCliente = Boolean(conversazione.chat_cliente_id);
      const richiestaBase = {
        directory: workspace.directory,
        titoloPer: (path: string) => workspace!.perPath.get(path)?.titolo,
        ...(modelloTurno && { modello: modelloTurno }),
        promptSistema: perCliente
          ? promptSistemaCliente(conversazione.chat_istruzioni)
          : promptSistema(dna, {
              modelli: modelliAgenzia.rows,
              conAssegnazione: true,
              catalogo: catalogoArchivioPubblico(workspace.perPath),
            }),
        ...(perCliente
          ? {}
          : { strumenti: { server: strumentiChat.server, nomi: strumentiChat.nomi } }),
      };
      const osservatore = {
        passo: async (p: PassoSessione) => {
          if (p.tipo === 'attivita')
            await emetti({
              tipo: 'attivita',
              etichetta: p.etichetta,
              /* Lo strumento arriva fin qui dall'hook PreToolUse: è ciò che
                 distingue una lettura da una ricerca nell'elenco dei passi. */
              ...(p.strumento && { strumento: p.strumento }),
            });
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
          await registraConsumi(db, tenantId, job.id, esito, origineConsumi);
          esito = await dip.motore.interroga(richiestaPiena(), osservatore);
        }
      } else {
        esito = await dip.motore.interroga(richiestaPiena(), osservatore);
      }
      if (esito.sessioneId && esito.terminato !== 'errore') {
        await db.query(
          `update velia.conversazioni set sessione_sdk = $2, sessione_sdk_modello = $3, sessione_sdk_al = now() where id = $1`,
          [payload.conversazioneId, esito.sessioneId, modelloTurno ?? null],
        );
      }

      if (esito.terminato === 'annullato') {
        /* Niente persistenza, niente `fine`: il client se n'è già andato e
           il job è `annullato` (lo ha segnato l'API). Restano audit e consumi:
           i token si sono spesi comunque. */
        await registraConsumi(db, tenantId, job.id, esito, origineConsumi);
        return;
      }

      if (esito.terminato === 'errore') {
        await registraConsumi(db, tenantId, job.id, esito, origineConsumi);
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
        testoFinale = senzaTrattiniLunghi(separaBlocco(esito.testo).visibile) + MESSAGGIO_BUDGET;
        nonSupportato = true;
        avvisi = [`budget raggiunto: ${esito.errore ?? ''}`];
        await emetti({ tipo: 'non-supportato' });
      } else {
        const { visibile, blocco, problemi } = separaBlocco(esito.testo);
        testoFinale = senzaTrattiniLunghi(visibile);
        /*
         * Un blocco mancante non è sempre una risposta da buttare, e fino al
         * 09/09/2026 lo era: un turno che consegna soltanto un documento
         * («il PDF è pronto qui sotto») non cita niente perché non afferma
         * niente, il modello chiude senza blocco, e l'utente si vedeva un
         * errore rosso con il PDF già prodotto, già pagato e già attaccato
         * alla risposta. Un blocco **vuoto**, nello stesso caso, valeva un
         * avviso: la stessa cosa detta in due modi non può avere
         * conseguenze opposte.
         *
         * Quel che si difende è l'invariante vero, «nessuna affermazione
         * senza fonte»: si scarta il turno solo se il testo richiama fonti
         * numerate che nessun blocco sostiene.
         */
        if (!blocco && haRimandi(testoFinale)) {
          await registraConsumi(db, tenantId, job.id, esito, origineConsumi);
          await emetti({
            tipo: 'errore',
            messaggio: 'La risposta richiama fonti che non ha dichiarato ed è stata scartata. Riprova a inviare la domanda.',
          });
          throw new ErroreNonRitentabile(problemi.join('; '));
        }
        if (!blocco) {
          avvisi = problemi;
        } else {
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
            await registraConsumi(db, tenantId, job.id, esito, origineConsumi);
            await emetti({
              tipo: 'errore',
              messaggio: 'La risposta citava passaggi non verificabili ed è stata scartata. Riprova a inviare la domanda.',
            });
            const dettagli = errore instanceof ErroreValidazione ? errore.dettagli.join('; ') : String(errore);
            throw new ErroreNonRitentabile(`validazione fallita: ${dettagli}`);
          }
        }
        for (const c of citazioni) await emetti({ tipo: 'citazione', citazione: c });
        for (const p of provenienze) await emetti({ tipo: 'provenienza', provenienza: p });
        if (nonSupportato) await emetti({ tipo: 'non-supportato' });
      }

      /* Persistenza solo a risposta completa (piano §3.1), poi `fine`: chi
         ricarica dopo il `fine` trova il messaggio. */
      /* L'ultimo passo si chiude qui: da adesso il motore non lavora più. */
      diario.chiudi();
      await db.query(
        `insert into velia.messaggi
           (id, conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati,
            citazioni, provenienze, non_supportato, job_id, documenti, passi)
         values ($1, $2, $3, 'assistente', $4, $5, '{}', $6, $7, $8, $9, $10, $11)
         on conflict (id) do update set testo = excluded.testo, citazioni = excluded.citazioni,
           provenienze = excluded.provenienze, non_supportato = excluded.non_supportato,
           documenti = excluded.documenti, passi = excluded.passi`,
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
          JSON.stringify(diario.elenco()),
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
      await registraConsumi(db, tenantId, job.id, esito, origineConsumi);
      /* RF-G-01: la memoria impara durante la conversazione — a risposta
         scritta, prima del `fine`, così l'utente vede il passo e l'esito.
         Un apprendimento mancato non è un errore della risposta.

         Da una chat cliente **non si impara**: ciò che un cliente racconta
         non deve entrare nel DNA d'Agenzia passando da una porta che
         nessuno sorveglia, e ritrovarselo poi in una risposta a un
         collega. Se c'è qualcosa da ricordare, lo scrive l'agenzia. */
      if (
        !conversazione.chat_cliente_id &&
        conversazione.memoria_attiva &&
        dip.estrattore &&
        !(await annullato())
      ) {
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

      /*
       * Il diario si richiude qui, non all'insert.
       *
       * Il messaggio si salva appena la risposta è completa, ma il motore
       * lavora ancora un po' dopo: cerca cosa ricordare, genera il titolo.
       * Quei passi scorrono davanti all'utente come tutti gli altri, e se
       * il diario si fermasse all'insert chi ricarica ne troverebbe uno di
       * meno di quanti ne ha visti — una differenza piccola e inspiegabile,
       * che è il genere di cosa che fa dubitare di tutto il resto.
       */
      diario.chiudi();
      await db.query(`update velia.messaggi set passi = $2 where id = $1`, [
        payload.messaggioAssistenteId,
        JSON.stringify(diario.elenco()),
      ]);

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

async function registraConsumi(
  db: pg.Pool,
  tenantId: string,
  jobId: string,
  esito: EsitoSessione,
  /* «Quanto mi costano i clienti» è una domanda diversa da «quanto mi costa
     l'agenzia», e con un link in mano a qualcun altro è la più urgente. */
  origine: 'app' | 'chat-cliente' = 'app',
): Promise<void> {
  await db.query(
    `insert into velia.consumi
       (tenant_id, job_id, origine, modello, token_input, token_output,
        token_cache_lettura, token_cache_scrittura, costo_usd)
     values ($1, $2, $9, $3, $4, $5, $6, $7, $8)`,
    [
      tenantId,
      jobId,
      esito.modello,
      esito.token.input,
      esito.token.output,
      esito.token.cacheLettura,
      esito.token.cacheScrittura,
      esito.costoUsd,
      origine,
    ],
  );
}
