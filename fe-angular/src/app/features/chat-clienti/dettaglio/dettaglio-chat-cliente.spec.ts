import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import type { ChatCliente } from '@core/models';
import { ChatClientiStore } from '../chat-clienti-store';
import { DettaglioChatCliente } from './dettaglio-chat-cliente';

function chat(id: string, titolo: string): ChatCliente {
  return {
    id,
    titolo,
    clienteId: 'cl-1',
    clienteNome: 'Rossi Mario',
    ospite: { id: 'osp-1', nome: 'Mario', cognome: 'Rossi' },
    stato: 'attiva',
    domandeFatte: 0,
    aggiunti: [],
    esclusi: [],
    creataIl: '2026-09-13T21:35:00.000Z',
    url: 'https://app-dev.sonovelia.it/c/token',
    costoUsd: 0,
  };
}

const unGiro = () => new Promise((r) => setTimeout(r, 0));

/**
 * La chat appena attivata (13/09/2026).
 *
 * Lo store vive sulla rotta, e i provider di una rotta restano per tutta la
 * sessione: aperta una chat, l'elenco resta in memoria. Una chat attivata
 * dopo dalla scheda del cliente lì dentro non c'era, e la schermata diceva
 * «non esiste più» a una chat appena nata.
 */
describe('DettaglioChatCliente · la chat appena attivata', () => {
  let http: HttpTestingController;
  let store: ChatClientiStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DettaglioChatCliente],
      providers: [ChatClientiStore, provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ChatClientiStore);
  });

  async function monta(id: string) {
    const fixture = TestBed.createComponent(DettaglioChatCliente);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await unGiro();
    return fixture;
  }

  const richiesteElenco = () =>
    http.match((r) => r.method === 'GET' && r.url === '/api/chat-clienti');

  it('una chat attivata dopo che l’elenco era in memoria si rilegge dal server e si mostra', async () => {
    /* L'elenco caricato aprendo un'altra chat, prima dell'attivazione. */
    store.chat.set([chat('vecchia', 'Chat di prima')]);
    const fixture = await monta('nuova');
    const dom = fixture.nativeElement as HTMLElement;

    const richieste = richiesteElenco();
    expect(richieste).toHaveLength(1);
    /* Mentre il server risponde si carica, non si sentenzia. */
    fixture.detectChanges();
    expect(dom.textContent).not.toContain('non esiste più');
    expect(dom.querySelector('ui-scheletro')).toBeTruthy();

    richieste[0]!.flush([chat('vecchia', 'Chat di prima'), chat('nuova', 'Mario Rossi, polizza auto')]);
    await unGiro();
    fixture.detectChanges();
    expect(dom.querySelector('h1')?.textContent?.trim()).toBe('Mario Rossi, polizza auto');
  });

  it('una chat che non c’è davvero lo dice, ma solo dopo averla cercata, e una volta sola', async () => {
    store.chat.set([chat('vecchia', 'Chat di prima')]);
    const fixture = await monta('sparita');
    const dom = fixture.nativeElement as HTMLElement;

    richiesteElenco()[0]!.flush([chat('vecchia', 'Chat di prima')]);
    await unGiro();
    await unGiro();
    fixture.detectChanges();
    await unGiro();

    expect(dom.textContent).toContain('Questa chat non esiste più.');
    /* Niente ricariche a ripetizione su un id che non c'è. */
    expect(richiesteElenco()).toHaveLength(0);
  });

  it('una chat già in memoria si mostra subito, senza tornare dal server', async () => {
    store.chat.set([chat('nota', 'Chat nota')]);
    const fixture = await monta('nota');

    expect(richiesteElenco()).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent?.trim()).toBe('Chat nota');
  });
});
