import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { schemaEsporta, schemaEsportaRisposta, schemaIdentitaVisiva, schemaPatchTemplate } from '../src/contratto/template.js';

/**
 * Il contratto dei template senza database: gli schemi Zod e le risposte che
 * le rotte danno prima di toccare il db — la guardia da amministratore
 * (`template.gestisci`), i formati rifiutati all'ingresso, gli id malformati.
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
  it('il PATCH accetta nome e/o predefinito, niente altro e mai vuoto', () => {
    expect(schemaPatchTemplate.parse({ predefinito: true })).toEqual({ predefinito: true });
    expect(schemaPatchTemplate.parse({ nome: ' Proposta breve ' })).toEqual({ nome: 'Proposta breve' });
    expect(schemaPatchTemplate.safeParse({ tipologiaPredefinita: 'confronto' }).success).toBe(false);
    expect(schemaPatchTemplate.safeParse({ nome: '' }).success).toBe(false);
    expect(schemaPatchTemplate.safeParse({}).success).toBe(false);
  });

  it("l'esportazione vuole un template o un formato generabile", () => {
    expect(schemaEsporta.safeParse({ templateId: 'tpl-1' }).success).toBe(true);
    expect(schemaEsporta.safeParse({ formato: 'docx' }).success).toBe(true);
    expect(schemaEsporta.safeParse({ formato: 'pptx' }).success).toBe(false);
    expect(schemaEsporta.safeParse({}).success).toBe(false);
  });

  it("l'«Esporta come» della chat ammette anche il testo semplice; le tabelle no", () => {
    expect(schemaEsportaRisposta.safeParse({ formato: 'txt' }).success).toBe(true);
    expect(schemaEsportaRisposta.safeParse({ formato: 'docx' }).success).toBe(true);
    expect(schemaEsportaRisposta.safeParse({}).success).toBe(false);
    expect(schemaEsporta.safeParse({ formato: 'txt' }).success).toBe(false);
  });

  it("l'identità visiva pretende un colore esadecimale", () => {
    expect(schemaIdentitaVisiva.safeParse({ colorePrimario: '#2f4b7c' }).success).toBe(true);
    expect(schemaIdentitaVisiva.safeParse({ colorePrimario: 'blu' }).success).toBe(false);
    expect(schemaIdentitaVisiva.safeParse({}).success).toBe(true);
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
      { method: 'PUT' as const, url: '/api/identita-visiva' },
      { method: 'PUT' as const, url: '/api/identita-visiva/logo' },
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

  it('il logo accetta solo PNG o JPEG: altro content-type → 415', async () => {
    const r = await daAmministratore.inject({
      method: 'PUT',
      url: '/api/identita-visiva/logo',
      headers: { ...autenticato, 'content-type': 'text/plain' },
      payload: 'non un logo',
    });
    expect(r.statusCode).toBe(415);
    expect(r.json()).toMatchObject({ codice: 'FORMATO_NON_SUPPORTATO' });
  });

  it("l'esportazione: corpo senza template né formato → 400, id malformati → 404 (mai un errore SQL)", async () => {
    const senzaTemplate = await daOperatore.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi/pure-no/esporta',
      headers: autenticato,
      payload: {},
    });
    expect(senzaTemplate.statusCode).toBe(400);

    const malformati = await daOperatore.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi/pure-no/esporta',
      headers: autenticato,
      payload: { templateId: 'tpl-001' },
    });
    expect(malformati.statusCode).toBe(404);
    expect(malformati.json()).toMatchObject({ codice: 'NON_TROVATO' });
  });

  it('senza token → 401 su ogni rotta del dominio', async () => {
    for (const url of ['/api/template', '/api/identita-visiva', '/api/identita-visiva/logo']) {
      const r = await daOperatore.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});
