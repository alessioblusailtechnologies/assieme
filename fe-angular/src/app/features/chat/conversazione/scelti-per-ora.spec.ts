import { sceltiPerOra } from './conversazione';

describe('sceltiPerOra', () => {
  const voci = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('tre voci consecutive a partire dall’ora, stabili nella stessa ora', () => {
    expect(sceltiPerOra(voci, 3, new Date('2026-08-29T10:05:00'))).toEqual(['e', 'f', 'a']);
    expect(sceltiPerOra(voci, 3, new Date('2026-08-29T10:55:00'))).toEqual(['e', 'f', 'a']);
    expect(sceltiPerOra(voci, 3, new Date('2026-08-29T11:00:00'))).toEqual(['f', 'a', 'b']);
  });

  it('con meno voci di quante chieste le dà tutte, senza ripeterle', () => {
    expect(sceltiPerOra(['a', 'b'], 3, new Date('2026-08-29T07:00:00'))).toEqual(['b', 'a']);
  });
});
