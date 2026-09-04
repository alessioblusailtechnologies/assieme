import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  AlberoCartelle,
  Cartella,
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
import {
  CartelleApi,
  DestinazioneDocumenti,
  ModificheCartella,
  NuovaCartella,
} from '@core/api/cartelle-api';
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
  private readonly apiCartelle = inject(CartelleApi);
  private readonly rotta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // --- Filtri -------------------------------------------------------------

  readonly tipologia = signal<TipologiaDocumento | undefined>(undefined);
  readonly stato = signal<StatoElaborazione | undefined>(undefined);
  readonly etichetta = signal<string | undefined>(undefined);
  readonly soloRiferimenti = signal(false);
  readonly ricerca = signal('');

  /**
   * Dove si sta guardando — una cartella col suo sottoalbero, oppure «Da
   * sistemare», che sono due viste che si escludono perché il non collocato
   * non sta *in* nessuna cartella — **vive nell'URL**, non in un signal.
   *
   * In un gestore di file la cartella aperta è un posto, e un posto deve
   * avere un indirizzo: così il tasto Indietro del browser risale l'albero,
   * un aggiornamento della pagina non ti riporta in cima, e le briciole
   * possono essere collegamenti veri invece di pulsanti che simulano una
   * navigazione. Tenerlo in un signal è esattamente ciò che rendeva le
   * briciole inerti: puntavano alla rotta in cui eri già.
   */
  private readonly parametri = toSignal(this.rotta.queryParamMap, {
    initialValue: undefined,
  });

  readonly cartella = computed<Id | undefined>(() => this.parametri()?.get('cartella') ?? undefined);
  readonly daSistemare = computed(() => this.parametri()?.get('vista') === 'da-sistemare');

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
      this.cartella(),
      this.daSistemare(),
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
    cartellaId: this.daSistemare() ? undefined : this.cartella(),
    daSistemare: this.daSistemare(),
    pagina: this.pagina(),
    perPagina: this.perPagina(),
  }));

  /* La cartella non conta come «filtro attivo»: è dove sei, non un filtro
     che hai messo. Azzerare i filtri dentro una cartella deve lasciarti
     dentro quella cartella, altrimenti il pulsante ti sposta invece di
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
  private readonly risorsaAlbero = httpResource<AlberoCartelle>(() => this.apiCartelle.urlAlbero());
  private readonly risorsaClienti = httpResource<Paginato<Cliente>>(() =>
    this.apiCartelle.urlClienti(),
  );

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

  readonly albero = computed<Cartella[]>(() =>
    this.risorsaAlbero.hasValue() ? this.risorsaAlbero.value().radici : [],
  );
  readonly quantiDaSistemare = computed(() =>
    this.risorsaAlbero.hasValue() ? this.risorsaAlbero.value().daSistemare : 0,
  );
  readonly clienti = computed<Cliente[]>(() =>
    this.risorsaClienti.hasValue() ? this.risorsaClienti.value().elementi : [],
  );

  /** L'albero appiattito: serve alle tendine di spostamento e alle briciole. */
  readonly cartelleInPiano = computed<Cartella[]>(() => {
    const piatte: Cartella[] = [];
    const scendi = (c: Cartella[]): void => {
      for (const x of c) {
        piatte.push(x);
        scendi(x.figli);
      }
    };
    scendi(this.albero());
    return piatte;
  });

  readonly cartellaCorrente = computed<Cartella | undefined>(() => {
    const id = this.cartella();
    return id ? this.cartelleInPiano().find((c) => c.id === id) : undefined;
  });

  /**
   * La catena dalla radice fino a dove si è, cartella corrente compresa.
   *
   * È quello che serve per **risalire**: da `Clienti/Rossi Mario/Auto` si
   * deve poter tornare a «Rossi Mario», non solo in cima all'archivio. Sta
   * qui e non nel componente perché è una domanda sull'albero, non su come
   * lo si disegna.
   */
  readonly catenaCartelle = computed<Cartella[]>(() => {
    const per = new Map(this.cartelleInPiano().map((c) => [c.id, c]));
    const catena: Cartella[] = [];
    const visti = new Set<string>();
    let corrente = this.cartellaCorrente();
    while (corrente && !visti.has(corrente.id)) {
      visti.add(corrente.id);
      catena.unshift(corrente);
      corrente = corrente.parentId ? per.get(corrente.parentId) : undefined;
    }
    return catena;
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
          /* Un archivio importato porta con sé le sue cartelle: se il lotto
             ne ha create, l'albero è cambiato e va riletto insieme al resto.
             I file che uno zip conteneva ma non sappiamo leggere si dicono,
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

  // --- Cartelle -----------------------------------------------------------

  /**
   * Aprire una cartella; senza argomento si torna a tutto l'archivio.
   *
   * `replaceUrl: false`: ogni cartella aperta è una tappa nella cronologia,
   * ed è così che il tasto Indietro risale l'albero un livello alla volta.
   */
  apri(id?: Id): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.rotta,
      queryParams: { cartella: id ?? null, vista: null },
      queryParamsHandling: 'merge',
    });
  }

  apriDaSistemare(): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.rotta,
      queryParams: { cartella: null, vista: 'da-sistemare' },
      queryParamsHandling: 'merge',
    });
  }

  creaCartella(
    cartella: NuovaCartella,
    esiti: { fatto?: () => void; errore?: (e: ErroreApi | null) => void } = {},
  ): void {
    this.apiCartelle.crea(cartella).subscribe({
      next: () => {
        this.ricaricaTutto();
        esiti.fatto?.();
      },
      error: (err: HttpErrorResponse) => esiti.errore?.((err.error as ErroreApi) ?? null),
    });
  }

  modificaCartella(id: Id, modifiche: ModificheCartella): void {
    this.apiCartelle.modifica(id, modifiche).subscribe({ next: () => this.ricaricaTutto() });
  }

  eliminaCartella(id: Id, documenti: DestinazioneDocumenti): void {
    this.apiCartelle.elimina(id, documenti).subscribe({
      next: () => {
        // Si stava guardando dentro: dopo non esiste più, si torna alla radice.
        if (this.cartella() === id) void this.apri(undefined);
        this.ricaricaTutto();
      },
    });
  }

  /** Spostare un documento a mano: da qui in poi la collocazione è definitiva. */
  sposta(id: Id, cartellaId: Id | null): void {
    this.modifica(id, { cartellaId });
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
    /* Anche l'albero: spostare un documento cambia i conteggi delle cartelle
       e quello di «Da sistemare», che sono numeri che l'utente sta guardando
       mentre lavora. */
    this.risorsaAlbero.reload();
    this.risorsaClienti.reload();
  }
}
