import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RICOMINCIA } from '@core/auth/ricomincia';
import { TokenStore } from '@core/auth/token-store';
import { Accesso } from './accesso';

describe('Accesso', () => {
  let http: HttpTestingController;
  let ricomincia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.removeItem('velia.token');
    ricomincia = vi.fn();
    TestBed.configureTestingModule({
      imports: [Accesso],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RICOMINCIA, useValue: ricomincia },
      ],
    });
    /* Qui conta cosa succede dopo il login, non come è fatta la schermata. */
    TestBed.overrideComponent(Accesso, { set: { template: '', imports: [] } });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('velia.token');
  });

  it('dopo il login riparte da una pagina nuova, non da una navigazione', () => {
    /* 14/09/2026: con una navigazione la barra laterale mostrava ancora le
       chat dell'utente di prima, anche di un altro tenant. */
    const accesso = TestBed.createComponent(Accesso).componentInstance;
    accesso.email.set('t.uno@collaudo.sonovelia.it');
    accesso.password.set('segreta');

    accesso.invia();
    http
      .expectOne((r) => r.url.endsWith('/sessione/accesso'))
      .flush({ tokenAccesso: 'nuovo', tokenAggiornamento: 'agg', scadeInSecondi: 3600 });

    expect(TestBed.inject(TokenStore).tokenAccesso()).toBe('nuovo');
    expect(ricomincia).toHaveBeenCalledWith('/');
    expect(accesso.inCorso()).toBe(true);
  });
});
