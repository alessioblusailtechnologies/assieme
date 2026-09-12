import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  Cliente,
  DocumentoPrivato,
  ErroreApi,
  Etichetta,
  FiltriDocumentiPrivati,
  Id,
  Paginato,
  SpazioTenant,
  StatoElaborazione,
  TipologiaDocumento,
} from '@core/models';
import { ClientiApi } from '@core/api/clienti-api';
import { DocumentiPrivatiApi, ModificheDocumento } from '@core/api/documenti-privati-api';

/** Ogni quanto si richiede lo stato dei documenti ancora in lavorazione. */
const MS_INTERROGAZIONE = 2000;

/** Un file nella coda di caricamento. */
export interface VoceCoda {
  nome: string;
  dimensione: number;
  stato: 'in-corso' | 'completato' | 'errore';
  percentuale: number;
  messaggio?: string;
}

/**
 * Stato della schermata Archivio Privato.
 *
 * Fornito a livello di rotta: i filtri e la coda vivono quanto la permanenza
 * nella sezione. Uscendo si riparte puliti.
 */
@Injectable()
export class ArchivioPrivatoStore {
  private readonly api = inject(DocumentiPrivatiApi);
  private readonly apiClienti = inject(ClientiApi);
  private readonly rotta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // --- Filtri -------------------------------------------------------------

  readonly tipologia = signal<TipologiaDocumento | undefined>(undefined);
  readonly stato = signal<StatoElaborazione | undefined>(undefined);
  readonly etichetta = signal<string | undefined>(undefined);
  readonly soloRiferimenti = signal(false);
  readonly ricerca = signal('');

  /**
   * Di chi si stanno guardando i documenti — un cliente, oppure «Senza
   * cliente», che sono due viste che si escludono — **vive nell'URL**, non
   * in un signal.
   *
   * Un filtro che si condivide con un collega e che il tasto Indietro sa
   * annullare è un posto, e un posto deve avere un indirizzo. Tenerlo in un
   * signal rendeva inerti le briciole: puntavano alla rotta in cui eri già.
   */
  private readonly parametri = toSignal(this.rotta.queryParamMap, {
    initialValue: undefined,
  });

  readonly cliente = computed<Id | undefined>(() => this.parametri()?.get('cliente') ?? undefined);
  readonly senzaCliente = computed(() => this.parametri()?.get('vista') === 'senza-cliente');

