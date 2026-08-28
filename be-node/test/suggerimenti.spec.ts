import { describe, expect, it } from 'vitest';

import {
  descriviContesto,
  interpretaSuggerimenti,
  ripulisciSuggerimenti,
  ripulisciSuggerimento,
} from '../src/api/conversazioni/suggeritore.js';

describe('suggerimenti: la risposta del modello', () => {
  it('legge l’array anche dentro una recinzione; vuoto o assente lancia', () => {
    expect(interpretaSuggerimenti('```json\n["Che massimali ha la Kasko?","E la grandine?"]\n```')).toEqual([
      'Che massimali ha la Kasko?',
      'E la grandine?',
    ]);
    expect(() => interpretaSuggerimenti('nessun array')).toThrow();
    expect(() => interpretaSuggerimenti('[]')).toThrow();
  });
});

describe('suggerimenti: il filtro', () => {
  it('normalizza numerazione, virgolette, spazi e trattini lunghi', () => {
    expect(ripulisciSuggerimento('1) «Confronta AUTOPIÙ e Km&Servizi — solo furto»')).toBe(
      'Confronta AUTOPIÙ e Km&Servizi - solo furto',
    );
    expect(ripulisciSuggerimento('  "Che   franchigie prevede la Kasko?"  ')).toBe('Che franchigie prevede la Kasko?');
  });

  it('scarta emoji, frasi troppo corte o troppo lunghe', () => {
    expect(ripulisciSuggerimento('Kasko ☀️')).toBeUndefined();
    expect(ripulisciSuggerimento('Ciao')).toBeUndefined();
    expect(ripulisciSuggerimento(`Confronta ${'a'.repeat(150)}`)).toBeUndefined();
  });

  it('il lotto: distinti, mai oltre sei', () => {
    const lotto = ripulisciSuggerimenti([
      'Confronta AUTOPIÙ e Km&Servizi',
      'confronta autopiù e km&servizi',
      'x',
      'Uno da chiedere',
      'Due da chiedere',
      'Tre da chiedere',
      'Quattro da chiedere',
      'Cinque da chiedere',
      'Sei da chiedere',
    ]);
    expect(lotto).toHaveLength(6);
    expect(lotto[0]).toBe('Confronta AUTOPIÙ e Km&Servizi');
    expect(lotto).not.toContain('Sei da chiedere');
  });
});

describe('suggerimenti: il contesto', () => {
  it('il messaggio al modello ha le quattro sezioni, con «nessuno» dove manca tutto', () => {
    const testo = descriviContesto({
      archivioPrivato: ['Set informativo Km&Servizi (set-informativo, Cattolica, Auto)'],
      archivioPubblico: ['Cattolica - AUTOPIÙ (Auto)', 'Allianz - Ultra Casa (Casa)'],
      ricordi: [],
      temiRecenti: ['Franchigie Furto e Rapina Km&Servizi'],
    });
    expect(testo).toContain("Archivio privato dell'agenzia (dal più recente):\n- Set informativo Km&Servizi");
    expect(testo).toContain('- Cattolica - AUTOPIÙ (Auto)\n- Allianz - Ultra Casa (Casa)');
    expect(testo).toContain('Ricordi su agenzia e utente:\n- (nessuno)');
    expect(testo).toContain('da non continuare):\n- Franchigie Furto e Rapina Km&Servizi');
  });
});
