import { describe, expect, it } from 'vitest';

import { catalogoModelli, versoModello } from '../src/contratto/modelli.js';
import { ambienteModello, costoATariffa } from '../src/worker/motore/fornitori.js';

/**
 * I fornitori terzi con API Anthropic-compatibili (RF-D-03): la sessione
 * del motore resta una, cambiano endpoint e chiave nell'ambiente del
 * processo; il catalogo mostra HostYourAI come selezionabile solo con la
 * chiave; il costo si calcola a tariffa perché l'SDK non conosce il listino.
 */
const chiavi = { hostyourai: { chiave: 'hyai-prova', baseUrl: 'https://hostyourai.com' } };

describe('l’ambiente della sessione per fornitore', () => {
  it('un modello Anthropic non tocca l’ambiente', () => {
    expect(ambienteModello('claude-opus-5', chiavi)).toEqual({ terzo: false });
    expect(ambienteModello('un-modello-sperimentale', chiavi)).toEqual({ terzo: false });
  });

  it('un modello HostYourAI punta l’SDK all’endpoint UE con la chiave hyai, senza token OAuth', () => {
    const processo = { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-ant-vera', CLAUDE_CODE_OAUTH_TOKEN: 'oauth', ANTHROPIC_AUTH_TOKEN: 'x' };
    const a = ambienteModello('zai-org/GLM-5.2', chiavi, processo);
    expect(a.terzo).toBe(true);
    expect(a.tariffaUsdPerMilione).toBe(1.73);
    expect(a.env).toMatchObject({ PATH: '/bin', ANTHROPIC_BASE_URL: 'https://hostyourai.com', ANTHROPIC_API_KEY: 'hyai-prova' });
    expect(a.env).not.toHaveProperty('CLAUDE_CODE_OAUTH_TOKEN');
    expect(a.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN');
  });

  it('senza chiave un modello HostYourAI non parte, e lo dice', () => {
    expect(() => ambienteModello('moonshotai/Kimi-K3', { hostyourai: { baseUrl: 'https://hostyourai.com' } })).toThrow(
      /HOSTYOURAI_API_KEY/,
    );
  });

  it('il costo a tariffa conta tutti i token, cache compresa', () => {
    expect(costoATariffa({ input: 500_000, output: 250_000, cacheLettura: 250_000, cacheScrittura: 0 }, 2)).toBe(2);
  });
});

describe('il catalogo con e senza chiave', () => {
  it('HostYourAI è selezionabile solo con la chiave; il resto non cambia', () => {
    const senza = catalogoModelli({ hostyourai: false });
    const con = catalogoModelli({ hostyourai: true });
    expect(senza.filter((m) => m.fornitore === 'hostyourai').every((m) => !m.disponibile)).toBe(true);
    expect(con.filter((m) => m.fornitore === 'hostyourai').every((m) => m.disponibile)).toBe(true);
    expect(senza.filter((m) => m.fornitore === 'anthropic').every((m) => m.disponibile)).toBe(true);
  });

  it('la forma pubblica non espone fornitore né tariffa', () => {
    const glm = catalogoModelli({ hostyourai: true }).find((m) => m.id === 'mod-glm-5-2')!;
    const pubblico = versoModello(glm) as unknown as Record<string, unknown>;
    expect(pubblico).not.toHaveProperty('sdk');
    expect(pubblico).not.toHaveProperty('fornitore');
    expect(pubblico).not.toHaveProperty('tariffaUsdPerMilione');
    expect(pubblico['provider']).toBe('HostYourAI (UE)');
  });
});