  private readonly ricercaAttesa = toSignal(
    toObservable(this.ricerca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );

  readonly pagina = linkedSignal<unknown[], number>({
    source: () => [
      this.tipologia(),
      this.stato(),
      this.etichetta(),
      this.soloRiferimenti(),
      this.ricercaAttesa(),
      this.cliente(),
      this.senzaCliente(),
    ],
    computation: () => 1,
  });

  readonly perPagina = signal(20);

  readonly filtri = computed<FiltriDocumentiPrivati>(() => ({
    q: this.ricercaAttesa() || undefined,
    tipologia: this.tipologia(),
    stato: this.stato(),
    etichetta: this.etichetta(),
    soloRiferimenti: this.soloRiferimenti(),
    clienteId: this.senzaCliente() ? undefined : this.cliente(),
    senzaCliente: this.senzaCliente(),
    pagina: this.pagina(),
    perPagina: this.perPagina(),
  }));

  /* Il cliente non conta come «filtro attivo»: è dove sei, non un filtro
     che hai messo. Azzerare i filtri mentre si guarda un cliente deve
     lasciarti su quel cliente, altrimenti il pulsante ti sposta invece di
     ripulire. */
  readonly filtriAttivi = computed(
    () =>
      !!this.tipologia() ||
      !!this.stato() ||
      !!this.etichetta() ||
      !!this.ricerca() ||
      this.soloRiferimenti(),
  );

  // --- Risorse ------------------------------------------------------------

  private readonly risorsaElenco = httpResource<Paginato<DocumentoPrivato>>(() =>
    this.api.urlElenco(this.filtri()),
  );
  private readonly risorsaEtichette = httpResource<Etichetta[]>(() => this.api.urlEtichette());
  private readonly risorsaSpazio = httpResource<SpazioTenant>(() => this.api.urlSpazio());
  private readonly risorsaClienti = httpResource<Paginato<Cliente>>(() => this.apiClienti.url());

  readonly documenti = computed(() =>
    this.risorsaElenco.hasValue() ? this.risorsaElenco.value().elementi : [],
  );
  readonly totale = computed(() =>
    this.risorsaElenco.hasValue() ? this.risorsaElenco.value().totale : 0,
  );
  readonly inCaricamento = this.risorsaElenco.isLoading;
  readonly errore = this.risorsaElenco.error;

  readonly etichette = computed(() =>
    this.risorsaEtichette.hasValue() ? this.risorsaEtichette.value() : [],
  );
  readonly spazio = computed(() =>
    this.risorsaSpazio.hasValue() ? this.risorsaSpazio.value() : undefined,
  );

  readonly clienti = computed<Cliente[]>(() =>
    this.risorsaClienti.hasValue() ? this.risorsaClienti.value().elementi : [],
  );

  readonly clienteCorrente = computed<Cliente | undefined>(() => {
    const id = this.cliente();
    return id ? this.clienti().find((c) => c.id === id) : undefined;
  });

  // --- Interrogazione periodica -------------------------------------------

  /**
   * Vero finché almeno un documento non si è assestato.
   *
   * È un **booleano** e non l'elenco dei documenti in transito: un elenco
   * sarebbe un array nuovo a ogni ricalcolo, e farebbe ripartire
   * l'interrogazione a ogni risposta anche quando non è cambiato nulla.
   */
  readonly inTransito = computed(() =>
    this.documenti().some((d) => d.stato === 'in-coda' || d.stato === 'in-elaborazione'),
  );

  constructor() {
    /*
     * RF-B-05: lo stato di elaborazione deve aggiornarsi da solo.
     *
     * L'interrogazione parte quando c'è qualcosa in lavorazione e **si ferma
     * da sola** quando tutto è pronto. Un polling che continua a vuoto è il
     * difetto che nessuno nota finché non guarda il pannello di rete — e su
     * un'applicazione aperta otto ore al giorno sono migliaia di richieste
     * inutili, con il loro costo sul backend vero.
     */
    effect((pulizia) => {
      if (!this.inTransito()) return;

      const battito = setInterval(() => {
        this.risorsaElenco.reload();
        this.risorsaSpazio.reload();
      }, MS_INTERROGAZIONE);

      pulizia(() => clearInterval(battito));
    });
  }

  // --- Coda di caricamento ------------------------------------------------

  private readonly vociCoda = signal<VoceCoda[]>([]);
  readonly coda = this.vociCoda.asReadonly();
  readonly caricamentiInCorso = computed(
    () => this.vociCoda().filter((v) => v.stato === 'in-corso').length,
  );

  /**
   * RF-B-02: caricamento singolo e multiplo.
   *
   * Non apriamo una finestra modale: le righe compaiono nell'elenco appena
   * il file è arrivato, e la coda serve solo a dire quanti stanno ancora
   * salendo. Chi lascia dieci file continua a lavorare mentre salgono,
   * invece di guardare una barra.
   */
  carica(file: File[]): void {
    if (!file.length) return;

    const nuove: VoceCoda[] = file.map((f) => ({
      nome: f.name,
      dimensione: f.size,
      stato: 'in-corso',
      percentuale: 0,
    }));
    this.vociCoda.update((c) => [...nuove, ...c]);

    const aggiorna = (modifica: (v: VoceCoda) => VoceCoda) =>
      this.vociCoda.update((c) => c.map((v) => (nuove.includes(v) ? modifica(v) : v)));

    this.api.carica(file).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          const percentuale = Math.round((evento.loaded / evento.total) * 100);
          aggiorna((v) => ({ ...v, percentuale }));
        }
        if (evento.type === HttpEventType.Response) {
          aggiorna((v) => ({ ...v, stato: 'completato', percentuale: 100 }));
          /* I file che uno zip conteneva ma non sappiamo leggere si dicono,
             invece di sparire in silenzio. */
          const ignorati = evento.body?.ignorati ?? [];
          if (ignorati.length) this.vociIgnorate.set(ignorati);
          this.ricaricaTutto();
        }
      },
      error: (err: HttpErrorResponse) => {
        const api = err.error as ErroreApi | null;
        aggiorna((v) => ({
          ...v,
          stato: 'errore',
          messaggio: api?.messaggio ?? 'Caricamento non riuscito.',
        }));
      },
    });
  }

  /** Toglie dalla coda ciò che si è concluso, riuscito o no. */
  svuotaCoda(): void {
    this.vociCoda.update((c) => c.filter((v) => v.stato === 'in-corso'));
    this.vociIgnorate.set([]);
  }

  /** I file di uno zip che non sappiamo leggere: si dicono, non si nascondono. */
  private readonly vociIgnorate = signal<string[]>([]);
  readonly ignorati = this.vociIgnorate.asReadonly();

  // --- Azioni -------------------------------------------------------------

  azzeraFiltri(): void {
    this.tipologia.set(undefined);
    this.stato.set(undefined);
    this.etichetta.set(undefined);
    this.ricerca.set('');
    this.soloRiferimenti.set(false);
  }

  // --- Clienti ------------------------------------------------------------

  /**
   * Guardare i documenti di un cliente; senza argomento si torna a tutto
   * l'archivio.
   *
   * Ogni cliente aperto è una tappa nella cronologia: il tasto Indietro
   * riporta dove si era, e l'indirizzo si può mandare a un collega.
   */
  apri(id?: Id): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.rotta,
      queryParams: { cliente: id ?? null, vista: null },
      queryParamsHandling: 'merge',
    });
  }

  apriSenzaCliente(): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.rotta,
      queryParams: { cliente: null, vista: 'senza-cliente' },
      queryParamsHandling: 'merge',
    });
  }

  /** Intestare a mano: da qui in poi il cliente è definitivo. */
  intesta(id: Id, clienteId: Id | null): void {
    this.modifica(id, { clienteId });
  }

  riprova(): void {
    this.risorsaElenco.reload();
  }

  modifica(id: Id, modifiche: ModificheDocumento): void {
    this.api.modifica(id, modifiche).subscribe({ next: () => this.ricaricaTutto() });
  }

  elimina(id: Id): void {
    this.api.elimina(id).subscribe({ next: () => this.ricaricaTutto() });
  }

  impostaRiferimento(id: Id, riferimento: boolean): void {
    this.api.impostaRiferimento(id, riferimento).subscribe({ next: () => this.ricaricaTutto() });
  }

  /* Dopo una scrittura si ricarica tutto: cambiare le etichette di un
     documento cambia l'elenco delle etichette, ed eliminarlo cambia lo
     spazio. Ricalcolarlo sul client sarebbe riscrivere la logica del server. */
  private ricaricaTutto(): void {
    this.risorsaElenco.reload();
    this.risorsaEtichette.reload();
    this.risorsaSpazio.reload();
    /* Anche i clienti: intestare un documento cambia i loro conteggi, che
       sono numeri che l'utente sta guardando mentre lavora. */
    this.risorsaClienti.reload();
  }
}
