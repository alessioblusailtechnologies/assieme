import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccorpatoreTesto } from '../src/worker/motore/accorpatore.js';

describe('AccorpatoreTesto', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('accorpa i delta ravvicinati in una scrittura sola, entro l’intervallo', async () => {
    const scritti: string[] = [];
    const a = new AccorpatoreTesto((t) => {
      scritti.push(t);
      return Promise.resolve();
    }, 80);
    await a.aggiungi('Sul');
    await a.aggiungi('le ');
    await a.aggiungi('franchigie');
    expect(scritti).toEqual([]);
    await vi.advanceTimersByTimeAsync(80);
    expect(scritti).toEqual(['Sulle franchigie']);
  });

  it('oltre il tetto di caratteri scrive subito; svuota() scrive e aspetta', async () => {
    const scritti: string[] = [];
    const a = new AccorpatoreTesto((t) => {
      scritti.push(t);
      return Promise.resolve();
    }, 80, 10);
    await a.aggiungi('dodici car.!');
    expect(scritti).toEqual(['dodici car.!']);
    await a.aggiungi('coda');
    await a.svuota();
    expect(scritti).toEqual(['dodici car.!', 'coda']);
    await a.svuota(); // vuoto: non scrive nulla
    expect(scritti.length).toBe(2);
  });

  it('le scritture restano in ordine anche se la prima è lenta', async () => {
    const scritti: string[] = [];
    let lenta: () => void = () => undefined;
    const a = new AccorpatoreTesto((t) => {
      if (t === 'A') return new Promise<void>((ok) => { lenta = () => { scritti.push(t); ok(); }; });
      scritti.push(t);
      return Promise.resolve();
    }, 80, 1);
    void a.aggiungi('A');
    void a.aggiungi('B');
    expect(scritti).toEqual([]);
    await vi.advanceTimersByTimeAsync(0); // la catena ha chiamato invia('A'), che aspetta
    lenta();
    await a.svuota();
    expect(scritti).toEqual(['A', 'B']);
  });
});
