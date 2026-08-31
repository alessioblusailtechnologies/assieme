import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { leggiDatoDiPiattaforma } from '../src/dati.js';
import {
  schemaFonte,
  schemaModificheAgente,
  schemaNuovoAgente,
  schemaPianificazione,
} from '../src/contratto/agenti.js';
import { promptAgente } from '../src/worker/agenti/gestore.js';

/**
 * Il contratto degli agenti senza database: gli schemi Zod (fonti come
 * unione discriminata, pianificazione coi giorni a posto), il prompt
 * dell'esecuzione e le risposte che le rotte danno prima di toccare il db.
 */

const verificaFinta: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: '00000000-0000-4000-8000-00000000000a',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('schemi del contratto', () => {
  it('un agente pretende nome, istruzioni e almeno una fonte', () => {
    expect(schemaNuovoAgente.safeParse({ nome: 'X', istruzioni: 'Fai.', fonti: [] }).success).toBe(false);
    const ok = schemaNuovoAgente.parse({
      nome: 'Verifica preventivo',
      istruzioni: 'Confronta il preventivo con le condizioni.',
      fonti: [{ tipo: 'documenti-riferimento' }],
    });
    expect(ok.formatoOutput).toBe('testo');
    expect(ok.parametri).toEqual([]);
  });

  it('le fonti sono una unione discriminata: una selezione senza archivio non passa', () => {
    expect(schemaFonte.safeParse({ tipo: 'selezione' }).success).toBe(false);
    expect(schemaFonte.safeParse({ tipo: 'documento', documentoId: 'doc-1', archivio: 'privato' }).success).toBe(true);
    expect(schemaFonte.safeParse({ tipo: 'selezione', archivio: 'pubblico', soloPreferiti: true }).success).toBe(true);
  });

  it('la pianificazione valida l’orario e completa il giorno mancante', () => {
    expect(schemaPianificazione.safeParse({ frequenza: 'giornaliera', orario: '25:00' }).success).toBe(false);
    expect(schemaPianificazione.parse({ frequenza: 'settimanale', orario: '08:00' }).giornoSettimana).toBe(1);
    expect(schemaPianificazione.parse({ frequenza: 'mensile', orario: '07:30', giornoMese: 15 }).giornoMese).toBe(15);
  });

  it('il PATCH ammette null per togliere pianificazione e template', () => {
    const m = schemaModificheAgente.parse({ pianificazione: null, templateOutputId: null, attivo: false });
    expect(m).toEqual({ pianificazione: null, templateOutputId: null, attivo: false });
  });
});

describe('il prompt dell’esecuzione', () => {
  it('porta istruzioni, parametri, fonti (col tetto dichiarato) e il formato tabella', () => {
    const prompt = promptAgente({
      istruzioni: 'Controlla le scadenze.',
      formato: 'tabella',
      fonti: Array.from({ length: 35 }, (_, i) => ({ path: `tenant/documenti/polizza/doc-${i}.md`, titolo: `Doc ${i}` })),
      parametri: [{ etichetta: 'Preventivo da verificare', valore: 'il documento «Preventivo Rossi»' }],
    });
    expect(prompt).toContain('Istruzioni del task:\nControlla le scadenze.');
    expect(prompt).toContain('- Preventivo da verificare: il documento «Preventivo Rossi»');
    expect(prompt).toContain('Fonti documentali di questa esecuzione (35):');
    expect(prompt).toContain('…e altri 5 documenti');
    expect(prompt).toContain('tabella Markdown');
    expect(prompt).toContain('nessuna domanda di ritorno');
  });

  it('senza fonti risolte lo dice, invece di inventare', () => {
    expect(
      promptAgente({ istruzioni: 'X', formato: 'testo', fonti: [], parametri: [] }),
    ).toContain('non hanno prodotto documenti');
  });
});

describe('le rotte prima del database', () => {
  const app = creaApp({ logger: false, verificaToken: verificaFinta });

  it('POST incompleto → 400 AGENTE_INCOMPLETO; PATCH rotto → 400; avvio con corpo rotto → 400', async () => {
    const vuoto = await app.inject({ method: 'POST', url: '/api/agenti', headers: autenticato, payload: {} });
    expect(vuoto.statusCode).toBe(400);
    expect(vuoto.json()).toMatchObject({ codice: 'AGENTE_INCOMPLETO' });

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/agenti/00000000-0000-4000-8000-000000000001',
      headers: autenticato,
      payload: { formatoOutput: 'boh' },
    });
    expect(patch.statusCode).toBe(400);

    const avvio = await app.inject({
      method: 'POST',
      url: '/api/agenti/00000000-0000-4000-8000-000000000001/esecuzioni',
      headers: autenticato,
      payload: { parametri: { x: 42 } },
    });
    expect(avvio.statusCode).toBe(400);
  });

  it('la libreria dei predefiniti risponde senza database', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/agenti/predefiniti', headers: autenticato });
    expect(r.statusCode).toBe(200);
    const librerie = r.json<Array<{ id: string; fonti: Array<{ etichetta: string }> }>>();
    expect(librerie.length).toBeGreaterThanOrEqual(3);
    expect(librerie[0]!.fonti[0]!.etichetta).toBeTruthy(); // già idratate
  });

  /* La prova gira sempre da `src`, l'immagine sempre da `dist/src`: se il
     percorso del dato di piattaforma vale per un solo livello, la rotta passa
     qui e risponde 500 in produzione. È successo con i predefiniti. */
  it('il dato di piattaforma si trova sia da src sia dal compilato in dist', () => {
    for (const base of ['../src/dati.ts', '../dist/src/dati.js']) {
      const contenuto = leggiDatoDiPiattaforma(
        'agenti-predefiniti.json',
        new URL(base, import.meta.url),
      );
      expect((JSON.parse(contenuto) as unknown[]).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('senza token → 401 su ogni rotta del dominio', async () => {
    for (const url of ['/api/agenti', '/api/agenti/predefiniti', '/api/agenti/limiti']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});
