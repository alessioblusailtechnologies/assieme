import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';

import { App } from './app';

/**
 * Prova di fumo della radice.
 *
 * Non verifica funzionalità — non ce ne sono ancora. Verifica che
 * l'applicazione **si accenda**: che il grafo di iniezione si chiuda, che il
 * router accetti la mappa delle rotte, che i componenti PrimeNG trovino le
 * proprie dipendenze. Sono esattamente gli errori che la compilazione non
 * vede e che si manifestano solo alla prima apertura del browser.
 */
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        /* Rotte vuote di proposito: qui interessa che la radice si monti, non
           che il router raggiunga una schermata. Con le rotte vere partirebbe
           una navigazione, e con essa la chiamata di sessione — rumore che
           appartiene alla prova della struttura, non a questa. */
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        MessageService,
      ],
    }).compileComponents();
  });

  it('si costruisce senza errori di iniezione', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('rende la struttura di pagina', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const dom = fixture.nativeElement as HTMLElement;
    /* Il toast globale è nell'albero: è il canale su cui l'interceptor
       degli errori scrive, e se manca gli errori restano invisibili. */
    expect(dom.querySelector('p-toast')).toBeTruthy();
  });
});
