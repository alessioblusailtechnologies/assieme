import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { descriviRichiesta, ripulisciPrompt, type ScrittorePrompt } from '../src/api/conversazioni/scrittore-prompt.js';
import { schemaRichiestaPrompt } from '../src/contratto/conversazioni.js';

/**
 * «Scrivi il prompt» senza modello né database: il contratto, il messaggio
 * che si manda al modello, la pulizia del testo che torna, e la rotta con
 * uno scrittore finto o assente.
 */

const verifica: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: '00000000-0000-4000-8000-00000000000a',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('il contratto', () => {
  it('vuole un testo, ammette gli id dei documenti', () => {
    expect(schemaRichiestaPrompt.parse({ testo: '  confronta le due  ' })).toEqual({ testo: 'confronta le due', documenti: [] });
    expect(schemaRichiestaPrompt.safeParse({ testo: '   ' }).success).toBe(false);
    expect(schemaRichiestaPrompt.safeParse({}).success).toBe(false);
    expect(schemaRichiestaPrompt.safeParse({ testo: 'x', documenti: ['a', 'b'] }).success).toBe(true);
  });
});

describe('il messaggio al modello', () => {
  it('porta agenzia, documenti e abbozzo, con «nessuno» se il contesto è vuoto', () => {
    expect(descriviRichiesta({ abbozzo: ' grandine kasko? ', documenti: [], agenzia: 'Meridiana' })).toBe(
      'Agenzia: Meridiana\nDocumenti nel contesto:\n- (nessuno)\n\nAbbozzo:\ngrandine kasko?',
    );
    expect(descriviRichiesta({ abbozzo: 'x', documenti: ['DIP Danni', 'CdA'], agenzia: 'M' })).toContain('- DIP Danni\n- CdA');
  });
});

describe('la pulizia', () => {
  it('toglie virgolette e «Prompt:», e i trattini lunghi', () => {
    expect(ripulisciPrompt('Prompt: «Confronta le due polizze — franchigie e massimali.»')).toBe(
      'Confronta le due polizze - franchigie e massimali.',
    );
    expect(ripulisciPrompt('"Dimmi tutto"')).toBe('Dimmi tutto');
    expect(ripulisciPrompt('  \n ')).toBe('');
  });
});

describe('la rotta', () => {
  const finto: ScrittorePrompt = {
    scrivi: (r) => Promise.resolve(`PROMPT(${r.abbozzo}|${r.documenti.length})`),
  };

  it('senza testo → 400; senza token → 401', async () => {
    const app = creaApp({ logger: false, verificaToken: verifica, conversazioni: { scrittorePrompt: finto } });
    const vuoto = await app.inject({ method: 'POST', url: '/api/conversazioni/prompt', headers: autenticato, payload: {} });
    expect(vuoto.statusCode).toBe(400);
    const anonimo = await app.inject({ method: 'POST', url: '/api/conversazioni/prompt', payload: { testo: 'x' } });
    expect(anonimo.statusCode).toBe(401);
  });
});
