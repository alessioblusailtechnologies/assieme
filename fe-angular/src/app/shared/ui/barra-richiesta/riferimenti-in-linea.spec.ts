import {
  ATTR_CHIAVE_RIFERIMENTO,
  ATTR_TIPO_RIFERIMENTO,
  marcatore,
  riferimentiNelTesto,
  segmenti,
  testoConMarcatori,
  testoLeggibile,
  type RiferimentoBarra,
} from './riferimenti-in-linea';

const SET = 'cmp-unipol:Km&Servizi:ed-7';

describe('riferimenti in linea', () => {
  it('spezza il testo in parole e riferimenti, nell’ordine, con la chiave del set intera', () => {
    expect(segmenti(`Confronta @[documento:d1] con @[prodotto:${SET}] per @[cliente:c1]`)).toEqual([
      { testo: 'Confronta ' },
      { tipo: 'documento', chiave: 'd1' },
      { testo: ' con ' },
      { tipo: 'prodotto', chiave: SET },
      { testo: ' per ' },
      { tipo: 'cliente', chiave: 'c1' },
    ]);
  });

  it('un testo senza marcatori è un segmento solo, e una @ qualunque resta testo', () => {
    expect(segmenti('scrivi a mario@agenzia.it')).toEqual([{ testo: 'scrivi a mario@agenzia.it' }]);
  });

  it('elenca i riferimenti citati una volta sola', () => {
    expect(riferimentiNelTesto('@[cliente:c1] e ancora @[cliente:c1] con @[documento:d1]')).toEqual([
      { tipo: 'cliente', chiave: 'c1' },
      { tipo: 'documento', chiave: 'd1' },
    ]);
  });

  it('rende il testo leggibile coi titoli, e dice quando un riferimento non c’è più', () => {
    const riferimenti: RiferimentoBarra[] = [
      { tipo: 'cliente', chiave: 'c1', titolo: 'Rossi Mario' },
      { tipo: 'prodotto', chiave: SET, titolo: 'Km&Servizi, ed. 07/2026', documenti: [] },
    ];
    expect(testoLeggibile(`Manda a @[cliente:c1] il confronto con @[prodotto:${SET}] e @[documento:sparito]`, riferimenti)).toBe(
      'Manda a «Rossi Mario» il confronto con «Km&Servizi, ed. 07/2026» e «riferimento non più disponibile»',
    );
  });

  it('dall’editor: i chip tornano marcatori al loro posto, gli a capo restano', () => {
    const radice = document.createElement('div');
    const chip = (tipo: string, chiave: string) => {
      const c = document.createElement('span');
      c.className = 'riferimento';
      c.setAttribute(ATTR_TIPO_RIFERIMENTO, tipo);
      c.setAttribute(ATTR_CHIAVE_RIFERIMENTO, chiave);
      c.textContent = 'titolo che non deve comparire';
      return c;
    };
    radice.append(
      document.createTextNode('Ogni lunedì leggi '),
      chip('prodotto', SET),
      document.createElement('br'),
      document.createTextNode('e scrivi a '),
      chip('cliente', 'c1'),
    );
    expect(testoConMarcatori(radice)).toBe(
      `Ogni lunedì leggi ${marcatore({ tipo: 'prodotto', chiave: SET })}\ne scrivi a @[cliente:c1]`,
    );
  });
});
