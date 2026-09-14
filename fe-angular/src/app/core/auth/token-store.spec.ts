import { TestBed } from '@angular/core/testing';

import { RICOMINCIA } from './ricomincia';
import { TokenStore } from './token-store';

/** Un JWT quanto basta per dire di chi è: il server qui non c'è. */
function jwt(sub: string): string {
  const carico = btoa(JSON.stringify({ sub })).replace(/=+$/, '');
  return `intestazione.${carico}.firma`;
}

/** Quello che vede questa scheda quando un'altra scrive nello storage. */
function scriveAltraScheda(valore: { accesso: string; aggiornamento: string } | undefined): void {
  if (valore) localStorage.setItem('velia.token', JSON.stringify(valore));
  else localStorage.removeItem('velia.token');
  window.dispatchEvent(new StorageEvent('storage', { key: 'velia.token' }));
}

/**
 * Prove della sessione fra schede (14/09/2026): una scheda rimasta aperta
 * non deve continuare a mostrare i dati di chi è uscito in un'altra.
 */
describe('TokenStore', () => {
  let ricomincia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.removeItem('velia.token');
    sessionStorage.removeItem('velia.ospite');
    ricomincia = vi.fn();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: RICOMINCIA, useValue: ricomincia }] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('velia.token');
    sessionStorage.removeItem('velia.ospite');
  });

  it('entra un altro utente in un altra scheda: si riparte da una pagina nuova', () => {
    const token = TestBed.inject(TokenStore);
    token.imposta(jwt('marta'), 'agg-marta');

    scriveAltraScheda({ accesso: jwt('demetrio'), aggiornamento: 'agg-demetrio' });

    expect(ricomincia).toHaveBeenCalledWith('/');
  });

  it('esce in un altra scheda: si riparte, e la guardia porterà alla porta', () => {
    const token = TestBed.inject(TokenStore);
    token.imposta(jwt('marta'), 'agg-marta');

    scriveAltraScheda(undefined);

    expect(ricomincia).toHaveBeenCalledWith('/');
  });

  it('lo stesso utente rinnova in un altra scheda: si prendono i token nuovi e basta', () => {
    const token = TestBed.inject(TokenStore);
    token.imposta(jwt('marta'), 'agg-vecchio');

    /* Il token di aggiornamento ruota: tenere quello vecchio vorrebbe dire
       un rinnovo destinato a fallire. */
    const rinnovato = jwt('marta');
    scriveAltraScheda({ accesso: rinnovato, aggiornamento: 'agg-nuovo' });

    expect(ricomincia).not.toHaveBeenCalled();
    expect(token.tokenAccesso()).toBe(rinnovato);
    expect(token.tokenAggiornamento()).toBe('agg-nuovo');
  });

  it('la scheda di una chat cliente non si tocca', () => {
    sessionStorage.setItem('velia.ospite', 'segreto-del-link-di-almeno-venti');
    TestBed.inject(TokenStore);

    scriveAltraScheda({ accesso: jwt('demetrio'), aggiornamento: 'agg-demetrio' });

    expect(ricomincia).not.toHaveBeenCalled();
  });

  it('le altre chiavi dello storage non contano', () => {
    const token = TestBed.inject(TokenStore);
    token.imposta(jwt('marta'), 'agg-marta');

    window.dispatchEvent(new StorageEvent('storage', { key: 'velia.tema' }));

    expect(ricomincia).not.toHaveBeenCalled();
  });
});
