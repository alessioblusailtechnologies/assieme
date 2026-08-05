import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  ErroreApi,
  EventoStream,
  Id,
  Messaggio,
  RiferimentoDocumento,
  TemplateOutput,
} from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';

/**
 * Un messaggio in streaming è un messaggio con due informazioni in più che il
 * contratto non ha, perché esistono solo mentre il flusso è aperto: l'errore
 * arrivato a metà risposta e l'interruzione chiesta dall'utente.
 */
export interface MessaggioInStream extends Messaggio {
  erroreStream?: string;
  interrotto?: boolean;
}

/** La coppia domanda/risposta che sta attraversando lo stream. */
interface StreamAttivo {
  conversazioneId: Id;
  utente: Messaggio;
  assistente?: MessaggioInStream;
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

  /* Lo storico sta in `core`, condiviso con la barra laterale che lo mostra
     sotto la voce Chat: qui lo si legge e lo si ricarica dopo le scritture. */
  private readonly storico = inject(StoricoConversazioni);

  readonly conversazioni = this.storico.conversazioni;

  // --- Template di output (RF-C-10) ---------------------------------------

  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() => this.api.urlTemplate());

  readonly template = computed(() =>
    this.risorsaTemplate.hasValue() ? this.risorsaTemplate.value() : [],
  );

  /** Esporta una risposta sul template scelto e avvia il download. */
  esporta(messaggioId: Id, template: TemplateOutput): void {
    const id = this.idAttiva();
    if (!id) return;
    this.api.esporta(id, messaggioId, template.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const collegamento = document.createElement('a');
        collegamento.href = url;
        collegamento.download = `${template.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${template.formato}`;
        collegamento.click();
        URL.revokeObjectURL(url);
      },
    });
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

  aggiungiRiferimento(documento: RiferimentoDocumento): void {
    this.riferimentiBozza.update((r) =>
      r.some((d) => d.id === documento.id) ? r : [...r, documento],
    );
  }

  rimuoviRiferimento(id: Id): void {
    this.riferimentiBozza.update((r) => r.filter((d) => d.id !== id));
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

  private avviaStream(id: Id, testo: string, riferimenti: RiferimentoDocumento[]): void {
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
    };
    this.streamAttivo.set(stream);

    this.sottoscrizioneStream = this.api
      .invia(id, { testo, documentiReferenziati: riferimenti.map((r) => r.id) })
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
      case 'testo':
        this.aggiornaAssistente((m) => ({ ...m, testo: m.testo + evento.delta }));
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

  rinomina(id: Id, titolo: string): void {
    const pulito = titolo.trim();
    if (!pulito) return;
    this.api.rinomina(id, pulito).subscribe({ next: () => this.storico.ricarica() });
  }

  elimina(id: Id): void {
    this.api.elimina(id).subscribe({
      next: () => {
        this.storico.ricarica();
        if (this.idAttiva() === id) {
          this.apri(undefined);
          void this.router.navigate(['/chat']);
        }
      },
    });
  }

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
