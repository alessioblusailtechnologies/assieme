import { DocumentoRiferimento } from '@core/models';
import { pesoContesto } from './peso-contesto';

function riferimento(attivo: boolean, dimensioneByte: number): DocumentoRiferimento {
  return {
    id: `rif-${dimensioneByte}`,
    titolo: 'Documento',
    ambito: { tipo: 'generale' },
    attivo,
    dimensioneByte,
    caricatoDa: 'utn-001',
    aggiornatoIl: '2026-08-05T10:00:00+02:00',
  };
}

describe('pesoContesto', () => {
  it('conta solo gli attivi nel peso: sono loro che si pagano a ogni query', () => {
    const conto = pesoContesto([
      riferimento(true, 2 * 1024 * 1024),
      riferimento(true, 1024 * 1024),
      riferimento(false, 50 * 1024 * 1024),
    ]);

    expect(conto.attivi).toBe(2);
    expect(conto.totale).toBe(3);
    expect(conto.byteAttivi).toBe(3 * 1024 * 1024);
    /* RF-D-16: il testo deve dire il rapporto e il peso, non solo un numero. */
    expect(conto.testo).toContain('2 di 3 attivi');
    expect(conto.testo).toContain('3.0 MB');
  });

  it('regge l’elenco vuoto', () => {
    const conto = pesoContesto([]);
    expect(conto.attivi).toBe(0);
    expect(conto.totale).toBe(0);
    expect(conto.byteAttivi).toBe(0);
  });
});
