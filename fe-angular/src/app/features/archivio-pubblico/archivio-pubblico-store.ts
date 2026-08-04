import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { Compagnia, Documento, FiltriDocumenti, Id, Paginato, Ramo, TipologiaDocumento } from '@core/models';
import { DocumentiApi } from '@core/api/documenti-api';

/**
 * Stato della schermata Archivio Pubblico.
 *
 * Fornito a livello di rotta (non `providedIn: 'root'`): i filtri vivono
 * quanto la permanenza nella sezione. Chi apre un documento e torna indietro
 * ritrova la ricerca com'era — è il gesto più frequente di questa schermata,
 * e ricominciare da capo ogni volta la renderebbe inservibile. Uscendo dalla
 * sezione, invece, si riparte puliti.
 */
@Injectable()
export class ArchivioPubblicoStore {
  private readonly api = inject(DocumentiApi);

  // --- Filtri -------------------------------------------------------------

  readonly compagniaId = signal<Id | undefined>(undefined);
  readonly ramoId = signal<Id | undefined>(undefined);
  readonly tipologia = signal<TipologiaDocumento | undefined>(undefined);
  readonly soloPreferiti = signal(false);

  /**
   * Acceso di default: RF-A-04 prevede che convivano più edizioni, ma chi
   * lavora su un contratto di oggi vuole quella in vigore. Le storiche
   * restano a un interruttore di distanza.
   */
  readonly soloCorrenti = signal(true);

  /** Legata al campo di ricerca: si aggiorna a ogni tasto. */
  readonly ricerca = signal('');

  /**
   * Quella che fa partire davvero la richiesta.
   *
   * Senza attesa, scrivere "condizioni" manderebbe dieci richieste e la
   * risposta della sesta potrebbe arrivare dopo quella della decima,
   * mostrando risultati di una ricerca che l'utente ha già superato.
   */
  private readonly ricercaAttesa = toSignal(
    toObservable(this.ricerca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );

  /**
   * La pagina torna a 1 da sola quando cambia un filtro.
   *
   * `linkedSignal` invece di un effetto: resta scrivibile per la
   * paginazione, ma si rigenera quando la sorgente cambia. Senza, chi è a
   * pagina 3 e restringe la ricerca finisce su una pagina che non esiste e
   * vede un elenco vuoto che sembra un errore.
   */
  readonly pagina = linkedSignal<unknown[], number>({
    source: () => [
      this.compagniaId(),
      this.ramoId(),
      this.tipologia(),
      this.soloCorrenti(),
      this.soloPreferiti(),
      this.ricercaAttesa(),
    ],
    computation: () => 1,
  });

  readonly perPagina = signal(20);

  readonly filtri = computed<FiltriDocumenti>(() => ({
    archivio: 'pubblico',
    compagniaId: this.compagniaId(),
    ramoId: this.ramoId(),
    tipologia: this.tipologia(),
    q: this.ricercaAttesa() || undefined,
    soloCorrenti: this.soloCorrenti(),
    soloPreferiti: this.soloPreferiti(),
    pagina: this.pagina(),
    perPagina: this.perPagina(),
  }));

  /** Vero se almeno un filtro è attivo, escluso il predefinito. */
  readonly filtriAttivi = computed(
    () =>
      !!this.compagniaId() ||
      !!this.ramoId() ||
      !!this.tipologia() ||
      !!this.ricerca() ||
      this.soloPreferiti() ||
      !this.soloCorrenti(),
  );

  // --- Risorse ------------------------------------------------------------

  private readonly risorsaElenco = httpResource<Paginato<Documento>>(() =>
    this.api.urlElenco(this.filtri()),
  );
  private readonly risorsaCompagnie = httpResource<Compagnia[]>(() => this.api.urlCompagnie());
  private readonly risorsaRami = httpResource<Ramo[]>(() => this.api.urlRami());

  /*
   * `value()` solleva un'eccezione quando la risorsa è in errore: letta
   * direttamente nel template farebbe saltare la rilevazione delle
   * modifiche e lascerebbe una pagina bianca proprio quando qualcosa è già
   * andato storto. `hasValue()` è falso sia in caricamento sia in errore.
   */
  readonly documenti = computed(() =>
    this.risorsaElenco.hasValue() ? this.risorsaElenco.value().elementi : [],
  );
  readonly totale = computed(() =>
    this.risorsaElenco.hasValue() ? this.risorsaElenco.value().totale : 0,
  );
  readonly inCaricamento = this.risorsaElenco.isLoading;
  readonly errore = this.risorsaElenco.error;

  readonly compagnie = computed(() =>
    this.risorsaCompagnie.hasValue() ? this.risorsaCompagnie.value() : [],
  );
  readonly rami = computed(() => (this.risorsaRami.hasValue() ? this.risorsaRami.value() : []));

  // --- Azioni -------------------------------------------------------------

  azzeraFiltri(): void {
    this.compagniaId.set(undefined);
    this.ramoId.set(undefined);
    this.tipologia.set(undefined);
    this.ricerca.set('');
    this.soloPreferiti.set(false);
    this.soloCorrenti.set(true);
  }

  riprova(): void {
    this.risorsaElenco.reload();
  }

  /**
   * Marca o smarca un preferito e ricarica l'elenco.
   *
   * Non aggiorniamo la riga localmente prima della risposta: con il filtro
   * "solo preferiti" attivo, smarcare un documento deve farlo sparire
   * dall'elenco, e ricalcolarlo a mano qui sarebbe riscrivere sul client la
   * logica che il server ha già.
   */
  cambiaPreferito(documento: Documento, preferito: boolean): void {
    this.api.impostaPreferito(documento.id, preferito).subscribe({
      next: () => this.risorsaElenco.reload(),
    });
  }
}
