import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  DestinatarioEmail,
  DocumentoGenerato,
  ErroreApi,
  EsportazioneElaborata,
  EventoStream,
  Id,
  IsoDateTime,
  Messaggio,
  ModoAllegato,
  PropostaArchivio,
  RicordoAppreso,
  RiferimentoDocumento,
  StatoAllegato,
  TemplateOutput,
} from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';
import { NotificheStore } from '@core/notifiche/notifiche-store';
import {
  SCELTE_ESPORTA_COME,
  SceltaEsportazione,
  nomeFileEsportazione,
} from '@shared/esportazione/scelte-esportazione';

/** Come sta la lettura di un documento appena allegato. */
export interface StatoElaborazioneAllegato {
  stato: 'lavorazione' | 'errore';
  messaggio?: string;
}

/** Ogni quanto si chiede al server se ha finito di leggere l'allegato. */
const MS_ATTESA_INGESTION = 2000;

/**
 * Oltre questo si smette di chiedere: un set di duecento pagine può
 * prendersi molto, ma un battito che non finisce mai è un battito rotto.
 */
const TETTO_ATTESA_MS = 10 * 60_000;

/**
 * Un file allegato dal composer, nel tratto di strada fra la scelta e il
 * contesto: mentre sale è un chip in attesa, appena il server risponde
 * **sparisce da qui** perché è diventato un riferimento del contesto come
 * gli altri. Resta solo se qualcosa va storto.
 */
export interface AllegatoInCorso {
  chiave: number;
  nome: string;
  stato: 'caricamento' | 'errore';
  messaggio?: string;
  /** L'immagine incollata, come `data:` URL: il chip la mostra al posto dell'icona. */
  anteprima?: string;
}

/**
 * Un messaggio in streaming è un messaggio con due informazioni in più che il
 * contratto non ha, perché esistono solo mentre il flusso è aperto: l'errore
 * arrivato a metà risposta e l'interruzione chiesta dall'utente.
 */
export interface MessaggioInStream extends Messaggio {
  erroreStream?: string;
  interrotto?: boolean;
  /** L'ultimo passo di lavoro del motore, finché il testo non arriva. */
  attivita?: string;
  /** RF-G-01: ciò che la memoria ha imparato da questo scambio (vive solo nello stream). */
  ricordiAppresi?: RicordoAppreso[];
}

/**
 * Un documento prodotto dalla conversazione, con l'ora della risposta che
 * l'ha generato.
 *
 * La data non è decorazione: della stessa proposta si finisce per generare
 * tre versioni nella stessa mezz'ora, con lo stesso nome e lo stesso
 * template, e l'ora è l'unica cosa che le distingue nell'elenco.
 */
export interface OutputConversazione extends DocumentoGenerato {
  prodottoIl: IsoDateTime;
}

/** La coppia domanda/risposta che sta attraversando lo stream. */
interface StreamAttivo {
  conversazioneId: Id;
  /**
   * Manca quando ci si riaggancia a una risposta partita altrove: la
   * domanda è già persistita e arriva coi messaggi caricati, non c'è una
   * copia ottimistica da riconciliare.
   */
  utente?: Messaggio;
  assistente?: MessaggioInStream;
  /**
   * I documenti referenziati col messaggio in volo: il server li ha già
   * messi nel contesto, ma l'elenco locale si ricarica solo a fine stream —
   * finché dura, i titoli dei chip si risolvono da qui.
   */
  riferimenti: RiferimentoDocumento[];
}

/**
 * Stato della sezione Chat.
 *
 * Fornito a livello di rotta: lo streaming sopravvive alla navigazione fra
 * conversazioni — una risposta lunga non muore perché l'utente è andato a
 * rileggere un'altra conversazione — e si chiude uscendo dalla sezione.
 *
 * A differenza degli archivi, i **messaggi non passano da `httpResource`**:
 * durante lo streaming la stessa lista cambia decine di volte al secondo per
 * eventi che non sono richieste HTTP, e farla convivere con una risorsa che
 * si ricarica da sola significherebbe due fonti di verità da riconciliare a
 * ogni evento. Qui la fonte è una: il segnale, e lo stream lo aggiorna.
 */
@Injectable()
export class ChatStore {
  private readonly api = inject(ConversazioniApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly notifiche = inject(NotificheStore);

  /* Lo storico sta in `core`, condiviso con la barra laterale che lo mostra
     sotto la voce Chat: qui lo si legge e lo si ricarica dopo le scritture. */
  private readonly storico = inject(StoricoConversazioni);

  readonly conversazioni = this.storico.conversazioni;

  /** I battiti che seguono l'ingestion degli allegati, per documento. */
  private readonly battitiIngestion = new Map<Id, ReturnType<typeof setInterval>>();

  /** I documenti già seguiti fino in fondo: l'elenco può restare indietro. */
  private readonly letture = new Set<Id>();

  constructor() {
    /* Un documento del contesto ancora in lettura (allegato da un'altra
       finestra, o da questa prima di un refresh): il chip riprende a girare
       da solo. Lo stato viaggia col contesto, quindi basta guardarlo ogni
       volta che l'elenco si aggiorna. */
    effect(() => {
      for (const riferimento of this.attiva()?.documentiInContesto ?? []) {
        if (!riferimento.stato || riferimento.stato === 'pronto') continue;
        if (this.letture.has(riferimento.id) || this.battitiIngestion.has(riferimento.id)) continue;
        if (riferimento.stato === 'errore') {
          this.segna(riferimento.id, { stato: 'errore', messaggio: 'elaborazione fallita' });
          this.letture.add(riferimento.id);
        } else {
          this.segui(riferimento);
        }
      }
    });

    inject(DestroyRef).onDestroy(() => {
      for (const battito of this.battitiIngestion.values()) clearInterval(battito);
      this.battitiIngestion.clear();
      /* Si esce dalla sezione: si smette di ascoltare, non di rispondere.
         Il motore prosegue e al ritorno ci si riaggancia. */
      this.sottoscrizioneStream?.unsubscribe();
    });
  }

  // --- Template di output (RF-C-10) ---------------------------------------

  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() => this.api.urlTemplate());

