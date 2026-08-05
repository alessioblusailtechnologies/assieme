import { leggiBlocchiSse } from './sse';

/**
 * Il framing SSE si rompe in silenzio: un blocco spezzato a metà fra due
 * pacchetti TCP non solleva errori, semplicemente perde un evento. Questi
 * test riproducono i tagli possibili.
 */
describe('leggiBlocchiSse', () => {
  it('legge i blocchi completi e si ferma su quello in viaggio', () => {
    const testo = 'data: uno\n\ndata: due\n\ndata: tre';
    const lettura = leggiBlocchiSse(testo, 0);

    expect(lettura.dati).toEqual(['uno', 'due']);
    /* Il residuo «data: tre» non è terminato: resta in attesa. */
    expect(lettura.indice).toBe(testo.indexOf('data: tre'));
  });

  it('riprende da dove era arrivata, sul testo cumulativo', () => {
    const prima = leggiBlocchiSse('data: uno\n\ndata: du', 0);
    expect(prima.dati).toEqual(['uno']);

    /* Il pacchetto successivo porta il resto: il testo è cumulativo. */
    const dopo = leggiBlocchiSse('data: uno\n\ndata: due\n\n', prima.indice);
    expect(dopo.dati).toEqual(['due']);
  });

  it('a flusso chiuso legge anche il residuo senza terminatore', () => {
    const lettura = leggiBlocchiSse('data: coda', 0, true);
    expect(lettura.dati).toEqual(['coda']);
  });

  it('concatena più righe data dello stesso blocco', () => {
    const lettura = leggiBlocchiSse('data: prima\ndata: seconda\n\n', 0);
    expect(lettura.dati).toEqual(['prima\nseconda']);
  });

  it('ignora commenti e campi che non sono data', () => {
    const lettura = leggiBlocchiSse(': keep-alive\n\nevent: x\nid: 7\n\ndata: vero\n\n', 0);
    expect(lettura.dati).toEqual(['vero']);
  });

  it('tollera lo spazio opzionale dopo i due punti', () => {
    const lettura = leggiBlocchiSse('data:secco\n\ndata: con-spazio\n\n', 0);
    expect(lettura.dati).toEqual(['secco', 'con-spazio']);
  });
});
