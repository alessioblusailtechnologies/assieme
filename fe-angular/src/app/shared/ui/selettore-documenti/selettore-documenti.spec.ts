import { cercaUnEdizione } from './selettore-documenti';

/**
 * A granularità di prodotto l'elenco mostra la sola edizione in vigore: le
 * sorelle storiche tornano quando è chi cerca a nominarle. Qui si difende
 * proprio quel confine, perché sbagliarlo si nota solo in un verso (chi
 * cerca un'edizione vecchia non la trova e non capisce perché).
 */
describe('cercaUnEdizione', () => {
  it('riconosce un anno', () => {
    expect(cercaUnEdizione('km servizi 2025')).toBe(true);
    expect(cercaUnEdizione('2026')).toBe(true);
  });

  it('riconosce una data con il mese', () => {
    expect(cercaUnEdizione('km servizi 04/2025')).toBe(true);
    expect(cercaUnEdizione('4/25')).toBe(true);
  });

  it('riconosce la parola edizione abbreviata', () => {
    expect(cercaUnEdizione('km servizi ed. 04/2025')).toBe(true);
  });

  it('una ricerca normale resta sulle edizioni in vigore', () => {
    expect(cercaUnEdizione('')).toBe(false);
    expect(cercaUnEdizione('zurich auto')).toBe(false);
    expect(cercaUnEdizione('km&servizi')).toBe(false);
  });

  it('un numero dentro il nome di un prodotto non è un’edizione', () => {
    expect(cercaUnEdizione('nuova 4r')).toBe(false);
    expect(cercaUnEdizione('scudo cyber 2')).toBe(false);
  });
});