  readonly template = computed(() =>
    this.risorsaTemplate.hasValue() ? this.risorsaTemplate.value() : [],
  );

  /** Le voci dell'«Esporta come»: Word, PDF, testo semplice. */
  readonly scelteEsportazione = SCELTE_ESPORTA_COME;

  /** Esporta una risposta nel formato scelto e avvia il download, col titolo della conversazione come nome. */
  esporta(messaggioId: Id, scelta: SceltaEsportazione): void {
    const id = this.idAttiva();
    if (!id) return;
    this.api.esporta(id, messaggioId, scelta.scelta).subscribe({
      next: (blob) => scaricaBlob(blob, nomeFileEsportazione(this.attiva()?.titolo ?? 'risposta', scelta.formato)),
    });
  }

  // --- Invia email ----------------------------------------------------------

  readonly emailInInvio = signal(false);

  /**
   * «Invia email»: il server compone la risposta con le fonti e la spedisce
   * a me o all'indirizzo dato. L'esito arriva come notifica; l'errore lo
   * dice già l'interceptor. Torna `true` a invio riuscito, per chiudere il
   * modulo.
   */
  inviaEmail(messaggioId: Id, a: DestinatarioEmail, fatto?: () => void): void {
    const id = this.idAttiva();
    if (!id || this.emailInInvio()) return;
    this.emailInInvio.set(true);
    this.api.inviaEmail(id, messaggioId, a).subscribe({
      next: (esito) => {
        this.emailInInvio.set(false);
        this.notifiche.aggiungi({
          gravita: 'successo',
          titolo: esito.simulata ? 'Email simulata' : 'Email inviata',
          dettaglio: esito.simulata ? `A ${esito.a}: su questo ambiente l'invio non è configurato.` : `A ${esito.a}.`,
        });
        fatto?.();
      },
      error: () => this.emailInInvio.set(false),
    });
  }

  // --- Riordino dell'archivio proposto in chat ----------------------------

  /** Le proposte su cui si sta decidendo: il loro messaggio mostra i pulsanti fermi. */
  private readonly proposteInDecisione = signal<ReadonlySet<Id>>(new Set());

  inDecisione(propostaId: Id): boolean {
    return this.proposteInDecisione().has(propostaId);
  }

  /**
   * Approva o annulla il riordino proposto. Approvare è la prima e unica
   * scrittura sull'archivio di tutta la catena: il motore ha soltanto
   * chiesto, e fino a questo clic non era successo niente.
   */
  decidiProposta(proposta: PropostaArchivio, decisione: 'approva' | 'annulla'): void {
    const id = this.idAttiva();
    if (!id || proposta.stato !== 'proposta' || this.inDecisione(proposta.id)) return;
    this.proposteInDecisione.update((p) => new Set(p).add(proposta.id));

    const finito = (): void =>
      this.proposteInDecisione.update((p) => {
        const senza = new Set(p);
        senza.delete(proposta.id);
        return senza;
      });

    this.api.decidiProposta(id, proposta.id, decisione).subscribe({
      next: (esito) => {
        finito();
        this.segnaProposta(esito.proposta);
        if (decisione === 'annulla') return;
        this.notifiche.aggiungi({
          gravita: esito.mancate.length ? 'informazione' : 'successo',
          titolo: esito.mancate.length ? 'Riordino applicato in parte' : 'Archivio aggiornato',
          dettaglio: esito.mancate.length
            ? esito.mancate.join('; ')
            : `${esito.fatte} ${esito.fatte === 1 ? 'operazione eseguita' : 'operazioni eseguite'}.`,
        });
      },
      error: () => finito(),
    });
  }

  /** Lo stato deciso si scrive dove vive il messaggio: caricato o ancora in streaming. */
  private segnaProposta(proposta: PropostaArchivio): void {
    this.messaggiCaricati.update((caricati) =>
      (caricati ?? []).map((m) => (m.proposta?.id === proposta.id ? { ...m, proposta } : m)),
    );
    const stream = this.streamAttivo();
    if (stream?.assistente?.proposta?.id === proposta.id) {
      this.aggiornaAssistente((m) => ({ ...m, proposta }));
    }
  }

  // --- Output della conversazione -----------------------------------------

