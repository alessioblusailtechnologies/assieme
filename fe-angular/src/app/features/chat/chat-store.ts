import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
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
  RicordoAppreso,
  RiferimentoDocumento,
  TemplateOutput,
} from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';
import { NotificheStore } from '@core/notifiche/notifiche-store';
import {
  SCELTE_ESPORTA_COME,
  SceltaEsportazione,
  nomeFileEsportazione,
} from '@shared/esportazione/scelte-esportazione';

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
  utente: Messaggio;
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
  private readonly router = inject(Router);
  private readonly notifiche = inject(NotificheStore);

  /* Lo storico sta in `core`, condiviso con la barra laterale che lo mostra
     sotto la voce Chat: qui lo si legge e lo si ricarica dopo le scritture. */
  private readonly storico = inject(StoricoConversazioni);

  readonly conversazioni = this.storico.conversazioni;

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
    if (id) this.caricaMessaggi(id);
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

    const inStream = new Set([stream.utente.id, stream.assistente?.id]);
    return [
      ...caricati.filter((m) => !inStream.has(m.id)),
      stream.utente,
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
   */
  readonly allegati = signal<AllegatoInCorso[]>([]);

  allega(file: File[]): void {
    for (const f of file) {
      const chiave = ++this.progressivoAllegato;
      this.allegati.update((a) => [...a, { chiave, nome: f.name, stato: 'caricamento' }]);

      this.api.caricaAllegato(f).subscribe({
        next: (riferimento) => {
          this.rimuoviAllegato(chiave);
          this.aggiungiAlContesto(riferimento);
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

  /** Solo per gli allegati falliti: quelli sani se ne vanno da soli. */
  rimuoviAllegato(chiave: number): void {
    this.allegati.update((a) => a.filter((allegato) => allegato.chiave !== chiave));
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
          utente: { ...stream.utente, id: evento.messaggioUtenteId },
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
        stream.utente,
        ...(stream.assistente ? [{ ...stream.assistente, inCorso: false }] : []),
      ];
      this.messaggiCaricati.update((caricati) => {
        const ids = new Set(consolidati.map((m) => m.id));
        return [...(caricati ?? []).filter((m) => !ids.has(m.id)), ...consolidati];
      });
    }
    this.streamAttivo.set(undefined);
    this.storico.ricarica();
  }

  /**
   * Ferma la generazione (annullare la sottoscrizione interrompe la
   * richiesta). Quel che è già arrivato resta visibile, marcato come
   * interrotto: il server non lo ha registrato, e ricaricando sparirà.
   */
  ferma(): void {
    this.sottoscrizioneStream?.unsubscribe();
    this.svuotaTesto();
    const stream = this.streamAttivo();
    if (!stream) return;

    if (stream.assistente && stream.conversazioneId === this.idAttiva()) {
      this.messaggiCaricati.update((caricati) => [
        ...(caricati ?? []),
        stream.utente,
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
