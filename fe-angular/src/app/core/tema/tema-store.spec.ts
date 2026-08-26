import { TestBed } from '@angular/core/testing';

import { TemaStore } from './tema-store';

/**
 * Prove del tema.
 *
 * Quello che conta non è il valore di un segnale: è l'attributo sulla
 * radice, perché è l'unica cosa che il resto dell'applicazione guarda. Da
 * `data-tema` in poi decidono i token, e i token non si possono provare da
 * qui — nel DOM di prova non c'è il foglio di stile.
 */
describe('TemaStore', () => {
  const radice = document.documentElement;

  /** Finge la preferenza del sistema operativo, che jsdom dà sempre chiara. */
  function sistema(scuro: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (interrogazione: string) => ({
        matches: scuro && interrogazione.includes('dark'),
        media: interrogazione,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
  }

  beforeEach(() => {
    localStorage.removeItem('velia.tema');
    delete radice.dataset['tema'];
    sistema(false);
    TestBed.resetTestingModule();
  });

  it('parte dalla delega al sistema e ne prende il colore', () => {
    sistema(true);

    const tema = TestBed.inject(TemaStore);
    TestBed.tick();

    expect(tema.scelta()).toBe('sistema');
    expect(tema.reso()).toBe('scuro');
    expect(radice.dataset['tema']).toBe('scuro');
  });

  it('la scelta esplicita batte il sistema', () => {
    sistema(true);

    const tema = TestBed.inject(TemaStore);
    tema.imposta('chiaro');
    TestBed.tick();

    expect(tema.reso()).toBe('chiaro');
    expect(radice.dataset['tema']).toBe('chiaro');
    expect(localStorage.getItem('velia.tema')).toBe('chiaro');
  });

  it('ricorda la scelta fra due aperture', () => {
    localStorage.setItem('velia.tema', 'scuro');

    const tema = TestBed.inject(TemaStore);
    TestBed.tick();

    expect(tema.scelta()).toBe('scuro');
    expect(radice.dataset['tema']).toBe('scuro');
  });

  /* L'interruttore della barra: da «sistema» si esce col colore opposto a
     quello che si sta vedendo, non con l'opposto della delega. */
  it('alterna partendo da ciò che si vede, non da ciò che è scritto', () => {
    sistema(true);

    const tema = TestBed.inject(TemaStore);
    TestBed.tick();
    tema.alterna();
    TestBed.tick();

    expect(tema.scelta()).toBe('chiaro');
    expect(radice.dataset['tema']).toBe('chiaro');
  });

  it('una preferenza sconosciuta nello storage non fa danni', () => {
    localStorage.setItem('velia.tema', 'fucsia');

    const tema = TestBed.inject(TemaStore);
    TestBed.tick();

    expect(tema.scelta()).toBe('sistema');
  });
});
