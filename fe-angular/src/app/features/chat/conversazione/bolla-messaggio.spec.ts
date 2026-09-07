import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BollaMessaggio } from './bolla-messaggio';
import { ChatStore, type MessaggioInStream } from '../chat-store';

/**
 * L'accordion del ragionamento (07/09/2026).
 *
 * Il comportamento che conta è uno solo e non si vede nei test dello store:
 * aperto mentre il motore lavora, chiuso quando ha finito, e fermo dove
 * l'utente l'ha messo se l'utente l'ha toccato.
 */
describe('BollaMessaggio · i passi del motore', () => {
  function risposta(passi: MessaggioInStream['passi'], inCorso: boolean): MessaggioInStream {
    return {
      id: 'msg-1',
      conversazioneId: 'cnv-1',
      autore: 'assistente',
      testo: inCorso ? '' : 'Sì, con franchigia.',
      inviatoIl: '2026-09-07T10:00:00.000Z',
      documentiReferenziati: [],
      citazioni: [],
      provenienze: [],
      passi,
      inCorso,
    };
  }

  const PASSI: MessaggioInStream['passi'] = [
    {
      etichetta: 'Consulto l’indice dell’archivio',
      strumento: 'Read',
      istante: '2026-09-07T10:00:00.000Z',
      durataMs: 2500,
    },
    {
      etichetta: 'Raccolgo le fonti della risposta',
      istante: '2026-09-07T10:00:02.500Z',
      durataMs: 62_000,
    },
  ];

  async function monta(m: MessaggioInStream): Promise<ComponentFixture<BollaMessaggio>> {
    await TestBed.configureTestingModule({
      imports: [BollaMessaggio],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), ChatStore],
    }).compileComponents();

    const fixture = TestBed.createComponent(BollaMessaggio);
    fixture.componentRef.setInput('messaggio', m);
    fixture.detectChanges();
    return fixture;
  }

  it('mostra i passi in ordine mentre il motore lavora', async () => {
    const dom = (await monta(risposta(PASSI, true))).nativeElement as HTMLElement;

    const voci = [...dom.querySelectorAll('.passo__etichetta')].map((e) => e.textContent?.trim());
    expect(voci).toEqual(['Consulto l’indice dell’archivio', 'Raccolgo le fonti della risposta']);
  });

  it('nasce aperto mentre lavora e si richiude a risposta arrivata', async () => {
    const fixture = await monta(risposta(PASSI, true));
    const dom = fixture.nativeElement as HTMLElement;

    /* In corso: i passi sono l'unica cosa da guardare, e si vedono. */
    expect(dom.querySelector('.passi .contenuto')).toBeTruthy();
    expect(dom.querySelector('.passi .testata')?.getAttribute('aria-expanded')).toBe('true');

    /* Finita: la risposta ha la scena, il ragionamento resta una riga. */
    fixture.componentRef.setInput('messaggio', risposta(PASSI, false));
    fixture.detectChanges();
    expect(dom.querySelector('.passi .contenuto')).toBeNull();
    expect(dom.querySelector('.passi .testata')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('da chiuso dice già quanti passi e quanto tempo', async () => {
    const dom = (await monta(risposta(PASSI, false))).nativeElement as HTMLElement;

    /* 2500 ms + 62 000 ms = 64,5 s, arrotondati a 1 min 5 s. */
    expect(dom.querySelector('.passi .riepilogo')?.textContent?.trim()).toBe('2 passaggi · 1 min 5 s');
  });

  it('resta dove l’utente l’ha messo, anche quando la risposta arriva', async () => {
    const fixture = await monta(risposta(PASSI, true));
    const dom = fixture.nativeElement as HTMLElement;

    /* L'utente lo chiude mentre il motore lavora ancora. */
    (dom.querySelector('.passi .testata') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dom.querySelector('.passi .contenuto')).toBeNull();

    /* La risposta arriva: la chiusura automatica non deve riaprirlo. */
    fixture.componentRef.setInput('messaggio', risposta(PASSI, false));
    fixture.detectChanges();
    expect(dom.querySelector('.passi .contenuto')).toBeNull();
  });

  it('non mostra nulla se il motore non ha fatto passi', async () => {
    const dom = (await monta(risposta([], false))).nativeElement as HTMLElement;
    expect(dom.querySelector('.passi')).toBeNull();
  });
});
