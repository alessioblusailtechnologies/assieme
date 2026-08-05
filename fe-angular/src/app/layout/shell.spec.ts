import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { SessioneStore } from '@core/auth/sessione-store';
import { Sessione } from '@core/models';
import { Shell } from './shell';

const SESSIONE_AMMINISTRATORE: Sessione = {
  utente: {
    id: 'utn-001',
    nome: 'Marta',
    cognome: 'Ferrero',
    email: 'm.ferrero@assicurazionimeridiana.it',
    ruolo: 'amministratore',
    tenantId: 'tnt-001',
  },
  tenant: { id: 'tnt-001', nome: 'Assicurazioni Meridiana S.r.l.', piano: 'agenzia' },
  permessi: ['istruzioni.gestisci', 'utenti.gestisci'],
};

/**
 * La struttura è ciò che l'utente vede per primo e non smette mai di vedere:
 * se si rompe, si rompe tutto insieme.
 */
describe('Shell', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /**
   * `SessioneStore` usa `httpResource`, che parte da solo appena il segnale
   * viene letto: la richiesta esiste già alla prima rilevazione. Ogni prova
   * deve quindi soddisfarla, altrimenti `verify()` la trova aperta — ed è
   * giusto così: una richiesta lasciata in sospeso in produzione sarebbe una
   * schermata bloccata sullo scheletro.
   */
  async function montaShell(sessione: Sessione | null = SESSIONE_AMMINISTRATORE) {
    const fixture: ComponentFixture<Shell> = TestBed.createComponent(Shell);

    /*
     * L'ordine è obbligato, e vale la pena capirlo una volta sola.
     *
     * `detectChanges()` monta l'albero e fa iniettare `SessioneStore`, la cui
     * `httpResource` parte da sola. In zoneless quella richiesta è un lavoro
     * in sospeso, e `whenStable()` per definizione aspetta che finisca:
     * chiamarlo prima di rispondere manda la prova in timeout.
     *
     * Il rinvio a macrotask serve a far scattare l'effetto che avvia la
     * risorsa, altrimenti `expectOne` non troverebbe ancora nulla.
     */
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));

    const richiesta = http.expectOne('/api/sessione');
    if (sessione) {
      richiesta.flush(sessione);
    } else {
      richiesta.flush({ codice: 'ERRORE', messaggio: 'ko' }, { status: 500, statusText: 'KO' });
    }

    /* Anche la barra laterale ha la sua risorsa: lo storico delle
       conversazioni sotto la voce Chat (RF-C-01). */
    http
      .match('/api/conversazioni')
      .forEach((r) => r.flush({ elementi: [], totale: 0, pagina: 1, perPagina: 50 }));

    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('rende barra laterale, barra superiore e area di contenuto', async () => {
    const dom = (await montaShell()).nativeElement as HTMLElement;

    expect(dom.querySelector('app-barra-laterale')).toBeTruthy();
    expect(dom.querySelector('app-barra-superiore')).toBeTruthy();
    expect(dom.querySelector('main#contenuto')).toBeTruthy();
    /* Senza questo collegamento chi usa la tastiera attraversa dieci voci
       di navigazione a ogni cambio di schermata. */
    expect(dom.querySelector('a.salta')).toBeTruthy();
  });

  it('mostra le voci di navigazione previste', async () => {
    const dom = (await montaShell()).nativeElement as HTMLElement;

    const etichette = Array.from(dom.querySelectorAll('.nav__etichetta')).map((e) =>
      e.textContent?.trim(),
    );

    expect(etichette).toContain('Chat');
    expect(etichette).toContain('Archivio pubblico');
    expect(etichette).toContain('Archivio privato');
    expect(etichette).toContain('Memoria');

    /* La knowledge base non è più una sezione a sé: i documenti di
       riferimento vivono nelle Istruzioni (requisiti v0.9). */
    expect(etichette).not.toContain('Knowledge base');
  });

  it('mostra il nome del tenant quando la sessione arriva', async () => {
    const dom = (await montaShell()).nativeElement as HTMLElement;
    expect(dom.textContent).toContain('Assicurazioni Meridiana');
  });

  it('espone i permessi del ruolo e nega gli altri', async () => {
    await montaShell();

    const sessione = TestBed.inject(SessioneStore);
    expect(sessione.puo('istruzioni.gestisci')).toBe(true);
    expect(sessione.puo('mcp.credenziali')).toBe(false);
  });

  it('regge una sessione che non arriva senza rompere la struttura', async () => {
    const dom = (await montaShell(null)).nativeElement as HTMLElement;

    /* La struttura resta navigabile anche senza sessione: un errore sulla
       chiamata di avvio non deve lasciare l'utente davanti a una pagina
       bianca senza vie d'uscita. */
    expect(dom.querySelector('app-barra-laterale')).toBeTruthy();
    expect(dom.querySelector('main#contenuto')).toBeTruthy();
  });
});
