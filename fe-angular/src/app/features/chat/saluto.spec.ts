import { LottoSaluti } from '@core/models';

import { fasciaPer, salutoPer } from './saluto';

const LOTTO: LottoSaluti = {
  generatoIl: '2026-08-24T06:00:00+02:00',
  frasi: {
    notte: [],
    alba: ['Alba {nome}'],
    mattina: ['Prima {nome}', 'Seconda {nome}', 'Terza {nome}'],
    pranzo: [],
    pomeriggio: [],
    sera: ['Sera {nome}'],
  },
};

describe('salutoPer', () => {
  it('senza nome resta la domanda neutra: la sessione può non essere ancora idratata', () => {
    expect(salutoPer(new Date('2026-08-24T10:00:00'))).toBe('Di cosa hai bisogno?');
    expect(salutoPer(new Date('2026-08-24T10:00:00'), undefined, LOTTO)).toBe('Di cosa hai bisogno?');
  });

  it('le fasce: notte, alba, mattina, pranzo, pomeriggio, sera', () => {
    expect(fasciaPer(2)).toBe('notte');
    expect(fasciaPer(6)).toBe('alba');
    expect(fasciaPer(9)).toBe('mattina');
    expect(fasciaPer(13)).toBe('pranzo');
    expect(fasciaPer(16)).toBe('pomeriggio');
    expect(fasciaPer(23)).toBe('sera');
  });

  it('senza lotto parla la fascia giusta con le frasi fisse', () => {
    expect(salutoPer(new Date('2026-08-24T02:30:00'), 'Marta')).toMatch(/piedi|Notte|Ciao/);
    expect(salutoPer(new Date('2026-08-24T06:30:00'), 'Marta')).toMatch(/uongiorno|caffè/);
    expect(salutoPer(new Date('2026-08-24T21:00:00'), 'Marta')).toMatch(/uonasera|Ancora al lavoro/);
  });

  it('col lotto usa le frasi generate della fascia, col nome al posto del segnaposto', () => {
    expect(salutoPer(new Date('2026-08-24T06:30:00'), 'Marta', LOTTO)).toBe('Alba Marta');
    expect(salutoPer(new Date('2026-08-24T21:00:00'), 'Marta', LOTTO)).toBe('Sera Marta');
    expect(salutoPer(new Date('2026-08-24T10:00:00'), 'Marta', LOTTO)).toMatch(/^(Prima|Seconda|Terza) Marta$/);
  });

  it('una fascia vuota nel lotto ricade sulle frasi fisse', () => {
    expect(salutoPer(new Date('2026-08-24T02:30:00'), 'Marta', LOTTO)).toMatch(/piedi|Notte|Ciao/);
    expect(salutoPer(new Date('2026-08-24T13:30:00'), 'Marta', LOTTO)).toContain('Marta');
  });

  it('è stabile nella stessa ora e cambia con l’ora', () => {
    const a = salutoPer(new Date('2026-08-24T10:00:00'), 'Marta', LOTTO);
    const b = salutoPer(new Date('2026-08-24T10:45:00'), 'Marta', LOTTO);
    const c = salutoPer(new Date('2026-08-24T11:00:00'), 'Marta', LOTTO);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});