  /**
   * Tutto ciò che la conversazione ha prodotto, dal più recente.
   *
   * Si deriva dai messaggi e non da una chiamata sua: i documenti generati
   * vivono già sul messaggio che li ha prodotti — ci arrivano con l'evento
   * `documento` mentre la risposta scorre, e tornano dal server al
   * ricaricamento. Una seconda fonte di verità qui vorrebbe dire tenerle
   * allineate a ogni evento dello stream, per nessun guadagno.
   */
  readonly output = computed<OutputConversazione[]>(() => {
    const visti = new Set<Id>();
    const prodotti: OutputConversazione[] = [];
    for (const m of this.messaggi()) {
      for (const d of m.documenti ?? []) {
        if (visti.has(d.id)) continue;
        visti.add(d.id);
        prodotti.push({ ...d, prodottoIl: m.inviatoIl });
      }
    }
    return prodotti.reverse();
  });

  /** L'id del documento che sta scendendo: la sua riga aspetta, le altre no. */
  readonly documentoInScaricamento = signal<Id | undefined>(undefined);

  /**
   * Scarica un documento generato. Passa da `HttpClient` e non da un link
   * nudo: il token viaggia nell'intercettore, e un `<a href>` non ce l'ha.
   */
  scaricaDocumento(documento: DocumentoGenerato): void {
    const id = this.idAttiva();
    if (!id || this.documentoInScaricamento()) return;
    this.documentoInScaricamento.set(documento.id);
    this.api.scaricaDocumento(id, documento.id).subscribe({
      next: (blob) => {
        scaricaBlob(blob, nomeFileEsportazione(documento.nome, documento.formato));
        this.documentoInScaricamento.set(undefined);
      },
      error: () => this.documentoInScaricamento.set(undefined),
    });
  }

  /** RF-C-15: condivide (o smette di condividere) con i colleghi del tenant. */
  condividi(id: Id, condivisa: boolean): void {
    this.api.condividi(id, condivisa).subscribe({ next: () => this.storico.ricarica() });
  }

  // --- Conversazione attiva -----------------------------------------------

  readonly idAttiva = signal<Id | undefined>(undefined);

  /** L'elenco contiene tutte le conversazioni: il dettaglio si pesca da lì. */
  readonly attiva = computed(() => this.conversazioni().find((c) => c.id === this.idAttiva()));

  private readonly messaggiCaricati = signal<Messaggio[] | undefined>(undefined);
  readonly messaggiInCaricamento = signal(false);
  readonly erroreMessaggi = signal<ErroreApi | undefined>(undefined);

  /**
   * Apre una conversazione (o nessuna, per la schermata «nuova»).
   *
   * Il confronto con l'id già attivo non è un'ottimizzazione: quando `invia()`
   * crea la conversazione e naviga, l'effetto del componente richiama questo
   * metodo con lo stesso id, e ricaricare in quel momento porterebbe via il
   * messaggio ottimistico appena mostrato.
   */
  apri(id: Id | undefined): void {
    if (id === this.idAttiva()) return;
    this.idAttiva.set(id);
    this.messaggiCaricati.set(undefined);
    this.erroreMessaggi.set(undefined);
    if (id) {
      this.caricaMessaggi(id);
      this.riaggancia(id);
    }
  }

  /**
   * Si riattacca alla risposta che questa conversazione sta già producendo.
   *
   * Un refresh, un cambio di sezione, il telefono ripreso in mano: il lavoro
   * è del server e non si è fermato. Il ponte riconsegna prima gli eventi
   * già emessi e poi prosegue in diretta, così la risposta si riforma dal
   * principio invece di apparire dal nulla a cose fatte. Senza niente in
   * volo il server risponde 204 e qui non succede nulla.
   *
   * Se uno stream è già aperto non si tocca: sta scorrendo, e magari è di
   * un'altra conversazione — attraversare la navigazione è il suo mestiere.
   */
  private riaggancia(id: Id): void {
    if (this.streamAttivo()) return;
    const iscrizione = new Subscription();
    this.sottoscrizioneStream = iscrizione;
    iscrizione.add(
      this.api.eventi(id).subscribe({
        next: (evento) => {
          if (evento.tipo === 'inizio' && !this.streamAttivo()) {
            this.streamAttivo.set({ conversazioneId: id, riferimenti: [] });
            this.storico.segnalaRisposta(id, true);
          }
          this.applica(evento);
        },
        /* La rete è caduta o il server ha chiuso: quel che c'era resta
           scritto, e la conversazione si rilegge dal database. */
        error: () => {
          if (this.streamAttivo()?.conversazioneId !== id) return;
          this.streamAttivo.set(undefined);
          this.storico.segnalaRisposta(id, false);
          this.ricaricaMessaggi();
        },
      }),
    );
  }

  ricaricaMessaggi(): void {
    const id = this.idAttiva();
    if (id) this.caricaMessaggi(id);
  }

  private caricaMessaggi(id: Id): void {
    this.messaggiInCaricamento.set(true);
    this.api.messaggi(id).subscribe({
      next: (messaggi) => {
        /* Nel frattempo l'utente può aver cambiato conversazione: una
           risposta arrivata in ritardo non deve sovrascrivere quella nuova. */
        if (this.idAttiva() !== id) return;
        this.messaggiCaricati.set(messaggi);
        this.messaggiInCaricamento.set(false);
      },
      error: (err: HttpErrorResponse) => {
        if (this.idAttiva() !== id) return;
        this.erroreMessaggi.set(
          (err.error as ErroreApi | null) ?? {
            codice: 'ERRORE',
            messaggio: 'La conversazione non si è caricata.',
          },
        );
        this.messaggiInCaricamento.set(false);
      },
    });
  }

