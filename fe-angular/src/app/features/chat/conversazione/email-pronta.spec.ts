import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { BozzaEmail } from '@core/models';
import { ChatStore } from '../chat-store';
import { EmailPronta } from './email-pronta';

/**
 * La scheda dell'email preparata (14/09/2026): si legge per intero, parte
 * solo da Invia, si corregge nel cassetto, e decisa smette di chiedere.
 */
describe('EmailPronta', () => {
  const BOZZA: BozzaEmail = {
    id: 'eml-1',
    destinatario: { tipo: 'cliente', id: 'cli-1', nome: 'Rossi Mario', a: 'm.rossi@esempio.it' },
    oggetto: 'Il rinnovo della sua RC Auto',
    corpo: 'Gentile signor Rossi,\n\nle **confermo** il rinnovo.',
    allegati: [{ id: 'doc-1', nome: 'Proposta di rinnovo', formato: 'pdf' }],
    stato: 'bozza',
  };

  const store = {
    bozzaInLavoro: vi.fn(() => false),
    inviaBozza: vi.fn(),
    annullaBozza: vi.fn(),
    modificaBozza: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  async function monta(email: BozzaEmail, inArrivo = false): Promise<ComponentFixture<EmailPronta>> {
    await TestBed.configureTestingModule({
      imports: [EmailPronta],
      providers: [{ provide: ChatStore, useValue: store }],
    }).compileComponents();
    const fixture = TestBed.createComponent(EmailPronta);
    fixture.componentRef.setInput('email', email);
    fixture.componentRef.setInput('inArrivo', inArrivo);
    fixture.detectChanges();
    return fixture;
  }

  const pulsante = (dom: HTMLElement, testo: string): HTMLButtonElement | undefined =>
    Array.from(dom.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(testo));

  it('dice a chi va, con che oggetto, che cosa dice e che cosa allega, e parte solo da Invia', async () => {
    const dom = (await monta(BOZZA)).nativeElement as HTMLElement;

    expect(dom.querySelector('.email__titolo')?.textContent).toBe('Email pronta');
    expect(dom.textContent).toContain('Rossi Mario <m.rossi@esempio.it>');
    expect(dom.textContent).toContain('Il rinnovo della sua RC Auto');
    expect(dom.querySelector('.email__corpo strong')?.textContent).toBe('confermo');
    expect(dom.querySelector('.allegato__nome')?.textContent).toBe('Proposta di rinnovo');
    expect(store.inviaBozza).not.toHaveBeenCalled();

    pulsante(dom, 'Invia')!.click();
    expect(store.inviaBozza).toHaveBeenCalledWith(BOZZA);
  });

  it('mentre la risposta scorre si legge già, ma non si invia', async () => {
    const dom = (await monta(BOZZA, true)).nativeElement as HTMLElement;

    expect(pulsante(dom, 'Invia')!.disabled).toBe(true);
    expect(pulsante(dom, 'Modifica')!.disabled).toBe(true);
    expect(dom.textContent).toContain('Si potrà inviare a risposta completa.');
  });

  it('decisa, i pulsanti spariscono e resta il racconto', async () => {
    const fixture = await monta({ ...BOZZA, stato: 'inviata', simulata: false, decisaIl: '2026-09-14T10:00:00.000Z' });
    const dom = fixture.nativeElement as HTMLElement;

    expect(dom.classList).toContain('is-decisa');
    expect(dom.querySelector('.email__titolo')?.textContent).toBe('Email inviata');
    expect(dom.querySelector('.email__quando')?.textContent).toBeTruthy();
    expect(pulsante(dom, 'Invia')).toBeUndefined();
    expect(pulsante(dom, 'Annulla')).toBeUndefined();
  });

  it('Modifica apre il cassetto coi campi già scritti, e Salva manda ciò che resta', async () => {
    const fixture = await monta(BOZZA);
    const dom = fixture.nativeElement as HTMLElement;

    pulsante(dom, 'Modifica')!.click();
    fixture.detectChanges();

    const oggetto = dom.querySelector<HTMLInputElement>('input[name="oggetto"]')!;
    expect(oggetto.value).toBe(BOZZA.oggetto);
    oggetto.value = 'Il rinnovo, con la proposta';
    oggetto.dispatchEvent(new Event('input'));
    dom.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    fixture.detectChanges();

    dom.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(store.modificaBozza).toHaveBeenCalledWith(
      BOZZA,
      { a: 'm.rossi@esempio.it', oggetto: 'Il rinnovo, con la proposta', corpo: BOZZA.corpo, allegati: [] },
      expect.any(Function),
    );
  });

  it('un indirizzo scritto a mano avvisa che la bozza non va più al cliente', async () => {
    const fixture = await monta(BOZZA);
    const dom = fixture.nativeElement as HTMLElement;

    pulsante(dom, 'Modifica')!.click();
    fixture.detectChanges();
    expect(dom.textContent).not.toContain('Non andrà più');

    const a = dom.querySelector<HTMLInputElement>('input[name="a"]')!;
    a.value = 'altro@esempio.it';
    a.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(dom.textContent).toContain("Non andrà più all'indirizzo di Rossi Mario");
  });
});
