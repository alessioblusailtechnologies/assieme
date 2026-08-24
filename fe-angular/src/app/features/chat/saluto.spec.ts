import { salutoPer } from './saluto';

describe('salutoPer', () => {
  it('senza nome resta la domanda neutra: la sessione può non essere ancora idratata', () => {
    expect(salutoPer(new Date('2026-08-24T10:00:00'))).toBe('Di cosa hai bisogno?');
  });

  it('parla la fascia giusta: notte, mattina presto, sera', () => {
    expect(salutoPer(new Date('2026-08-24T02:30:00'), 'Marta')).toMatch(/piedi|nottambulo|Notte/);
    expect(salutoPer(new Date('2026-08-24T06:30:00'), 'Marta')).toMatch(/uongiorno|caffè/);
    expect(salutoPer(new Date('2026-08-24T21:00:00'), 'Marta')).toMatch(/uonasera|Ancora al lavoro/);
  });

  it('porta il nome, ed è stabile nella stessa giornata', () => {
    const a = salutoPer(new Date('2026-08-24T10:00:00'), 'Marta');
    const b = salutoPer(new Date('2026-08-24T11:45:00'), 'Marta');
    expect(a).toContain('Marta');
    expect(a).toBe(b);
  });
});