  // --- Streaming ----------------------------------------------------------

  private readonly streamAttivo = signal<StreamAttivo | undefined>(undefined);
  private sottoscrizioneStream?: Subscription;

  /** Vero mentre una risposta sta arrivando: il composer aspetta. */
  readonly inRisposta = computed(() => {
    const stream = this.streamAttivo();
    return !!stream && stream.assistente?.inCorso !== false;
  });

  /**
   * I messaggi da mostrare: quelli caricati più la coppia in streaming, se
   * appartiene alla conversazione aperta. Le copie già persistite della
   * coppia si escludono per id: dopo la riconciliazione dell'evento `inizio`
   * un ricaricamento non produce doppioni.
   */
  readonly messaggi = computed<MessaggioInStream[]>(() => {
    const caricati = this.messaggiCaricati() ?? [];
    const stream = this.streamAttivo();
    if (!stream || stream.conversazioneId !== this.idAttiva()) return caricati;

    const inStream = new Set([stream.utente?.id, stream.assistente?.id]);
    return [
      ...caricati.filter((m) => !inStream.has(m.id)),
      ...(stream.utente ? [stream.utente] : []),
      ...(stream.assistente ? [stream.assistente] : []),
    ];
  });

  // --- Composizione -------------------------------------------------------

  /** Il testo in composizione vive qui: se l'invio fallisce, torna indietro. */
  readonly bozza = signal('');

  /** RF-C-02: i documenti scelti col selettore `@`, in attesa dell'invio. */
  readonly riferimentiBozza = signal<RiferimentoDocumento[]>([]);

  // --- «Scrivi il prompt» ---------------------------------------------------

  readonly promptInScrittura = signal(false);

  /** L'abbozzo dell'utente prima della riscrittura, finché la bozza è ancora il prompt generato. */
  private readonly promptOriginale = signal<{ abbozzo: string; generato: string } | undefined>(undefined);

  /** Si può tornare al testo dell'utente: il prompt è in bozza così com'è uscito. */
  readonly promptRipristinabile = computed(() => {
    const p = this.promptOriginale();
    return !!p && this.bozza() === p.generato;
  });

  /**
   * L'abbozzo riscritto come richiesta completa: prende la bozza, i
   * documenti referenziati e quelli nel contesto (per nominarli) e mette il
   * risultato al posto del testo; l'abbozzo resta a portata di «Ripristina».
   */
  generaPrompt(): void {
    const abbozzo = this.bozza().trim();
    if (this.promptInScrittura()) return;
    if (!abbozzo) {
      this.notifiche.aggiungi({
        gravita: 'informazione',
        titolo: 'Scrivi prima due parole',
        dettaglio: 'La bacchetta le trasforma in una richiesta completa per Velia.',
      });
      return;
    }
    const documenti = [
      ...this.riferimentiBozza().map((r) => r.id),
      ...(this.attiva()?.documentiInContesto ?? []).map((r) => r.id),
    ];
    this.promptInScrittura.set(true);
    this.api.generaPrompt(abbozzo, [...new Set(documenti)]).subscribe({
      next: ({ prompt }) => {
        this.promptInScrittura.set(false);
        if (!prompt.trim()) return;
        this.promptOriginale.set({ abbozzo: this.bozza(), generato: prompt });
        this.bozza.set(prompt);
      },
      error: () => this.promptInScrittura.set(false),
    });
  }

  ripristinaAbbozzo(): void {
    const p = this.promptOriginale();
    if (!p) return;
    this.promptOriginale.set(undefined);
    this.bozza.set(p.abbozzo);
  }

  // --- La dettatura ---------------------------------------------------------

  readonly trascrizioneInCorso = signal(false);

  /**
   * L'audio del microfono al server, il testo in coda alla bozza (con uno
   * spazio, se c'era già qualcosa). L'errore lo dice l'interceptor; qui si
   * spegne solo l'attesa.
   */
  trascrivi(audio: Blob): void {
    if (!audio.size || this.trascrizioneInCorso()) return;
    this.trascrizioneInCorso.set(true);
    this.api.trascrivi(audio).subscribe({
      next: ({ testo }) => {
        this.trascrizioneInCorso.set(false);
        const dettato = testo.trim();
        if (!dettato) {
          this.notifiche.aggiungi({ gravita: 'informazione', titolo: 'Non ho sentito niente', dettaglio: 'Riprova parlando più vicino al microfono.' });
          return;
        }
        const prima = this.bozza();
        this.bozza.set(prima.trim() ? `${prima.replace(/\s+$/, '')} ${dettato}` : dettato);
      },
      error: () => this.trascrizioneInCorso.set(false),
    });
  }

  /** I riferimenti del messaggio in volo: contesto già vero sul server, non ancora nell'elenco locale. */
  readonly riferimentiInVolo = computed(() => this.streamAttivo()?.riferimenti ?? []);

