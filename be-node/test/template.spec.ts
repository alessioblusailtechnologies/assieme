import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { schemaEsportazioneElaborata } from '../src/contratto/conversazioni.js';
import { schemaEsporta, schemaEsportaRisposta, schemaPatchModello } from '../src/contratto/template.js';

/**
 * Il contratto dei modelli di riferimento e dell'intestazione senza
 * database: gli schemi Zod e le risposte che le rotte danno prima di
 * toccare il db — la guardia da amministratore (`template.gestisci`), i
 * formati rifiutati all'ingresso, gli id malformati. L'identità visiva non
 * c'è più (11/09/2026): le sue rotte rispondono 404 come ogni rotta che non
 * esiste.
 */

const verifica =
  (ruolo: 'operatore' | 'amministratore'): NonNullable<OpzioniApp['verificaToken']> =>
  () =>
    Promise.resolve({
      sub: '00000000-0000-4000-8000-00000000000a',
      app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo },
    });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('schemi del contratto', () => {
  it('il PATCH di un modello accetta nome, «quando usarlo» e intestazione; niente predefinito, mai vuoto', () => {
    expect(schemaPatchModello.parse({ intestazioneAgenzia: false })).toEqual({ intestazioneAgenzia: false });
    expect(schemaPatchModello.parse({ nome: ' Proposta breve ' })).toEqual({ nome: 'Proposta breve' });
    expect(schemaPatchModello.parse({ descrizione: '' })).toEqual({ descrizione: '' });
    expect(schemaPatchModello.safeParse({ predefinito: true }).success).toBe(false);
    expect(schemaPatchModello.safeParse({ nome: '' }).success).toBe(false);
    expect(schemaPatchModello.safeParse({ descrizione: 'x'.repeat(301) }).success).toBe(false);
    expect(schemaPatchModello.safeParse({}).success).toBe(false);
  });

  it("l'esportazione delle tabelle vuole un formato generabile, e basta", () => {
    expect(schemaEsporta.safeParse({ formato: 'docx' }).success).toBe(true);
    expect(schemaEsporta.safeParse({ formato: 'pptx' }).success).toBe(false);
    expect(schemaEsporta.safeParse({ templateId: 'tpl-1' }).success).toBe(false);
    expect(schemaEsporta.safeParse({}).success).toBe(false);
  });

  it('«Genera da modello» vuole il modello o il formato, anche PowerPoint', () => {
    expect(schemaEsportazioneElaborata.safeParse({ modelloId: 'tpl-1' }).success).toBe(true);
    expect(schemaEsportazioneElaborata.safeParse({ formato: 'pptx' }).success).toBe(true);
    expect(schemaEsportazioneElaborata.safeParse({ istruzioni: 'fammelo bene' }).success).toBe(false);
  });

  it("l'«Esporta come» della chat ammette anche il testo semplice; le tabelle no", () => {
    expect(schemaEsportaRisposta.safeParse({ formato: 'txt' }).success).toBe(true);
    expect(schemaEsportaRisposta.safeParse({ formato: 'docx' }).success).toBe(true);
    expect(schemaEsportaRisposta.safeParse({}).success).toBe(false);
    expect(schemaEsporta.safeParse({ formato: 'txt' }).success).toBe(false);
  });
});

describe('le rotte prima del database', () => {
  const daOperatore = creaApp({ logger: false, verificaToken: verifica('operatore') });
  const daAmministratore = creaApp({ logger: false, verificaToken: verifica('amministratore') });

  it('le scritture sono da amministratore: 403 per l’operatore', async () => {
    const casi = [
      { method: 'POST' as const, url: '/api/template' },
      { method: 'PATCH' as const, url: '/api/template/tpl-001' },
      { method: 'DELETE' as const, url: '/api/template/tpl-001' },
      { method: 'PUT' as const, url: '/api/intestazione' },
      { method: 'POST' as const, url: '/api/intestazione/immagini' },
    ];
    for (const caso of casi) {
      const r = await daOperatore.inject({ ...caso, headers: autenticato });
      expect(r.statusCode, `${caso.method} ${caso.url}`).toBe(403);
      expect(r.json()).toMatchObject({ codice: 'PERMESSO_NEGATO' });
    }
  });

  it('POST senza multipart → 400; PATCH con corpo estraneo → 400', async () => {
    const post = await daAmministratore.inject({
      method: 'POST',
      url: '/api/template',
      headers: autenticato,
      payload: { file: 'no' },
    });
    expect(post.statusCode).toBe(400);

    const patch = await daAmministratore.inject({
      method: 'PATCH',
      url: '/api/template/tpl-001',
      headers: autenticato,
      payload: { tipologiaPredefinita: 'confronto' },
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json()).toMatchObject({ codice: 'DATI_NON_VALIDI' });
  });

  it('l’intestazione fuori schema è un 400, prima di toccare il database', async () => {
    const tabella = await daAmministratore.inject({
      method: 'PUT',
      url: '/api/intestazione',
      headers: autenticato,
      payload: {
        intestazione: { altezza: 20, elementi: [{ tipo: 'tabella', id: 't', x: 0, y: 0, larghezza: 50, altezza: 10 }] },
        piede: { altezza: 0, elementi: [] },
      },
    });
    expect(tabella.statusCode).toBe(400);
    expect(tabella.json()).toMatchObject({ codice: 'DATI_NON_VALIDI' });

    /* Il flusso di paragrafi di prima della tela non passa più. */
    const anteprima = await daOperatore.inject({
      method: 'POST',
      url: '/api/intestazione/anteprima',
      headers: autenticato,
      payload: { intestazione: { type: 'doc' }, piede: { type: 'doc', content: [] } },
    });
    expect(anteprima.statusCode).toBe(400);
  });

  it('un’immagine con un id che non è dei nostri è un 404, senza cercarla', async () => {
    const r = await daOperatore.inject({ method: 'GET', url: '/api/intestazione/immagini/..%2Flogo.png', headers: autenticato });
    expect(r.statusCode).toBe(404);
  });

  it("l'esportazione: corpo senza formato → 400, id malformati → 404 (mai un errore SQL)", async () => {
    const senzaFormato = await daOperatore.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi/pure-no/esporta',
      headers: autenticato,
      payload: { templateId: 'tpl-001' },
    });
    expect(senzaFormato.statusCode).toBe(400);

    const malformati = await daOperatore.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi/pure-no/esporta',
      headers: autenticato,
      payload: { formato: 'pdf' },
    });
    expect(malformati.statusCode).toBe(404);
    expect(malformati.json()).toMatchObject({ codice: 'NON_TROVATO' });
  });

  it('senza token → 401 su ogni rotta del dominio; l’identità visiva non esiste più', async () => {
    for (const url of ['/api/template', '/api/intestazione', '/api/intestazione/immagini/img-000000000001.png']) {
      const r = await daOperatore.inject({ method: 'GET', url });
      expect(r.statusCode, url).toBe(401);
    }
    const sparita = await daOperatore.inject({ method: 'GET', url: '/api/identita-visiva', headers: autenticato });
    expect(sparita.statusCode).toBe(404);
  });
});
