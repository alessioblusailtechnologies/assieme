import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { ArchivioPubblicoStore } from './archivio-pubblico-store';

/** Attende oltre la finestra di attesa della ricerca (300 ms). */
const oltreLAttesa = () => new Promise((r) => setTimeout(r, 400));

describe('ArchivioPubblicoStore', () => {
  let store: ArchivioPubblicoStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ArchivioPubblicoStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(ArchivioPubblicoStore);
    http = TestBed.inject(HttpTestingController);
  });

  /*
   * Niente `verify()` qui, ed è una scelta non una dimenticanza.
   *
   * Le tre risorse (`elenco`, `compagnie`, `rami`) partono da sole appena lo
   * store viene costruito, e ogni cambio di filtro ne fa partire un'altra.
   * Queste prove riguardano la **logica dei filtri**, non il traffico che ne
   * consegue: pretendere che ogni richiesta sia soddisfatta trasformerebbe
   * ogni prova in un esercizio di contabilità delle chiamate.
   *
   * Le svuotiamo comunque, per non lasciarne appese fra una prova e l'altra.
   * Il traffico vero è coperto da `documenti-api.spec.ts`.
   */
  afterEach(() => {
    /* Al cambio di filtro `httpResource` annulla la richiesta precedente, e
       una richiesta annullata non si può soddisfare: vanno saltate. */
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  it('parte mostrando solo le edizioni correnti', () => {
    /* RF-A-04 prevede la coesistenza di più edizioni, ma chi apre l'archivio
       sta lavorando su un contratto di oggi. Le storiche restano a un
       interruttore di distanza. */
    expect(store.soloCorrenti()).toBe(true);
    expect(store.filtri().soloCorrenti).toBe(true);
  });

  it('non considera attivo il filtro predefinito', () => {
    expect(store.filtriAttivi()).toBe(false);

    store.compagniaId.set('cmp-generali');
    expect(store.filtriAttivi()).toBe(true);
  });

  it('riporta a pagina 1 quando cambia un filtro', () => {
    store.pagina.set(4);
    expect(store.pagina()).toBe(4);

    store.compagniaId.set('cmp-generali');

    /* Senza questo, chi è a pagina 4 e restringe la ricerca finisce su una
       pagina che non esiste e vede un elenco vuoto che sembra un errore. */
    expect(store.pagina()).toBe(1);
  });

  it('lascia cambiare pagina quando i filtri restano fermi', () => {
    store.pagina.set(3);
    expect(store.pagina()).toBe(3);
    expect(store.filtri().pagina).toBe(3);
  });

  it('non mette la ricerca nei filtri prima della fine dell attesa', async () => {
    store.ricerca.set('autopiu');

    /* Subito dopo la digitazione il filtro non è ancora cambiato: senza
       attesa, scrivere "condizioni" manderebbe dieci richieste. */
    expect(store.filtri().q).toBeUndefined();

    await oltreLAttesa();
    expect(store.filtri().q).toBe('autopiu');
  });

  it('azzera tutti i filtri e ripristina le sole edizioni correnti', async () => {
    store.compagniaId.set('cmp-generali');
    store.ramoId.set('ram-auto');
    store.tipologia.set('dip');
    store.soloPreferiti.set(true);
    store.soloCorrenti.set(false);
    store.ricerca.set('qualcosa');
    await oltreLAttesa();

    store.azzeraFiltri();
    await oltreLAttesa();

    expect(store.filtriAttivi()).toBe(false);
    expect(store.filtri().compagniaId).toBeUndefined();
    expect(store.filtri().q).toBeUndefined();
    expect(store.filtri().soloCorrenti).toBe(true);
  });

  it('espone elenco vuoto e nessun errore finché la risposta non arriva', () => {
    /* Il template legge questi segnali prima di qualsiasi risposta: se
       `documenti()` sollevasse un'eccezione qui, la schermata resterebbe
       bianca a ogni caricamento. */
    expect(store.documenti()).toEqual([]);
    expect(store.totale()).toBe(0);
  });
});