  aggiungiRiferimento(documento: RiferimentoDocumento): void {
    this.riferimentiBozza.update((r) =>
      r.some((d) => d.id === documento.id) ? r : [...r, documento],
    );
  }

  rimuoviRiferimento(id: Id): void {
    this.riferimentiBozza.update((r) => r.filter((d) => d.id !== id));
  }

  // --- Allegati (RF-C-02) -------------------------------------------------

  private progressivoAllegato = 0;

  /**
   * Un file allegato in chat **entra nell'Archivio Privato** (dal
   * 01/09/2026): il server risponde col riferimento `archivio: 'privato'` e
   * da lì il documento sta nel contesto come gli altri. Prima viveva in un
   * limbo suo, legato alla conversazione e destinato a sparire con lei; ma
   * un preventivo che il cliente ha mandato è materiale dell'agenzia, e
   * doverlo ricaricare per ritrovarlo era una perdita, non una pulizia.
   * (Un'immagine incollata fa eccezione e resta della sola chat: si sceglie
   * dal composer, non da qui.)
   *
   * Finito il caricamento la voce sparisce da questa lista, ma il chip
   * **resta nel composer** come riferimento della bozza: è la prova visiva
   * di ciò che si è allegato, e vale sia in una conversazione aperta sia
   * prima che ne esista una.
   */
  readonly allegati = signal<AllegatoInCorso[]>([]);

  /**
   * I documenti allegati che il server sta ancora leggendo.
   *
   * Il 201 del caricamento dice che il file è arrivato, non che è
   * consultabile: da lì comincia l'ingestion, che con la lettura visiva dura
   * minuti su un documento lungo. Prima quel tratto era invisibile — chip
   * pulito, documento non ancora leggibile — e la chat rispondeva «non ne ho
   * il contenuto» senza che nessuno capisse perché. Ora il chip lo dice.
   */
  readonly elaborazioni = signal<Map<Id, StatoElaborazioneAllegato>>(new Map());

  /**
   * L'anteprima delle immagini incollate, per documento.
   *
   * Di uno screenshot il nome non dice niente («Immagine incollata 9.05»):
   * la miniatura è l'unico modo di riconoscere quale immagine si è
   * attaccata, quando se ne attacca più d'una. Sta qui e non sul server
   * perché il file ce l'abbiamo già in mano: l'immagine è quella che è
   * appena passata da questo browser.
   */
  private readonly anteprime = new Map<Id, string>();

  /** Quante anteprime si tengono in memoria: sono `data:` URL, non miniature vere. */
  private static readonly MASSIME_ANTEPRIME = 12;

  anteprima(documentoId: Id): string | undefined {
    return this.anteprime.get(documentoId);
  }

  allega(file: File[], modo: ModoAllegato): void {
    for (const f of file) {
      const chiave = ++this.progressivoAllegato;
      this.allegati.update((a) => [...a, { chiave, nome: f.name, stato: 'caricamento' }]);
      /* L'anteprima arriva quando arriva: il chip nasce subito con l'icona e
         si ridisegna da solo appena il file è letto. */
      const anteprima = leggiAnteprima(f);
      void anteprima.then((dati) => {
        if (!dati) return;
        this.allegati.update((a) =>
          a.map((allegato) => (allegato.chiave === chiave ? { ...allegato, anteprima: dati } : allegato)),
        );
      });

      this.api.caricaAllegato(f, modo).subscribe({
        next: (riferimento) => {
          /* Si aspetta l'anteprima prima di passare il documento al
             contesto: il chip del riferimento si costruisce una volta sola,
             e un'anteprima che arriva dopo non lo ridisegnerebbe. La
             lettura del file è partita all'incolla e il caricamento dura
             mille volte tanto: qui la promessa è già mantenuta. */
          void anteprima.then((dati) => {
            if (dati) this.ricordaAnteprima(riferimento.id, dati);
            this.rimuoviAllegato(chiave);
            /* Il chip resta nel composer, come per un documento scelto con
               «@». Prima spariva nell'istante in cui il caricamento
               riusciva, perché il documento «era già nel contesto»: ma il
               contesto è il pannello a destra, che si può comprimere e che
               comunque si ricarica un attimo dopo. Il risultato era il
               peggiore possibile — alleghi, il chip gira, e poi non c'è più
               niente da nessuna parte — proprio mentre il documento era
               arrivato benissimo. Quello che hai appena allegato si vede
               dove lo hai allegato, finché non mandi il messaggio. */
            this.aggiungiRiferimento(riferimento);
            this.aggiungiAlContesto(riferimento);
            this.segui(riferimento);
          });
        },
        error: (err: HttpErrorResponse) => {
          const messaggio =
            (err.error as ErroreApi | null)?.messaggio ?? 'Caricamento non riuscito.';
          this.allegati.update((a) =>
            a.map((allegato) =>
              allegato.chiave === chiave ? { ...allegato, stato: 'errore', messaggio } : allegato,
            ),
          );
        },
      });
    }
  }

  /** L'anteprima più vecchia se ne va: sono immagini intere tenute in memoria. */
  private ricordaAnteprima(documentoId: Id, dati: string): void {
    this.anteprime.set(documentoId, dati);
    while (this.anteprime.size > ChatStore.MASSIME_ANTEPRIME) {
      const piuVecchia = this.anteprime.keys().next().value;
      if (piuVecchia === undefined) break;
      this.anteprime.delete(piuVecchia);
    }
  }

