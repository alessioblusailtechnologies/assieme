import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { DocumentiApi } from './documenti-api';

/**
 * Il costruttore di URL è il punto in cui il front-end e il backend si
 * mettono d'accordo. Un parametro inviato vuoto invece che omesso è il tipo
 * di divergenza che non rompe nulla in sviluppo e restituisce zero risultati
 * in produzione.
 */
describe('DocumentiApi', () => {
  let api: DocumentiApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DocumentiApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DocumentiApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('senza filtri non aggiunge alcuna query', () => {
    expect(api.urlElenco({})).toBe('/api/documenti');
  });

  it('omette i parametri vuoti, nulli e falsi', () => {
    const url = api.urlElenco({
      compagniaId: 'cmp-generali',
      ramoId: undefined,
      q: '',
      soloPreferiti: false,
    });

    expect(url).toBe('/api/documenti?compagniaId=cmp-generali');
  });

  it('include i booleani veri e i numeri', () => {
    const url = api.urlElenco({ soloCorrenti: true, pagina: 3, perPagina: 20 });

    expect(url).toContain('soloCorrenti=true');
    expect(url).toContain('pagina=3');
    expect(url).toContain('perPagina=20');
  });

  it('codifica i termini di ricerca con spazi e accenti', () => {
    const url = api.urlElenco({ q: 'AUTOPIÙ con telematica' });

    /* Non deve mai finire uno spazio grezzo nell'URL: alcuni proxy lo
       troncano e la ricerca perde silenziosamente le parole successive. */
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url)).toContain('AUTOPIÙ con telematica');
  });

  it('marca un preferito con PUT e lo toglie con DELETE', () => {
    api.impostaPreferito('doc-pub-001', true).subscribe();
    http.expectOne({ url: '/api/documenti/doc-pub-001/preferito', method: 'PUT' }).flush({});

    api.impostaPreferito('doc-pub-001', false).subscribe();
    http.expectOne({ url: '/api/documenti/doc-pub-001/preferito', method: 'DELETE' }).flush({});
  });
});
