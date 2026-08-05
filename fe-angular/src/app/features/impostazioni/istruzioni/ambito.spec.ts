import { Compagnia, Ramo } from '@core/models';
import { codificaAmbito, decodificaAmbito, etichettaAmbito, opzioniAmbito } from './ambito';

const RAMI: Ramo[] = [{ id: 'ram-auto', nome: 'RC Auto e veicoli', codice: 'rc-auto' }];
const COMPAGNIE: Compagnia[] = [{ id: 'cmp-generali', nome: 'Generali Italia' }];

describe('codifica e decodifica dell’ambito', () => {
  it('fa il giro completo senza perdere nulla', () => {
    const ambiti = [
      { tipo: 'generale' as const },
      { tipo: 'ramo' as const, ramoId: 'ram-auto' },
      { tipo: 'compagnia' as const, compagniaId: 'cmp-generali' },
    ];

    for (const ambito of ambiti) {
      expect(decodificaAmbito(codificaAmbito(ambito))).toEqual(ambito);
    }
  });

  it('tratta un codice sconosciuto come generale', () => {
    /* Un valore corrotto non deve rompere il form: il fallback è l'ambito
       più ampio, che è anche il più visibile — un errore che si vede. */
    expect(decodificaAmbito('qualcosa-di-strano')).toEqual({ tipo: 'generale' });
  });
});

describe('etichettaAmbito', () => {
  it('usa i nomi veri di rami e compagnie', () => {
    expect(etichettaAmbito({ tipo: 'generale' }, RAMI, COMPAGNIE)).toBe('Generale');
    expect(etichettaAmbito({ tipo: 'ramo', ramoId: 'ram-auto' }, RAMI, COMPAGNIE)).toBe(
      'RC Auto e veicoli',
    );
    expect(
      etichettaAmbito({ tipo: 'compagnia', compagniaId: 'cmp-generali' }, RAMI, COMPAGNIE),
    ).toBe('Generali Italia');
  });

  it('non inventa nomi quando la tassonomia non risponde', () => {
    expect(etichettaAmbito({ tipo: 'ramo', ramoId: 'ram-sparito' }, [], [])).toBe('Ramo');
  });
});

describe('opzioniAmbito', () => {
  it('mette il generale in testa, poi rami e compagnie', () => {
    const opzioni = opzioniAmbito(RAMI, COMPAGNIE);

    expect(opzioni[0].valore).toBe('generale');
    expect(opzioni.map((o) => o.valore)).toEqual([
      'generale',
      'ramo:ram-auto',
      'compagnia:cmp-generali',
    ]);
  });
});