  /** Solo per gli allegati falliti: quelli sani se ne vanno da soli. */
  rimuoviAllegato(chiave: number): void {
    this.allegati.update((a) => a.filter((allegato) => allegato.chiave !== chiave));
  }

  /**
   * Segue l'ingestion di un documento appena allegato finché non è pronto.
   *
   * Interroga la scheda del documento privato ogni paio di secondi, come fa
   * la pagina di un'esecuzione di agente. Si ferma da sola: quando il
   * documento è pronto (il chip torna normale), quando fallisce (il chip lo
   * dice) o dopo `TETTO_ATTESA_MS`, che su un documento lunghissimo evita di
   * interrogare il server per sempre.
   */
  private segui(riferimento: RiferimentoDocumento): void {
    const id = riferimento.id;
    /* Due schede diverse per lo stesso stato: il documento privato ha la sua,
       l'allegato di conversazione ha la rotta dedicata. */
    const url =
      riferimento.archivio === 'privato'
        ? this.apiPrivati.urlDettaglio(id)
        : this.api.urlStatoAllegato(id);
    this.segna(id, { stato: 'lavorazione' });
    const scadenza = Date.now() + TETTO_ATTESA_MS;

    const battito = setInterval(() => {
      this.http.get<StatoAllegato>(url).subscribe({
        next: (documento) => {
          if (documento.stato === 'pronto') {
            this.smettiDiSeguire(id);
            return;
          }
          if (documento.stato === 'errore') {
            this.segna(id, {
              stato: 'errore',
              messaggio: documento.erroreElaborazione ?? 'elaborazione fallita',
            });
            this.letture.add(id);
            this.fermaBattito(id);
            return;
          }
          if (Date.now() > scadenza) this.fermaBattito(id);
        },
        /* Il documento non c'è più (eliminato altrove) o la rete è caduta:
           si smette di chiedere, il chip resta com'è. */
        error: () => this.fermaBattito(id),
      });
    }, MS_ATTESA_INGESTION);
    this.battitiIngestion.set(id, battito);
  }

  private segna(id: Id, stato: StatoElaborazioneAllegato): void {
    this.elaborazioni.update((m) => new Map(m).set(id, stato));
  }

  private fermaBattito(id: Id): void {
    const battito = this.battitiIngestion.get(id);
    if (battito !== undefined) clearInterval(battito);
    this.battitiIngestion.delete(id);
  }

  private smettiDiSeguire(id: Id): void {
    this.letture.add(id);
    this.fermaBattito(id);
    this.elaborazioni.update((m) => {
      const senza = new Map(m);
      senza.delete(id);
      return senza;
    });
  }

  /**
   * Invia la bozza. Se non c'è una conversazione aperta prima ne crea una e
   * ci naviga: il titolo arriverà dal primo messaggio.
   */
  invia(): void {
    const testo = this.bozza().trim();
    if (!testo || this.inRisposta()) return;

    const riferimenti = this.riferimentiBozza();
    this.bozza.set('');
    this.riferimentiBozza.set([]);

    const id = this.idAttiva();
    if (id) {
      this.avviaStream(id, testo, riferimenti);
      return;
    }

    this.api.crea().subscribe({
      next: (conversazione) => {
        /* L'id si imposta prima di navigare: così `apri()` riconosce la
           conversazione come già aperta e non ricarica nulla. */
        this.idAttiva.set(conversazione.id);
        this.messaggiCaricati.set([]);
        this.storico.ricarica();
        void this.router.navigate(['/chat', conversazione.id]);
        this.avviaStream(conversazione.id, testo, riferimenti);
      },
      error: () => this.ripristinaBozza(testo, riferimenti),
    });
  }

  /**
   * «Genera documento da template»: un messaggio che chiede un documento.
   * Viaggia sullo stesso stream della chat (attività, documento, fine), così
   * il filo mostra il lavoro del motore documentale e l'allegato quando è
   * pronto.
   */
  inviaEsportazione(richiesta: EsportazioneElaborata, descrizione: string): void {
    const id = this.idAttiva();
    if (!id || this.inRisposta()) return;
    this.avviaStream(id, `Genera documento da template: ${descrizione}`, [], richiesta);
  }

  private avviaStream(
    id: Id,
    testo: string,
    riferimenti: RiferimentoDocumento[],
    esportazione?: EsportazioneElaborata,
  ): void {
    const stream: StreamAttivo = {
      conversazioneId: id,
      utente: {
        id: `locale-${Date.now()}`,
        conversazioneId: id,
        autore: 'utente',
        testo,
        inviatoIl: new Date().toISOString(),
        documentiReferenziati: riferimenti.map((r) => r.id),
        citazioni: [],
        provenienze: [],
      },
      riferimenti,
    };
    this.streamAttivo.set(stream);
    this.storico.segnalaRisposta(id, true);

    this.sottoscrizioneStream = this.api
      .invia(id, {
        testo,
        documentiReferenziati: riferimenti.map((r) => r.id),
        ...(esportazione && { esportazione }),
      })
      .subscribe({
        next: (evento) => this.applica(evento),
        error: () => {
          /* Errore prima che lo stream partisse (validazione, rete): il
             messaggio non è mai arrivato al server. La bozza torna al
             composer; ad avvisare ci ha già pensato l'interceptor. */
          this.streamAttivo.set(undefined);
          this.storico.segnalaRisposta(id, false);
          this.ripristinaBozza(testo, riferimenti);
        },
      });
  }

