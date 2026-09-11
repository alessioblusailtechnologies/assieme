import { describe, expect, it } from 'vitest';

import { scegliModello, type RigaModello } from '../src/generazione/catalogo.js';
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

describe('gli strumenti nel motore', () => {
  it('l’attività si racconta col titolo del documento, mai col nome del tool', () => {
    expect(etichettaAttivita(NOME_TOOL_ESPORTA_SUBITO, { titolo: 'Proposta RC Auto Rossi' }, 'C:/ws')).toBe(
      'Preparo il documento «Proposta RC Auto Rossi»',
    );
    expect(etichettaAttivita(NOME_TOOL_ESPORTA_SUBITO, {}, 'C:/ws')).toBe('Preparo il documento');
  });

  it('il prompt elenca i modelli con la loro riga «quando usarlo» e spiega quando usare gli strumenti', () => {
    const vuoto = { istruzioni: [], riferimenti: [], ricordi: [] };
    const conModelli = promptSistema(vuoto, {
      modelli: [
        { nome: 'Proposta breve', formato: 'docx', descrizione: 'Per i preventivi RC Auto da una pagina' },
        { nome: 'Presentazione clienti', formato: 'pptx', descrizione: '' },
      ],
    });
    expect(conModelli).toContain('esporta_subito');
    expect(conModelli).toContain('esportazione_elaborata');
    expect(conModelli).toContain('«Proposta breve» (DOCX): Per i preventivi RC Auto da una pagina');
    expect(conModelli).toMatch(/^- «Presentazione clienti» \(PPTX\)$/m);
    expect(conModelli).not.toContain('predefinito');
    expect(promptSistema(vuoto, { modelli: [] })).toContain('non ha modelli caricati');
    expect(promptSistema(vuoto)).not.toContain('esporta_subito');
  });
});
