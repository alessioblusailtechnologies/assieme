import { describe, expect, it } from 'vitest';

import type { RigaTemplate } from '../src/generazione/catalogo.js';
import { NOME_TOOL_DOCUMENTO, scegliTemplate } from '../src/worker/motore/strumenti.js';
import { etichettaAttivita } from '../src/worker/motore/sessione.js';
import { promptSistema } from '../src/worker/motore/regole.js';

/**
 * La parte pura del tool `genera_documento`: come si sceglie il template dal
 * testo che il modello passa (nome detto dall'utente, formato, niente), e
 * cosa il prompt racconta dei template dell'agenzia.
 */

const riga = (id: string, nome: string, formato: RigaTemplate['formato'], predefinito = false): RigaTemplate => ({
  id,
  tenant_id: 't',
  nome,
  formato,
  descrizione: '',
  predefinito,
  path_file: `tenant/t/template/${id}.${formato}`,
});

const TEMPLATE = [
  riga('tpl-1', 'Proposta breve', 'docx', true),
  riga('tpl-2', 'Proposta di rinnovo', 'docx'),
  riga('tpl-3', 'Carta intestata', 'pdf', true),
  riga('tpl-4', 'Slide', 'pptx'),
];

describe('scegliTemplate', () => {
  it('per nome: esatto senza maiuscole, o contenuto se è uno solo; per id', () => {
    expect(scegliTemplate(TEMPLATE, { template: 'proposta breve' })).toMatchObject({
      esito: 'ok',
      template: { id: 'tpl-1', formato: 'docx', personalizzato: true },
    });
    expect(scegliTemplate(TEMPLATE, { template: 'rinnovo' })).toMatchObject({
      esito: 'ok',
      template: { id: 'tpl-2' },
    });
    expect(scegliTemplate(TEMPLATE, { template: 'tpl-3' })).toMatchObject({ esito: 'ok', template: { id: 'tpl-3' } });
  });

  it('un nome ambiguo o ignoto non genera: dice al modello cosa c’è', () => {
    const ambiguo = scegliTemplate(TEMPLATE, { template: 'proposta' });
    expect(ambiguo.esito).toBe('non-trovato');
    expect(ambiguo.esito === 'non-trovato' && ambiguo.motivo).toContain('Più template');

    const ignoto = scegliTemplate(TEMPLATE, { template: 'Report direzione' });
    expect(ignoto.esito === 'non-trovato' && ignoto.motivo).toContain('«Proposta breve» (docx)');
    expect(ignoto.esito === 'non-trovato' && ignoto.motivo).not.toContain('Slide');
  });

  it('formato e template devono andare d’accordo', () => {
    const esito = scegliTemplate(TEMPLATE, { template: 'Carta intestata', formato: 'docx' });
    expect(esito.esito === 'non-trovato' && esito.motivo).toContain('è PDF, non DOCX');
  });

  it('solo il formato: il predefinito, o il layout di piattaforma; niente = PDF', () => {
    expect(scegliTemplate(TEMPLATE, { formato: 'docx' })).toMatchObject({ esito: 'ok', template: { id: 'tpl-1' } });
    expect(scegliTemplate(TEMPLATE, { formato: 'xlsx' })).toMatchObject({
      esito: 'ok',
      template: { nome: 'Documento VELIA', formato: 'xlsx', personalizzato: false },
    });
    expect(scegliTemplate([], {})).toMatchObject({ esito: 'ok', template: { formato: 'pdf', personalizzato: false } });
  });
});

describe('il tool nel motore', () => {
  it('l’attività si racconta col titolo del documento, mai col nome del tool', () => {
    expect(etichettaAttivita(NOME_TOOL_DOCUMENTO, { titolo: 'Proposta RC Auto Rossi' }, 'C:/ws')).toBe(
      'Preparo il documento «Proposta RC Auto Rossi»',
    );
    expect(etichettaAttivita(NOME_TOOL_DOCUMENTO, {}, 'C:/ws')).toBe('Preparo il documento');
  });

  it('il prompt elenca i template per nome e spiega quando usare lo strumento', () => {
    const vuoto = { istruzioni: [], riferimenti: [], ricordi: [] };
    const conTemplate = promptSistema(vuoto, [{ nome: 'Proposta breve', formato: 'docx', predefinito: true }]);
    expect(conTemplate).toContain('genera_documento');
    expect(conTemplate).toContain('«Proposta breve» (DOCX, predefinito per il formato)');
    expect(promptSistema(vuoto, [])).toContain('non ha template caricati');
    expect(promptSistema(vuoto)).not.toContain('genera_documento');
  });
});