  private applica(evento: EventoStream): void {
    const stream = this.streamAttivo();
    if (!stream) return;

    /* Tutto ciò che segue il testo (fonti, provenienze, memoria, documenti,
       fine, errore) lo vuole già scritto: si svuota la dattilografia prima.
       Le attività no: possono scorrere mentre il testo sta ancora uscendo. */
    if (evento.tipo !== 'testo' && evento.tipo !== 'attivita') this.svuotaTesto();

    switch (evento.tipo) {
      case 'inizio':
        this.streamAttivo.set({
          ...stream,
          ...(stream.utente && { utente: { ...stream.utente, id: evento.messaggioUtenteId } }),
          assistente: {
            id: evento.messaggioId,
            conversazioneId: stream.conversazioneId,
            autore: 'assistente',
            testo: '',
            inviatoIl: new Date().toISOString(),
            documentiReferenziati: [],
            citazioni: [],
            provenienze: [],
            inCorso: true,
          },
        });
        break;
      case 'attivita':
        this.aggiornaAssistente((m) => ({ ...m, attivita: evento.etichetta }));
        break;
      case 'testo':
        /* Il testo non si mostra com'è arrivato (chunk irregolari) ma a
           ritmo costante, come una dattilografia: vedi `dattilografa`. */
        this.codaTesto += evento.delta;
        this.dattilografa();
        break;
      case 'citazione':
        this.aggiornaAssistente((m) => ({ ...m, citazioni: [...m.citazioni, evento.citazione] }));
        break;
      case 'provenienza':
        this.aggiornaAssistente((m) => ({
          ...m,
          provenienze: [...m.provenienze, evento.provenienza],
        }));
        break;
      case 'non-supportato':
        this.aggiornaAssistente((m) => ({ ...m, nonSupportato: true }));
        break;
      case 'memoria':
        /* L'esito chiude anche l'attività «Cerco qualcosa da ricordare». */
        this.aggiornaAssistente((m) => ({ ...m, ricordiAppresi: evento.ricordi, attivita: undefined }));
        break;
      case 'documento':
        this.aggiornaAssistente((m) => ({ ...m, documenti: [...(m.documenti ?? []), evento.documento] }));
        break;
      case 'proposta':
        this.aggiornaAssistente((m) => ({ ...m, proposta: evento.proposta }));
        break;
      case 'errore':
        this.aggiornaAssistente((m) => ({ ...m, inCorso: false, erroreStream: evento.messaggio }));
        break;
      case 'fine':
        this.concludiStream();
        break;
    }
  }

  private aggiornaAssistente(modifica: (m: MessaggioInStream) => MessaggioInStream): void {
    const stream = this.streamAttivo();
    if (!stream?.assistente) return;
    this.streamAttivo.set({ ...stream, assistente: modifica(stream.assistente) });
  }

  // --- Dattilografia ------------------------------------------------------

  /**
   * Il testo arriva dal server a chunk di grandezza e ritmo irregolari (il
   * modello, il database, la rete). Mostrarlo com'è arriva a scatti; qui
   * finisce in una coda che si svuota un po' a ogni frame: pochi caratteri
   * quando la coda è corta, di più quando è lunga, così la lettura è fluida
   * e non resta mai indietro. È il ritmo delle risposte di Claude.
   */
  private codaTesto = '';
  private animazione: number | undefined;
  /** Caratteri maturati ma non ancora scritti (frazioni fra un frame e l'altro). */
  private maturati = 0;
  private ultimoFrame = 0;

  /**
   * Ritmo di base: caratteri al secondo a passo di lettura. Quando la coda
   * cresce si accelera quanto basta a smaltirla in circa un secondo e mezzo,
   * mai a scatti: la velocità dipende dal tempo, non dai frame.
   */
  private static readonly CARATTERI_AL_SECONDO = 55;
  private static readonly SECONDI_PER_SMALTIRE = 1.5;

  private dattilografa(): void {
    if (this.animazione !== undefined) return;
    this.ultimoFrame = performance.now();
    const passo = (ora: number) => {
      this.animazione = undefined;
      if (!this.codaTesto) return;
      const secondi = Math.min(0.1, Math.max(0, ora - this.ultimoFrame) / 1000);
      this.ultimoFrame = ora;
      const ritmo = Math.max(
        ChatStore.CARATTERI_AL_SECONDO,
        this.codaTesto.length / ChatStore.SECONDI_PER_SMALTIRE,
      );
      this.maturati += ritmo * secondi;
      const n = Math.min(this.codaTesto.length, Math.floor(this.maturati));
      if (n > 0) {
        this.maturati -= n;
        const pezzo = this.codaTesto.slice(0, n);
        this.codaTesto = this.codaTesto.slice(n);
        /* Il testo azzera l'attività: se il motore torna a lavorare lo dirà con un'attività nuova. */
        this.aggiornaAssistente((m) => ({ ...m, testo: m.testo + pezzo, attivita: undefined }));
      }
      if (this.codaTesto) this.animazione = requestAnimationFrame(passo);
    };
    this.animazione = requestAnimationFrame(passo);
  }

