import { describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';

/**
 * Autenticazione contro il progetto Supabase VERO: login di un utente demo
 * (seed di `tools/seed-utenti.mjs`) e verifica del token col plugin reale —
 * nessun verificatore finto. Si salta senza i puntamenti nel .env.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';
const pronto = Boolean(config?.SUPABASE_URL && config.SUPABASE_ANON_KEY && config.SUPABASE_JWT_SECRET);

describe.skipIf(!pronto)('autenticazione col progetto Supabase', () => {
  it("un login vero attraversa il plugin e consegna l'identità", async () => {
    const risposta = await fetch(
      new URL('/auth/v1/token?grant_type=password', config!.SUPABASE_URL),
      {
        method: 'POST',
        headers: {
          apikey: config!.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'm.ferrero@assicurazionimeridiana.it',
          password: 'assieme-demo-2026!',
        }),
      },
    );
    expect(risposta.ok).toBe(true);
    const { access_token } = (await risposta.json()) as { access_token: string };

    const app = creaApp({ logger: false }); // verificatore VERO
    app.get('/api/chi-sono', (richiesta) => richiesta.identita);

    const esito = await app.inject({
      method: 'GET',
      url: '/api/chi-sono',
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(esito.statusCode).toBe(200);
    const identita = esito.json<{ tenantId: string; ruolo: string }>();
    expect(identita.tenantId).toBe(TENANT_DEMO);
    expect(identita.ruolo).toBe('amministratore');
  });

  it('un token manomesso non passa', async () => {
    const app = creaApp({ logger: false });
    app.get('/api/protetta', () => ({ ok: true }));
    const esito = await app.inject({
      method: 'GET',
      url: '/api/protetta',
      // Firma inventata: la verifica HS256 deve rifiutarla.
      headers: { authorization: `Bearer ${config!.SUPABASE_ANON_KEY.slice(0, -5)}XXXXX` },
    });
    expect(esito.statusCode).toBe(401);
  });
});
