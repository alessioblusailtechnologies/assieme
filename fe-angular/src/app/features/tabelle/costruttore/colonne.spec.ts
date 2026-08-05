import { CriterioPredefinito } from '@core/models';
import { componiColonne, intestazioneDaCriterio } from './colonne';

const criterio = (id: string, intestazione: string): CriterioPredefinito => ({
  id,
  intestazione,
  descrizione: '',
});

describe('intestazioneDaCriterio', () => {
  it('mette la maiuscola e normalizza gli spazi', () => {
    expect(intestazioneDaCriterio('  quanto   costa  il traino? ')).toBe(
      'Quanto costa il traino?',
    );
  });

  it('lascia intatto un criterio già corto', () => {
    expect(intestazioneDaCriterio('Massimale RC')).toBe('Massimale RC');
  });

  it('tronca al confine di parola, non a metà', () => {
    const lungo =
      'Il veicolo sostitutivo è previsto anche per i sinistri con controparte estera?';
    const intestazione = intestazioneDaCriterio(lungo);

    expect(intestazione.endsWith('…')).toBe(true);
    expect(intestazione.length).toBeLessThanOrEqual(49);
    /* Il carattere prima dell'ellissi è la fine di una parola intera. */
    expect(intestazione.at(-2)).not.toBe(' ');
    expect(lungo.startsWith(intestazione.slice(0, -1))).toBe(true);
  });
});

describe('componiColonne', () => {
  it('mette prima i predefiniti, poi le personalizzate', () => {
    const colonne = componiColonne(
      [criterio('c1', 'Massimale RC'), criterio('c2', 'Franchigie')],
      ['quanto costa il traino?'],
    );

    expect(colonne.map((c) => c.origine)).toEqual([
      'predefinita',
      'predefinita',
      'personalizzata',
    ]);
    expect(colonne[0].intestazione).toBe('Massimale RC');
  });

  it('conserva il criterio per esteso solo sulle personalizzate', () => {
    const [predefinita, personalizzata] = componiColonne(
      [criterio('c1', 'Massimale RC')],
      ['quanto costa il traino?'],
    );

    /* RF-C-11: una personalizzata si può riscrivere, una predefinita no —
       il criterio testuale è ciò che rende possibile la differenza. */
    expect(predefinita.criterio).toBeUndefined();
    expect(personalizzata.criterio).toBe('quanto costa il traino?');
    expect(personalizzata.intestazione).toBe('Quanto costa il traino?');
  });
});
