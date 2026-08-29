import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { TERMINI_ASSICURATIVI, ripulisciTrascrizione, terminePerBias, type Trascrittore } from '../src/api/conversazioni/trascrittore.js';

/**
 * La dettatura senza Voxtral: la pulizia del testo, il gergo suggerito, e la
 * rotta con un trascrittore finto (multipart vero, costruito a mano).
 */

const verifica: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: '00000000-0000-4000-8000-00000000000a',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

function multipart(nomeCampo: string, nomeFile: string, tipo: string, contenuto: string): { payload: string; headers: Record<string, string> } {
  const confine = 'confine-di-prova';
  const payload =
    `--${confine}\r\nContent-Disposition: form-data; name="${nomeCampo}"; filename="${nomeFile}"\r\n` +
    `Content-Type: ${tipo}\r\n\r\n${contenuto}\r\n--${confine}--\r\n`;
  return { payload, headers: { ...autenticato, 'content-type': `multipart/form-data; boundary=${confine}` } };
}

describe('la pulizia', () => {
  it('toglie spazi doppi, bordi e trattini lunghi; tiene il resto', () => {
    expect(ripulisciTrascrizione('  Confronta   la Kasko — franchigia 250 euro.  ')).toBe('Confronta la Kasko - franchigia 250 euro.');
    expect(ripulisciTrascrizione('riga uno \n  riga due')).toBe('Riga uno\nriga due');
    expect(ripulisciTrascrizione('')).toBe('');
  });

  it('il gergo torna nella sua forma: Kasko, AUTOPIÙ, sigle in maiuscolo', () => {
    expect(ripulisciTrascrizione("Confronta la garanzia Casco di Allianz con l'auto più di Cattolica")).toBe(
      "Confronta la garanzia Kasko di Allianz con l'AUTOPIÙ di Cattolica",
    );
    expect(ripulisciTrascrizione("l'autopiu, la rca, il dip e unipol sai secondo ivass")).toBe(
      "L'AUTOPIÙ, la RCA, il DIP e UnipolSai secondo IVASS",
    );
    // Parole intere soltanto: «dipende» e «casacca» restano loro.
    expect(ripulisciTrascrizione('Dipende dalla casacca')).toBe('Dipende dalla casacca');
  });

  it('la maiuscola a inizio frase, che un termine minuscolo in lista fa saltare al modello', () => {
    expect(ripulisciTrascrizione('cliente Rossi. franchigia e scoperto? massimale.')).toBe('Cliente Rossi. Franchigia e scoperto? Massimale.');
    expect(ripulisciTrascrizione('1.500 euro di franchigia')).toBe('1.500 euro di franchigia');
  });

  it('il gergo suggerito sta nel tetto di Voxtral (100 termini), parole singole, con le sigle che contano', () => {
    expect(TERMINI_ASSICURATIVI.length).toBeLessThanOrEqual(100);
    // Uno spazio o una virgola in un termine fa rifiutare l'intera richiesta a Mistral.
    expect(TERMINI_ASSICURATIVI.filter((t) => !terminePerBias(t))).toEqual([]);
    expect(TERMINI_ASSICURATIVI).toContain('Kasko');
    expect(TERMINI_ASSICURATIVI).toContain('AUTOPIÙ');
    expect(TERMINI_ASSICURATIVI).toContain('IVASS');
    expect(terminePerBias('RC Auto')).toBe(false);
  });
});

describe('la rotta', () => {
  const finto: Trascrittore = {
    trascrivi: (a) => Promise.resolve(`TESTO(${a.nome}|${a.tipo}|${a.byte.length})`),
  };
  const app = creaApp({ logger: false, verificaToken: verifica, conversazioni: { trascrittore: finto } });

  it('con un audio multipart risponde col testo', async () => {
    const m = multipart('audio', 'dettatura.webm', 'audio/webm', 'AUDIO-FINTO');
    const r = await app.inject({ method: 'POST', url: '/api/conversazioni/trascrizioni', headers: m.headers, payload: m.payload });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ testo: 'TESTO(dettatura.webm|audio/webm|11)' });
  });

  it('senza multipart → 400; senza token → 401', async () => {
    const json = await app.inject({ method: 'POST', url: '/api/conversazioni/trascrizioni', headers: autenticato, payload: { x: 1 } });
    expect(json.statusCode).toBe(400);
    const anonimo = await app.inject({ method: 'POST', url: '/api/conversazioni/trascrizioni', payload: {} });
    expect(anonimo.statusCode).toBe(401);
  });

  it('multipart senza file → 400', async () => {
    const confine = 'c';
    const payload = `--${confine}\r\nContent-Disposition: form-data; name="nota"\r\n\r\nciao\r\n--${confine}--\r\n`;
    const r = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/trascrizioni',
      headers: { ...autenticato, 'content-type': `multipart/form-data; boundary=${confine}` },
      payload,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codice: 'AUDIO_MANCANTE' });
  });
});
