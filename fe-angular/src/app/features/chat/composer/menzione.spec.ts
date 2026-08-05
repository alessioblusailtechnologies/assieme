import { menzioneAlCursore } from './menzione';

describe('menzioneAlCursore', () => {
  it('riconosce la chiocciola a inizio testo', () => {
    expect(menzioneAlCursore('@gen', 4)).toEqual({ inizio: 0, query: 'gen' });
  });

  it('riconosce la chiocciola dopo uno spazio', () => {
    const testo = 'confronta @auto';
    expect(menzioneAlCursore(testo, testo.length)).toEqual({ inizio: 10, query: 'auto' });
  });

  it('appena digitata ha query vuota', () => {
    expect(menzioneAlCursore('vedi @', 6)).toEqual({ inizio: 5, query: '' });
  });

  it('non scambia un indirizzo email per una menzione', () => {
    const testo = 'scrivi a mario@dominio.it';
    expect(menzioneAlCursore(testo, testo.length)).toBeUndefined();
  });

  it('si chiude quando la parola finisce', () => {
    const testo = 'vedi @generali per';
    expect(menzioneAlCursore(testo, testo.length)).toBeUndefined();
  });

  it('considera solo il testo prima del cursore', () => {
    /* Il cursore è subito dopo «@gen»: ciò che segue non è ancora query. */
    expect(menzioneAlCursore('@gen e altro', 4)).toEqual({ inizio: 0, query: 'gen' });
  });

  it('ignora una menzione in un altro punto del testo', () => {
    /* Cursore a inizio testo, la @ sta più avanti: nessuna menzione attiva. */
    expect(menzioneAlCursore('prima @dopo', 5)).toBeUndefined();
  });
});
