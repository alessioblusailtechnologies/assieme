import { describe, expect, it } from 'vitest';
import { creaApp } from '../src/api/app.js';

describe('CORS sullo stream', () => {
  it('la risposta SSE porta Access-Control-Allow-Origin per un’origine ammessa', async () => {
    const app = creaApp({
      logger: false,
      corsOrigini: 'https://app-dev.sonovelia.it',
      verificaToken: () => Promise.resolve({ sub: '00000000-0000-4000-8000-00000000000a', app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'amministratore' } }),
    });
    const r = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi',
      headers: { authorization: 'Bearer x', origin: 'https://app-dev.sonovelia.it' },
      payload: { testo: 'ciao', documentiReferenziati: [] },
    });
    /* Qualunque sia l'esito (qui 404: id malformato, senza db), l'header c'è. */
    expect(r.headers['access-control-allow-origin']).toBe('https://app-dev.sonovelia.it');
    await app.close();
  });
});
