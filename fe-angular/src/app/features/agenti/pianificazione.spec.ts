import { describe, expect, it } from 'vitest';

import { etichettaPianificazione, frequenzeAmmesse } from './pianificazione';

describe('etichettaPianificazione', () => {
  it('racconta la giornaliera con il solo orario', () => {
    expect(
      etichettaPianificazione({ frequenza: 'giornaliera', orario: '07:30', sospesa: false }),
    ).toBe('ogni giorno alle 07:30');
  });

  it('racconta la settimanale con il giorno per nome', () => {
    expect(
      etichettaPianificazione({
        frequenza: 'settimanale',
        orario: '08:00',
        giornoSettimana: 3,
        sospesa: false,
      }),
    ).toBe('ogni mercoledì alle 08:00');
  });

  it('cade sul lunedì se il giorno della settimanale manca', () => {
    expect(
      etichettaPianificazione({ frequenza: 'settimanale', orario: '08:00', sospesa: false }),
    ).toBe('ogni lunedì alle 08:00');
  });

  it('racconta la mensile con il giorno del mese', () => {
    expect(
      etichettaPianificazione({
        frequenza: 'mensile',
        orario: '09:00',
        giornoMese: 1,
        sospesa: true,
      }),
    ).toBe('il giorno 1 del mese alle 09:00');
  });

  it('non parla della sospensione: è uno stato, lo dice un badge', () => {
    const attiva = etichettaPianificazione({
      frequenza: 'giornaliera',
      orario: '07:30',
      sospesa: false,
    });
    const sospesa = etichettaPianificazione({
      frequenza: 'giornaliera',
      orario: '07:30',
      sospesa: true,
    });
    expect(sospesa).toBe(attiva);
  });
});

describe('frequenzeAmmesse', () => {
  it('con minima giornaliera le offre tutte, dalla più fitta', () => {
    expect(frequenzeAmmesse('giornaliera').map((f) => f.valore)).toEqual([
      'giornaliera',
      'settimanale',
      'mensile',
    ]);
  });

  it('con minima settimanale esclude la giornaliera (RF-E-09)', () => {
    expect(frequenzeAmmesse('settimanale').map((f) => f.valore)).toEqual([
      'settimanale',
      'mensile',
    ]);
  });

  it('con minima mensile resta solo la mensile', () => {
    expect(frequenzeAmmesse('mensile').map((f) => f.valore)).toEqual(['mensile']);
  });
});
