import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { Conversazione, Paginato } from '@core/models';

import { StoricoConversazioni } from './storico-conversazioni';

const microtask = () => new Promise((r) => setTimeout(r, 0));

function pagina(titolo: string): Paginato<Conversazione> {
  return {
    elementi: [
      {
        id: 'cnv-1',
        titolo,
        creataIl: '2026-09-21T17:35:00+02:00',
        aggiornataIl: '2026-09-21T17:35:00+02:00',
        documentiInContesto: [],
        condivisa: false,
        autoreId: 'utn-004',
      },
    ],
    totale: 1,
    pagina: 1,
    perPagina: 50,
  };
}

describe('StoricoConversazioni', () => {
  it('una ricarica chiesta mentre l’elenco sta ancora caricando non si perde', async () => {
    /* 21/09/2026: la creazione di una conversazione rilegge l'elenco e un
       attimo dopo la domanda chiede di rileggerlo di nuovo. La risorsa
       ignorava la seconda richiesta, e restava l'elenco di prima della
       domanda, col contesto vuoto. */
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const storico = TestBed.inject(StoricoConversazioni);
    const http = TestBed.inject(HttpTestingController);
    await microtask();
    const prima = http.expectOne('/api/conversazioni');

    storico.ricarica();
    prima.flush(pagina('Nuova conversazione'));
    await microtask();
    TestBed.tick();
    await microtask();

    http.expectOne('/api/conversazioni').flush(pagina('Franchigie cristalli'));
    await microtask();
    expect(storico.tutte()[0]?.titolo).toBe('Franchigie cristalli');
    http.verify();
  });
});
