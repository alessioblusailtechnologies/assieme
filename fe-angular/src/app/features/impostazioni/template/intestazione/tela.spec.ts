import { MARGINE_FOGLIO } from '@core/models';
import { aggancia, allinea, distribuisci, nelFoglio, ridimensiona, riferimenti } from './tela';

const r = (x: number, y: number, larghezza: number, altezza: number) => ({
  x,
  y,
  larghezza,
  altezza,
});

describe('la geometria della tela', () => {
  it('chi si muove si aggancia al margine del corpo e al centro degli altri, entro la soglia', () => {
    const logo = r(30, 5, 30, 30);
    const rif = riferimenti(40, [logo]);
    /* Il bordo sinistro a mezzo millimetro dal margine: si aggancia, con la guida. */
    const margine = aggancia(r(MARGINE_FOGLIO + 0.5, 50, 45, 5), rif, 1);
    expect(margine.dx).toBeCloseTo(-0.5);
    expect(margine.guide).toContainEqual({ asse: 'x', valore: MARGINE_FOGLIO });
    /* Il centro di un testo alto 8 mm portato a metà del logo (20 mm dalla cima). */
    const centro = aggancia(r(70, 15.6, 50, 8), rif, 1);
    expect(centro.dy).toBeCloseTo(0.4);
    expect(centro.guide).toEqual([{ asse: 'y', valore: 20 }]);
    /* Oltre la soglia non succede niente. */
    expect(aggancia(r(70, 10.5, 50, 8), rif, 1)).toEqual({ dx: 0, dy: 0, guide: [] });
  });

  it('una maniglia tiene fermo il lato opposto, e non scende sotto il minimo', () => {
    const minimo = { larghezza: 5, altezza: 2 };
    expect(ridimensiona(r(20, 5, 40, 10), 'e', 10, 0, { minimo })).toEqual(r(20, 5, 50, 10));
    expect(ridimensiona(r(20, 5, 40, 10), 'w', 10, 0, { minimo })).toEqual(r(30, 5, 30, 10));
    expect(ridimensiona(r(20, 5, 40, 10), 'n', 0, 30, { minimo })).toEqual(r(20, 13, 40, 2));
    /* Dal bordo sinistro del foglio non si esce. */
    expect(ridimensiona(r(20, 5, 40, 10), 'w', -50, 0, { minimo })).toEqual(r(0, 5, 60, 10));
  });

  it('un’immagine dall’angolo tiene le proporzioni', () => {
    const immagine = ridimensiona(r(20, 5, 30, 15), 'se', 15, 1, {
      minimo: { larghezza: 3, altezza: 1 },
      proporzioni: true,
    });
    expect(immagine.larghezza).toBeCloseTo(45);
    expect(immagine.altezza).toBeCloseTo(22.5);
    const daSinistra = ridimensiona(r(20, 5, 30, 15), 'nw', -6, 0, {
      minimo: { larghezza: 3, altezza: 1 },
      proporzioni: true,
    });
    expect(daSinistra.x + daSinistra.larghezza).toBeCloseTo(50);
    expect(daSinistra.y + daSinistra.altezza).toBeCloseTo(20);
    expect(daSinistra.larghezza / daSinistra.altezza).toBeCloseTo(2);
  });

  it('più elementi si allineano fra loro; uno da solo ai margini e alla fascia', () => {
    const logo = r(20, 5, 30, 30);
    const testo = r(60, 8, 50, 8);
    expect(allinea([logo, testo], 'mezzo', 40)).toEqual([
      { x: 20, y: 5 },
      { x: 60, y: 16 },
    ]);
    expect(allinea([logo, testo], 'alto', 40)).toEqual([
      { x: 20, y: 5 },
      { x: 60, y: 5 },
    ]);
    const [destra] = allinea([testo], 'destra', 40);
    expect(destra!.x + 50).toBeCloseTo(210 - MARGINE_FOGLIO);
    expect(allinea([testo], 'mezzo', 40)).toEqual([{ x: 60, y: 16 }]);
  });

  it('distribuire lascia fermi gli estremi e fa uguali gli spazi', () => {
    const posti = distribuisci([r(20, 0, 10, 5), r(100, 0, 20, 5), r(40, 0, 10, 5)], 'x');
    expect(posti).toEqual([
      { x: 20, y: 0 },
      { x: 100, y: 0 },
      { x: 60, y: 0 },
    ]);
    expect(distribuisci([r(20, 0, 10, 5), r(50, 0, 10, 5)], 'x')).toEqual([
      { x: 20, y: 0 },
      { x: 50, y: 0 },
    ]);
  });

  it('dentro il foglio: niente fuori dai bordi né sopra la cima', () => {
    expect(nelFoglio(r(-3, -2, 30, 10))).toEqual(r(0, 0, 30, 10));
    expect(nelFoglio(r(200, 5, 30, 10))).toEqual(r(180, 5, 30, 10));
  });
});