  /** Scrive subito tutto ciò che è in coda: prima di fonti, fine, errore, stop. */
  private svuotaTesto(): void {
    if (this.animazione !== undefined) {
      cancelAnimationFrame(this.animazione);
      this.animazione = undefined;
    }
    this.maturati = 0;
    if (!this.codaTesto) return;
    const resto = this.codaTesto;
    this.codaTesto = '';
    this.aggiornaAssistente((m) => ({ ...m, testo: m.testo + resto, attivita: undefined }));
  }

  /**
   * A risposta completa la coppia si consolida fra i messaggi caricati e
   * l'elenco si ricarica: titolo, contesto documentale e ordinamento sono
   * cambiati sul server (RF-C-03), e ricalcolarli qui sarebbe riscrivere la
   * logica del server.
   */
  private concludiStream(): void {
    const stream = this.streamAttivo();
    if (!stream) return;

    if (stream.conversazioneId === this.idAttiva()) {
      const consolidati = [
        ...(stream.utente ? [stream.utente] : []),
        ...(stream.assistente ? [{ ...stream.assistente, inCorso: false }] : []),
      ];
      this.messaggiCaricati.update((caricati) => {
        const ids = new Set(consolidati.map((m) => m.id));
        return [...(caricati ?? []).filter((m) => !ids.has(m.id)), ...consolidati];
      });
    }
    this.streamAttivo.set(undefined);
    this.storico.segnalaRisposta(stream.conversazioneId, false);
    this.storico.ricarica();
  }

  /**
   * Ferma la generazione, e lo dice al server.
   *
   * Fino al 01/09/2026 bastava chiudere lo stream: era comodo, ma voleva
   * dire che anche un refresh fermava il motore. Ora chiudere è solo
   * smettere di ascoltare, e fermare è un gesto con la sua rotta — il job va
   * in annullato e il worker si arresta al primo passo utile. Quel che è già
   * arrivato resta visibile, marcato come interrotto: il server non lo ha
   * registrato, e ricaricando sparirà.
   */
  ferma(): void {
    this.sottoscrizioneStream?.unsubscribe();
    this.svuotaTesto();
    const stream = this.streamAttivo();
    if (!stream) return;

    this.api.ferma(stream.conversazioneId).subscribe();
    this.storico.segnalaRisposta(stream.conversazioneId, false);
    if (stream.assistente && stream.conversazioneId === this.idAttiva()) {
      this.messaggiCaricati.update((caricati) => [
        ...(caricati ?? []),
        ...(stream.utente ? [stream.utente] : []),
        { ...stream.assistente!, inCorso: false, interrotto: true },
      ]);
    }
    this.streamAttivo.set(undefined);
  }

  private ripristinaBozza(testo: string, riferimenti: RiferimentoDocumento[]): void {
    if (!this.bozza()) this.bozza.set(testo);
    if (!this.riferimentiBozza().length) this.riferimentiBozza.set(riferimenti);
  }

  // --- Azioni sulla conversazione ----------------------------------------

  // --- Contesto documentale (RF-C-03) -------------------------------------

  aggiungiAlContesto(documento: RiferimentoDocumento): void {
    const id = this.idAttiva();
    /* Senza conversazione il contesto non esiste ancora: il documento
       aspetta nella bozza e partirà col primo messaggio. */
    if (!id) {
      this.aggiungiRiferimento(documento);
      return;
    }
    this.api.aggiungiAlContesto(id, documento.id).subscribe({
      next: () => this.storico.ricarica(),
    });
  }

  rimuoviDalContesto(documentoId: Id): void {
    const id = this.idAttiva();
    if (!id) return;
    this.api.rimuoviDalContesto(id, documentoId).subscribe({
      next: () => this.storico.ricarica(),
    });
  }
}

/** Consegna un blob al browser come file scaricato. */
function scaricaBlob(blob: Blob, nomeFile: string): void {
  const url = URL.createObjectURL(blob);
  const collegamento = document.createElement('a');
  collegamento.href = url;
  collegamento.download = nomeFile;
  collegamento.click();
  URL.revokeObjectURL(url);
}

/**
 * Oltre questo non si tiene l'immagine in memoria per l'anteprima: un
 * `data:` URL è l'immagine intera in una stringa, e per un chip da sedici
 * pixel non vale il prezzo.
 */
const MASSIMO_ANTEPRIMA_BYTE = 5 * 1024 * 1024;

/**
 * L'immagine come `data:` URL, o niente se non è un'immagine (o è troppo
 * grande). Non fallisce mai: un'anteprima mancata è un chip con l'icona di
 * sempre, non un allegato perduto.
 */
function leggiAnteprima(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/') || file.size > MASSIMO_ANTEPRIMA_BYTE) {
    return Promise.resolve(undefined);
  }
  return new Promise((risolvi) => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi(typeof lettore.result === 'string' ? lettore.result : undefined);
    lettore.onerror = () => risolvi(undefined);
    lettore.readAsDataURL(file);
  });
}
