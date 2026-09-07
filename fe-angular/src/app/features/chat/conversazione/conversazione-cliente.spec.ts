import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TokenStore } from '@core/auth/token-store';
import { Conversazione } from './conversazione';
import { ChatStore } from '../chat-store';

/**
 * La schermata iniziale vista da un cliente dell'agenzia (07/09/2026).
 *
 * Non è un dettaglio di forma: il cliente non ha una sessione d'agenzia —
 * gliel'abbiamo tolta di proposito — e ogni cosa che aspetta quella
 * sessione, su quella pagina, aspetta per sempre. Il saluto restava uno
 * scheletro grigio, e i suggerimenti ripiegavano sugli esempi scritti per
 * l'agenzia: uno dei tre nomina il preventivo di un altro cliente.
 */
describe('Conversazione · la schermata iniziale del cliente', () => {
  let http: HttpTestingController;

  async function monta(comeOspite: boolean): Promise<ComponentFixture<Conversazione>> {
    await TestBed.configureTestingModule({
      imports: [Conversazione],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ChatStore],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    if (comeOspite) TestBed.inject(TokenStore).impostaOspite('t'.repeat(43));

    const fixture = TestBed.createComponent(Conversazione);
    /* Niente `whenStable`: il componente tiene aperte le sue risorse HTTP
       (documenti, template, suggerimenti) e non si quieta mai. Qui si
       guarda il primo dipinto, che è esattamente quello che vede chi apre
       il link. */
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    TestBed.inject(TokenStore).pulisciOspite();
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  it('il cliente vede un saluto, non uno scheletro che non arriva mai', async () => {
    const dom = (await monta(true)).nativeElement as HTMLElement;

    expect(dom.querySelector('.benvenuto__titolo')?.textContent?.trim()).toBe('Come posso aiutarla?');
    expect(dom.querySelector('.benvenuto__titolo--scheletro')).toBeNull();
  });

  it('all’agenzia il saluto resta uno scheletro finché la sessione non arriva', async () => {
    /* Il comportamento di sempre non cambia: lì la sessione arriva davvero,
       e mostrare una frase neutra per poi sostituirla fa sussultare la pagina. */
    const dom = (await monta(false)).nativeElement as HTMLElement;
    expect(dom.querySelector('.benvenuto__titolo--scheletro')).toBeTruthy();
  });

  it('al cliente non si propongono le domande di partenza dell’agenzia', async () => {
    const dom = (await monta(true)).nativeElement as HTMLElement;

    expect(dom.querySelector('.benvenuto__suggerimenti')).toBeNull();
    /* E la rotta non si chiama nemmeno: all'ospite è negata, e la 403
       riempirebbe la console di un errore che non è un errore. */
    expect(http.match((r) => r.url.includes('/suggerimenti'))).toHaveLength(0);
  });

  it('la frase che spiega parla al cliente, non all’operatore', async () => {
    const dom = (await monta(true)).nativeElement as HTMLElement;
    const spiega = dom.querySelector('.benvenuto__spiega')?.textContent ?? '';

    /* Niente «@» né «i due archivi»: non ha archivi, e non può referenziare. */
    expect(spiega).not.toContain('@');
    expect(spiega).toContain('sue coperture');
  });
});
