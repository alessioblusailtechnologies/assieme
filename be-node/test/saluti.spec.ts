import { describe, expect, it } from 'vitest';

import {
  contestoPer,
  descriviContesto,
  festivitaDellAnno,
  interpretaLotto,
  pasqua,
  ripulisciFrase,
  ripulisciLotto,
} from '../src/api/sessione/saluti.js';

describe('saluti: il filtro sulle frasi', () => {
  it('tiene una frase a posto, normalizzando spazi e virgolette', () => {
    expect(ripulisciFrase('  «Buongiorno {nome},   su cosa lavoriamo?»  ')).toBe(
      'Buongiorno {nome}, su cosa lavoriamo?',
    );
  });

  it('il trattino lungo diventa un trattino semplice (regola del progetto)', () => {
    expect(ripulisciFrase('Ciao {nome} — dimmi tu')).toBe('Ciao {nome} - dimmi tu');
    expect(ripulisciFrase('Ciao {nome}–dimmi tu')).toBe('Ciao {nome} - dimmi tu');
  });

  it('scarta: senza segnaposto, con due segnaposto, troppo lunga, con emoji', () => {
    expect(ripulisciFrase('Buongiorno, su cosa lavoriamo?')).toBeUndefined();
    expect(ripulisciFrase('{nome}, ciao {nome}')).toBeUndefined();
    expect(ripulisciFrase(`Ciao {nome}, ${'a'.repeat(80)}`)).toBeUndefined();
    expect(ripulisciFrase('Ciao {nome} ☀️')).toBeUndefined();
  });

  it('scarta anglicismi e autocitazioni', () => {
    expect(ripulisciFrase('Buon weekend, {nome}')).toBeUndefined();
    expect(ripulisciFrase('Qualcosa da fare prima del week, {nome}?')).toBeUndefined();
    expect(ripulisciFrase('Cosa ti serve da Velia, {nome}?')).toBeUndefined();
    expect(ripulisciFrase('Ciao {nome}, ultima cosa prima di chiudere?')).toBeDefined();
  });

  it('scarta le forme doppie di genere e gli esclamativi a raffica', () => {
    expect(ripulisciFrase('Pronto/a, {nome}?')).toBeUndefined();
    expect(ripulisciFrase('Benvenuto(a) {nome}')).toBeUndefined();
    expect(ripulisciFrase('Buongiorno {nome}, pronto a farci carico di una pratica?')).toBeUndefined();
    expect(ripulisciFrase('Primo ad arrivare, {nome}? Cosa serve.')).toBeUndefined();
    expect(ripulisciFrase('Ancora connessa, {nome}? Dimmi pure.')).toBeUndefined();
    // Le parole ambigue restano: «prima di», «solo una cosa».
    expect(ripulisciFrase('Ciao {nome}, solo una cosa prima di chiudere?')).toBeDefined();
    expect(ripulisciFrase('Forza {nome}!! Dai!')).toBeUndefined();
    expect(ripulisciFrase('Buongiorno {nome}!')).toBe('Buongiorno {nome}!');
  });

  it('il lotto: per fascia, senza doppioni, mai oltre cinque, le fasce mancanti restano vuote', () => {
    const lotto = ripulisciLotto({
      mattina: [
        'Ciao {nome}, su cosa lavoriamo?',
        'ciao {nome}, su cosa lavoriamo?',
        'Senza segnaposto',
        'Uno {nome}',
        'Due {nome}',
        'Tre {nome}',
        'Quattro {nome}',
        'Cinque {nome}',
        'Sei {nome}',
      ],
    });
    expect(lotto.mattina).toEqual([
      'Ciao {nome}, su cosa lavoriamo?',
      'Uno {nome}',
      'Due {nome}',
      'Tre {nome}',
      'Quattro {nome}',
    ]);
    expect(lotto.notte).toEqual([]);
    expect(lotto.sera).toEqual([]);
  });
});

describe('saluti: la risposta del modello', () => {
  it('legge il JSON anche dentro una recinzione e completa le fasce assenti', () => {
    const lotto = interpretaLotto('```json\n{"mattina": ["Ciao {nome}"], "sera": []}\n```');
    expect(lotto.mattina).toEqual(['Ciao {nome}']);
    expect(lotto.notte).toEqual([]);
  });

  it('senza oggetto JSON lancia: il servizio lo logga e tiene il lotto precedente', () => {
    expect(() => interpretaLotto('Ecco le frasi: 1) Ciao')).toThrow();
  });
});

describe('saluti: il calendario', () => {
  it('Pasqua: 2026 il 5 aprile, 2027 il 28 marzo', () => {
    expect(pasqua(2026)).toEqual({ mese: 4, giorno: 5 });
    expect(pasqua(2027)).toEqual({ mese: 3, giorno: 28 });
    expect(festivitaDellAnno(2026).find((f) => f.nome === 'Pasquetta')?.data.toISOString()).toBe(
      '2026-04-06T00:00:00.000Z',
    );
  });

  it('un giorno qualsiasi: data in italiano, stagione, nessuna festività', () => {
    const contesto = contestoPer(new Date('2026-08-28T10:00:00+02:00'));
    expect(contesto.data).toBe('venerdì 28 agosto 2026');
    expect(contesto.stagione).toBe('estate');
    expect(contesto.festivita).toEqual([]);
    expect(contesto.fineSettimana).toBe(false);
  });

  it('la vigilia di Ferragosto, di sabato: festa domani e fine settimana', () => {
    const contesto = contestoPer(new Date('2026-08-14T23:30:00+02:00'));
    expect(contesto.data).toBe('venerdì 14 agosto 2026');
    expect(contesto.festivita).toEqual(['Ferragosto (domani, sabato 15 agosto)']);
  });

  it('la data è quella di Roma, non quella UTC', () => {
    // Le 23:30 UTC del 14 sono già l'1:30 del 15 a Roma.
    const contesto = contestoPer(new Date('2026-08-14T23:30:00Z'));
    expect(contesto.data).toBe('sabato 15 agosto 2026');
    expect(contesto.fineSettimana).toBe(true);
    expect(contesto.festivita[0]).toBe('Ferragosto (oggi, sabato 15 agosto)');
  });

  it('a fine anno guarda anche alle feste dell’anno dopo', () => {
    const contesto = contestoPer(new Date('2026-12-30T12:00:00+01:00'));
    expect(contesto.festivita).toEqual([
      'San Silvestro (domani, giovedì 31 dicembre)',
      'Capodanno (fra 2 giorni, venerdì 1 gennaio)',
    ]);
    expect(contesto.stagione).toBe('inverno');
  });

  it('il messaggio al modello porta calendario e fasce, e nient’altro', () => {
    const testo = descriviContesto({
      data: 'sabato 15 agosto 2026',
      stagione: 'estate',
      festivita: ['Ferragosto (oggi, sabato 15 agosto)'],
      fineSettimana: true,
    });
    expect(testo).toContain('Oggi è sabato 15 agosto 2026, estate, fine settimana.');
    expect(testo).toContain('Festività a ridosso: Ferragosto (oggi, sabato 15 agosto).');
    expect(testo).toContain('- notte: dalle 0 alle 5');
    expect(testo).toContain('- sera: dalle 19 alle 24');
  });
});
