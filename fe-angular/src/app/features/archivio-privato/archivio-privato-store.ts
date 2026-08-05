import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
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

  // --- Filtri -------------------------------------------------------------

  readonly tipologia = signal<TipologiaDocumento | undefined>(undefined);
  readonly stato = signal<StatoElaborazione | undefined>(undefined);
  readonly etichetta = signal<string | undefined>(undefined);
  readonly soloRiferimenti = signal(false);
  readonly ricerca = signal('');

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
    pagina: this.pagina(),
    perPagina: this.perPagina(),
  }));

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
   * Non apriamo una finestra modale: le righe compaiono nell'elenco e la
   * coda resta un riepilogo in testata. Chi lascia dieci file continua a
   * lavorare mentre salgono, invece di guardare una barra.
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
          /* I documenti appena creati sono in coda di elaborazione: ricaricare
             li fa comparire in cima, e l'interrogazione periodica parte da
             sola perché ora c'è qualcosa in transito. */
          this.risorsaElenco.reload();
          this.risorsaSpazio.reload();
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
  }

  // --- Azioni -------------------------------------------------------------

  azzeraFiltri(): void {
    this.tipologia.set(undefined);
    this.stato.set(undefined);
    this.etichetta.set(undefined);
    this.ricerca.set('');
    this.soloRiferimenti.set(false);
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
  }
}
