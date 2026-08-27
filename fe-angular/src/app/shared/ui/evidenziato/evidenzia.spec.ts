import { evidenziaTermini } from './evidenzia';

/** Forma compatta per leggere il risultato: i tratti forti fra parentesi quadre. */
const reso = (testo: string, query: string) =>
  evidenziaTermini(testo, query)
    .map((p) => (p.forte ? `[${p.testo}]` : p.testo))
    .join('');

describe('evidenziaTermini', () => {
  it('segna il termine dovunque compaia, senza badare alle maiuscole', () => {
    expect(reso('DIP Danni - Allianz Bonus Malus autovetture', 'bonus')).toBe(
      'DIP Danni - Allianz [Bonus] Malus autovetture',
    );
    expect(reso('auto e Autovetture', 'auto')).toBe('[auto] e [Auto]vetture');
  });

  it('cerca i termini uno per uno, non come frase', () => {
    /* Il titolo li separa: cercarli come frase non troverebbe nulla. */
    expect(reso('Bonus e Malus', 'bonus malus')).toBe('[Bonus] e [Malus]');
  });

  it('unisce i tratti che si toccano invece di spezzettarli', () => {
    /* «bonus» e «onus» si sovrappongono: un tratto solo, non tre. */
    expect(evidenziaTermini('Bonus', 'bonus onus')).toEqual([{ testo: 'Bonus', forte: true }]);
  });

  it('sotto i due caratteri non evidenzia: una «a» accesa ovunque è rumore', () => {
    expect(reso('Allianz auto', 'a')).toBe('Allianz auto');
  });

  it('senza query, o senza corrispondenze, restituisce il testo intero', () => {
    expect(evidenziaTermini('Allianz', '')).toEqual([{ testo: 'Allianz', forte: false }]);
    expect(evidenziaTermini('Allianz', '   ')).toEqual([{ testo: 'Allianz', forte: false }]);
    expect(evidenziaTermini('Allianz', 'axa')).toEqual([{ testo: 'Allianz', forte: false }]);
  });

  /* La query è testo scritto a mano: se finisse in un'espressione regolare
     basterebbe una parentesi aperta per far esplodere il selettore. */
  it('non interpreta i caratteri speciali della query', () => {
    expect(reso('Polizza (auto) *nuova*', '(auto)')).toBe('Polizza [(auto)] *nuova*');
    expect(() => evidenziaTermini('qualsiasi', '[a-z')).not.toThrow();
  });
});
