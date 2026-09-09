import { afterAll, describe, expect, it } from 'vitest';

import { catalogoModelli, versoModello } from '../src/contratto/modelli.js';
import { ambienteModello, costoATariffa, dimenticaAdattatoreMistral } from '../src/worker/motore/fornitori.js';

/**
 * I fornitori oltre ad Anthropic (RF-D-03): la sessione del motore resta
 * una, cambiano endpoint e chiave nell'ambiente del processo; il catalogo
 * mostra una voce come selezionabile solo con la chiave del suo fornitore;
 * il costo si calcola a tariffa perché l'SDK non conosce quei listini.
 */
const chiavi = {
  hostyourai: { chiave: 'hyai-prova', baseUrl: 'https://hostyourai.com' },
  /* Un Mistral che non esiste: l'adattatore si apre lo stesso, e finché
     nessuno gli manda una sessione non chiama nessuno. */
  mistral: { chiave: 'mistral-prova', baseUrl: 'http://127.0.0.1:9' },
};

afterAll(async () => {
  await dimenticaAdattatoreMistral();
});

describe('l’ambiente della sessione per fornitore', () => {
  it('un modello Anthropic non tocca l’ambiente', async () => {
    expect(await ambienteModello('claude-opus-5', chiavi)).toEqual({ terzo: false });
    expect(await ambienteModello('un-modello-sperimentale', chiavi)).toEqual({ terzo: false });
  });

  it('un modello HostYourAI punta l’SDK all’endpoint UE con la chiave hyai, senza token OAuth', async () => {
    const processo = { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant-vera', CLAUDE_CODE_OAUTH_TOKEN: 'oauth', ANTHROPIC_AUTH_TOKEN: 'x' };
    const a = await ambienteModello('zai-org/GLM-5.2', chiavi, processo);
    expect(a.terzo).toBe(true);
    expect(a.tariffa).toEqual({ input: 1.73, output: 5.18 });
    expect(a.env).toMatchObject({ PATH: '/bin', ANTHROPIC_BASE_URL: 'https://hostyourai.com', ANTHROPIC_API_KEY: 'hyai-prova' });
    expect(a.env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
    expect(a.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
  });

  it('un modello Mistral punta l’SDK all’adattatore in-process, non a Mistral', async () => {
    const a = await ambienteModello('mistral-large-2512', chiavi, { PATH: '/bin' });
    expect(a.terzo).toBe(true);
    expect(a.tariffa).toEqual({ input: 0.5, output: 1.5, cache: 0.05 });
    expect(a.env?.['ANTHROPIC_BASE_URL']).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    /* La chiave che l'SDK usa è il token dell'adattatore: quella di Mistral
       resta nel processo e non passa mai per l'ambiente del sottoprocesso. */
    expect(a.env?.['ANTHROPIC_API_KEY']).not.toBe('mistral-prova');
    expect(a.env?.['ANTHROPIC_API_KEY']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('l’adattatore è uno solo, non uno per sessione', async () => {
    const prima = await ambienteModello('mistral-large-2512', chiavi, {});
    const dopo = await ambienteModello('mistral-large-2512', chiavi, {});
    expect(dopo.env?.['ANTHROPIC_BASE_URL']).toBe(prima.env?.['ANTHROPIC_BASE_URL']);
  });

  it('senza chiave un modello di un fornitore terzo non parte, e lo dice', async () => {
    await expect(ambienteModello('moonshotai/Kimi-K3', { hostyourai: { baseUrl: 'https://hostyourai.com' } })).rejects.toThrow(
      /HOSTYOURAI_API_KEY/,
    );
    await expect(ambienteModello('mistral-large-2512', {})).rejects.toThrow(/MISTRAL_API_KEY/);
  });

  it('il costo a tariffa: la cache al suo prezzo, dove il fornitore ce l’ha', () => {
    /* 500k letti a 2 € + 250k dalla cache a 0,2 € + 250k scritti a 10 €. */
    expect(
      costoATariffa(
        { input: 500_000, output: 250_000, cacheLettura: 200_000, cacheScrittura: 50_000 },
        { input: 2, output: 10, cache: 0.2 },
      ),
    ).toBe(3.55);
    /* Senza prezzo di cache (HostYourAI, che non ne fa) vale come input. */
    expect(
      costoATariffa({ input: 500_000, output: 250_000, cacheLettura: 200_000, cacheScrittura: 50_000 }, { input: 2, output: 10 }),
    ).toBe(4);
  });
});

describe('il catalogo con e senza chiave', () => {
  it('una voce di fornitore terzo è selezionabile solo con la sua chiave', () => {
    const senza = catalogoModelli({ hostyourai: false, mistral: false });
    const con = catalogoModelli({ hostyourai: true, mistral: true });
    expect(senza.filter((m) => m.fornitore === 'hostyourai').every((m) => !m.disponibile)).toBe(true);
    expect(senza.filter((m) => m.fornitore === 'mistral').every((m) => !m.disponibile)).toBe(true);
    expect(con.filter((m) => m.fornitore === 'hostyourai').every((m) => m.disponibile)).toBe(true);
    expect(con.filter((m) => m.fornitore === 'mistral').every((m) => m.disponibile)).toBe(true);
    expect(senza.filter((m) => m.fornitore === 'anthropic').every((m) => m.disponibile)).toBe(true);
    /* Le chiavi non si fanno da spalla: quella di uno non alza l'altro. */
    const soloMistral = catalogoModelli({ hostyourai: false, mistral: true });
    expect(soloMistral.find((m) => m.id === 'mod-glm-5-2')?.disponibile).toBe(false);
    expect(soloMistral.find((m) => m.id === 'mod-mistral-large-3')?.disponibile).toBe(true);
  });

  it('la forma pubblica non espone fornitore né tariffa', () => {
    const glm = catalogoModelli({ hostyourai: true, mistral: true }).find((m) => m.id === 'mod-glm-5-2')!;
    const pubblico = versoModello(glm) as unknown as Record<string, unknown>;
    expect(pubblico).not.toHaveProperty('sdk');
    expect(pubblico).not.toHaveProperty('fornitore');
    expect(pubblico).not.toHaveProperty('tariffa');
    expect(pubblico['provider']).toBe('HostYourAI (UE)');
  });
});
