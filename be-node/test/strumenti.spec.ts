import { describe, expect, it } from 'vitest';

import { modelloChiesto, scegliModello, type RigaModello } from '../src/generazione/catalogo.js';
import { NOME_TOOL_ESPORTA_SUBITO } from '../src/worker/motore/strumenti.js';
import { etichettaAttivita } from '../src/worker/motore/sessione.js';
import { promptSistema } from '../src/worker/motore/regole.js';

/**
 * La parte pura degli strumenti dei documenti: come si sceglie il modello
 * di riferimento dal nome che il motore passa, e cosa il prompt racconta dei
 * modelli dell'agenzia (11/09/2026).
 */

const riga = (id: string, nome: string, formato: RigaModello['formato'], descrizione = ''): RigaModello => ({
  id,
  tenant_id: 't',
  nome,
  formato,
  descrizione,
  intestazione_agenzia: true,
  anteprima: 'pronta',
  path_file: `tenant/t/template/${id}.${formato}`,
  path_anteprima: null,
  created_at: new Date('2026-09-11T10:00:00Z'),
});

const MODELLI = [
  riga('tpl-1', 'Proposta breve', 'docx'),
  riga('tpl-2', 'Proposta di rinnovo', 'docx'),
  riga('tpl-3', 'Carta intestata', 'pdf'),
  riga('tpl-4', 'Presentazione clienti', 'pptx'),
];

describe('scegliModello', () => {
  it('per nome: esatto senza maiuscole, o contenuto se è uno solo; per id; PowerPoint compreso', () => {
    expect(scegliModello(MODELLI, 'proposta breve')).toMatchObject({ esito: 'ok', modello: { id: 'tpl-1' } });
    expect(scegliModello(MODELLI, 'rinnovo')).toMatchObject({ esito: 'ok', modello: { id: 'tpl-2' } });
    expect(scegliModello(MODELLI, 'tpl-3')).toMatchObject({ esito: 'ok', modello: { id: 'tpl-3' } });
    expect(scegliModello(MODELLI, 'presentazione')).toMatchObject({ esito: 'ok', modello: { formato: 'pptx' } });
  });

  it('un nome ambiguo o ignoto non genera: dice al motore cosa c’è', () => {
    const ambiguo = scegliModello(MODELLI, 'proposta');
    expect(ambiguo.esito).toBe('non-trovato');
    expect(ambiguo.esito === 'non-trovato' && ambiguo.motivo).toContain('Più modelli');

    const ignoto = scegliModello(MODELLI, 'Report direzione');
    expect(ignoto.esito === 'non-trovato' && ignoto.motivo).toContain('«Proposta breve» (docx)');

    const nessuno = scegliModello([], 'Proposta');
    expect(nessuno.esito === 'non-trovato' && nessuno.motivo).toContain('non ha modelli caricati');
  });
});

describe('modelloChiesto', () => {
  const chiesto = (nome: string, utente: string[], agenzia: string[] = []) => modelloChiesto(nome, { utente, agenzia });

  it('il caso dell’11/09/2026: una presentazione chiesta a parole non chiede lo «Standard CI CD_v5.4»', () => {
    expect(
      chiesto('Standard CI CD_v5.4', [
        'Che massimali offre UnipolSai Scudo Cyber per un piccolo studio professionale',
        'fammi una bella presentazione che devo poi girare al cliente che lo vede mobile',
      ]),
    ).toBe(false);
  });

  it('lo chiede chi lo nomina, per intero o con una sua parola, senza badare a maiuscole e accenti', () => {
    expect(chiesto('Standard CI CD_v5.4', ['rifallo sullo standard ci cd v5.4'])).toBe(true);
    expect(chiesto('Standard CI CD_v5.4', ['usa lo Standard'])).toBe(true);
    expect(chiesto('Carta intestata', ['mettilo su carta intestata'])).toBe(true);
    expect(chiesto('Proposta di rinnovo', ['fammi la proposta per Rossi'])).toBe(true);
    expect(chiesto('Qualità', ['fallo come quello qualita'])).toBe(true);
  });

  it('lo chiede chi vuole «il modello» senza dire quale, anche in un messaggio precedente', () => {
    expect(chiesto('Standard CI CD_v5.4', ['fallo sul nostro modello', 'più corto'])).toBe(true);
    expect(chiesto('Standard CI CD_v5.4', ['usa il template dell’agenzia'])).toBe(true);
    /* Il messaggio che lascia il pulsante «Genera da modello». */
    expect(chiesto('Standard CI CD_v5.4', ['Genera da modello: «Standard CI CD_v5.4» (PDF)'])).toBe(true);
  });

  it('lo chiede il DNA che lo nomina; una parola generica del DNA no', () => {
    expect(chiesto('Standard CI CD_v5.4', ['fammi la proposta'], ['Proposte ai clienti: sempre sullo Standard CI CD'])).toBe(true);
    expect(chiesto('Standard CI CD_v5.4', ['fammi la proposta'], ['Usa il modello giusto per ogni documento'])).toBe(false);
  });

  it('non bastano sigle, numeri di versione, preposizioni e parole di servizio', () => {
    expect(chiesto('Standard CI CD_v5.4', ['la CI scade il 5.4'])).toBe(false);
    expect(chiesto('Nota della direzione', ['la franchigia della polizza'])).toBe(false);
    expect(chiesto('Documento agenzia', ['il documento dell’agenzia'])).toBe(false);
  });
});

describe('gli strumenti nel motore', () => {
  it('l’attività si racconta col titolo del documento, mai col nome del tool', () => {
    expect(etichettaAttivita(NOME_TOOL_ESPORTA_SUBITO, { titolo: 'Proposta RC Auto Rossi' }, 'C:/ws')).toBe(
      'Preparo il documento «Proposta RC Auto Rossi»',
    );
    expect(etichettaAttivita(NOME_TOOL_ESPORTA_SUBITO, {}, 'C:/ws')).toBe('Preparo il documento');
  });

  it('il prompt elenca i modelli con la loro riga «quando usarlo» e spiega quando usare gli strumenti', () => {
    const vuoto = { istruzioni: [], riferimenti: [], ricordi: [] };
    const MODELLI_PROMPT = [
      { nome: 'Presentazione clienti', formato: 'pptx', descrizione: '' },
      { nome: 'Proposta breve', formato: 'docx', descrizione: 'Per i preventivi RC Auto da una pagina' },
    ];
    const conModelli = promptSistema(vuoto, { modelli: MODELLI_PROMPT });
    expect(conModelli).toContain('esporta_subito');
    expect(conModelli).toContain('esportazione_elaborata');
    expect(conModelli).toContain('«Proposta breve» (DOCX): Per i preventivi RC Auto da una pagina');
    expect(conModelli).toMatch(/^- «Presentazione clienti» \(PPTX\)$/m);
    expect(conModelli).not.toContain('predefinito');
    /* Un modello non si passa solo perché c'è, e quelli senza «quando usarlo» stanno a parte. */
    expect(conModelli).toContain('Mai solo perché c’è');
    const aParte = conModelli.indexOf('Senza la riga «quando usarlo»');
    expect(aParte).toBeGreaterThan(conModelli.indexOf('«Proposta breve»'));
    expect(conModelli.indexOf('«Presentazione clienti»')).toBeGreaterThan(aParte);
    expect(promptSistema(vuoto, { modelli: [MODELLI_PROMPT[1]!] })).not.toContain('Senza la riga');
    expect(promptSistema(vuoto, { modelli: [] })).toContain('non ha modelli caricati');
    expect(promptSistema(vuoto)).not.toContain('esporta_subito');
  });
});
