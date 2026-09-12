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

  /** Otto passi: più della finestra, per vedere che cosa resta fuori. */
  const OTTO: MessaggioInStream['passi'] = Array.from({ length: 8 }, (_, i) => ({
    etichetta: `Passo ${i + 1}`,
    istante: new Date(Date.parse('2026-09-07T10:00:00.000Z') + i * 1000).toISOString(),
    durataMs: 1000,
  }));

  it('mentre lavora mostra solo gli ultimi cinque passi', async () => {
    const fixture = await monta(risposta(OTTO, true));
    const dom = fixture.nativeElement as HTMLElement;

    const voci = [...dom.querySelectorAll('.passo__etichetta')].map((e) => e.textContent?.trim());
    expect(voci).toEqual(['Passo 4', 'Passo 5', 'Passo 6', 'Passo 7', 'Passo 8']);

    /* Il riepilogo però conta tutto: la finestra nasconde, non falsa. */
    expect(dom.querySelector('.passi .riepilogo')?.textContent?.trim()).toBe('8 passaggi · 8 s');
  });

  it('a risposta finita l’elenco torna intero', async () => {
    const fixture = await monta(risposta(OTTO, true));
    const dom = fixture.nativeElement as HTMLElement;
    expect(dom.querySelectorAll('.passo').length).toBe(5);

    fixture.componentRef.setInput('messaggio', { ...risposta(OTTO, false) });
    /* Chiuso in automatico: lo si riapre per guardarci dentro. */
    fixture.detectChanges();
    (dom.querySelector('.passi .testata') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(dom.querySelectorAll('.passo').length).toBe(8);
  });

  it('la sfumatura compare solo quando c’è davvero qualcosa di nascosto', async () => {
    /* Cinque passi entrano tutti: nessuna sfumatura, o il primo sembrerebbe
       sbiadito per un difetto invece che per dire «sopra ce n'è altro». */
    const fixture = await monta(risposta(OTTO!.slice(0, 5), true));
    const dom = fixture.nativeElement as HTMLElement;
    expect(dom.querySelector('.passi__elenco')?.classList.contains('is-finestra')).toBe(false);

    fixture.componentRef.setInput('messaggio', risposta(OTTO, true));
    fixture.detectChanges();
    expect(dom.querySelector('.passi__elenco')?.classList.contains('is-finestra')).toBe(true);
  });

  it('il passo aperto ha la V e un cronometro che sale', async () => {
    /* Un passo senza successore non ha durata, e fermo su nulla sembrerebbe
       che non stia succedendo niente — il contrario di quello che il
       pannello deve dire durante due minuti di attesa. */
    const aperti: MessaggioInStream['passi'] = [
      { ...PASSI![0]!, durataMs: 2500 },
      { etichetta: 'Leggo «Nuova 4R»', strumento: 'Read', istante: new Date(Date.now() - 7_000).toISOString() },
    ];
    const dom = (await monta(risposta(aperti, true))).nativeElement as HTMLElement;

    const righe = [...dom.querySelectorAll('.passo')];
    expect(righe[0]!.classList.contains('is-in-corso')).toBe(false);
    expect(righe[1]!.classList.contains('is-in-corso')).toBe(true);

    /* Solo sul passo che lavora: la V al posto dell'icona, e il cronometro. */
    expect(righe[0]!.querySelector('.passo__marchio')).toBeNull();
    expect(righe[1]!.querySelector('.passo__marchio')).toBeTruthy();
    expect(righe[1]!.querySelector('.passo__durata.is-corrente')?.textContent?.trim()).toBe('7 s');
  });

  it('a risposta finita nessun passo tiene il cronometro acceso', async () => {
    /* Il battito esiste solo mentre c'è un passo aperto: un intervallo che
       gira su una risposta finita non si vede, e sono cento bolle in una
       conversazione lunga. */
    const dom = (await monta(risposta(PASSI, false))).nativeElement as HTMLElement;
    (dom.querySelector('.passi .testata') as HTMLButtonElement).click();
    expect(dom.querySelector('.passo__marchio')).toBeNull();
    expect(dom.querySelector('.passo__durata.is-corrente')).toBeNull();
  });

  it('non mostra nulla se il motore non ha fatto passi', async () => {
    const dom = (await monta(risposta([], false))).nativeElement as HTMLElement;
    expect(dom.querySelector('.passi')).toBeNull();
  });

  it('non ripete il passo in corso sotto il pannello', async () => {
    /* Prima che arrivi un passo la V che respira è l'unica cosa che dice
       «sto lavorando», e ci deve essere. */
    const fixture = await monta({ ...risposta([], true), attivita: 'Sto preparando la risposta…' });
    const dom = fixture.nativeElement as HTMLElement;
    expect(dom.querySelector('.attesa')).toBeTruthy();

    /* Appena il pannello ha qualcosa dentro, il passo in corso lo mostra
       lui: la riga sotto sparisce, o si leggerebbero due lavori per uno. */
    fixture.componentRef.setInput('messaggio', {
      ...risposta(PASSI, true),
      attivita: 'Raccolgo le fonti della risposta',
    });
    fixture.detectChanges();
    expect(dom.querySelector('.attesa')).toBeNull();
    expect(dom.querySelectorAll('.passo').length).toBe(2);
  });
});

/**
 * Il chip del documento generato (12/09/2026).
 *
 * Il motore annuncia il file appena l'ha caricato, ma il server lo serve
 * leggendo l'elenco dal messaggio, e il messaggio si scrive a risposta
 * completa: in mezzo c'era una finestra in cui il chip si lasciava premere
 * e rispondeva «contenuto non disponibile».
 */
describe('BollaMessaggio · il documento generato', () => {
  function conDocumento(inCorso: boolean): MessaggioInStream {
    return {
      id: 'msg-doc',
      conversazioneId: 'cnv-1',
      autore: 'assistente',
      testo: 'Il documento è pronto qui sotto.',
      inviatoIl: '2026-09-12T10:00:00.000Z',
      documentiReferenziati: [],
      citazioni: [],
      provenienze: [],
      documenti: [{ id: 'doc-1', nome: 'Proposta Rossi', formato: 'pdf', url: '/api/x' }],
      inCorso,
    };
  }

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

  it('mentre la risposta scorre il chip aspetta, e non si lascia premere', async () => {
    const dom = (await monta(conDocumento(true))).nativeElement as HTMLElement;

    /* Il chip c'è: è la cosa che si stava aspettando. */
    expect(dom.querySelector('.documento__nome')?.textContent?.trim()).toBe('Proposta Rossi');
    expect(dom.querySelector('.documento__attesa')).toBeTruthy();
    expect((dom.querySelector('.documento') as HTMLButtonElement).disabled).toBe(true);
    expect(dom.querySelector('.documento')?.getAttribute('aria-busy')).toBe('true');
    /* Nemmeno il link da mandare al cliente: non c'è ancora niente da condividere. */
    expect((dom.querySelector('.documento__condividi') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a risposta chiusa diventa un download, con la freccia al posto dell’attesa', async () => {
    const fixture = await monta(conDocumento(true));
    const dom = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('messaggio', conDocumento(false));
    fixture.detectChanges();

    expect(dom.querySelector('.documento__attesa')).toBeNull();
    expect((dom.querySelector('.documento') as HTMLButtonElement).disabled).toBe(false);
    expect(dom.querySelector('.documento')?.getAttribute('aria-label')).toBe(
      'Scarica Proposta Rossi (pdf)',
    );
    expect((dom.querySelector('.documento__condividi') as HTMLButtonElement).disabled).toBe(false);
  });
});
