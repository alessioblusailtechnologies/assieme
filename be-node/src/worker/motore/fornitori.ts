import { vocePerSdk } from '../../contratto/modelli.js';

/**
 * Da dove si serve un modello (RF-D-03): Anthropic diretta, oppure un
 * fornitore con API Anthropic-compatibili — oggi HostYourAI, modelli open
 * in datacenter UE. La sessione del motore è la stessa: cambiano solo
 * l'endpoint e la chiave, passati all'Agent SDK come ambiente del processo.
 *
 * Un id fuori catalogo (esperimenti via .env) si tratta come Anthropic.
 */

export interface ChiaviFornitori {
  hostyourai?: { chiave?: string; baseUrl: string };
}

export interface AmbienteModello {
  /** L'ambiente da dare alla sessione; assente = quello del processo (Anthropic). */
  env?: Record<string, string>;
  /** Vero per i fornitori terzi: niente `effort`, costo a tariffa. */
  terzo: boolean;
  tariffaUsdPerMilione?: number;
}

export function ambienteModello(
  modello: string,
  chiavi: ChiaviFornitori,
  ambienteProcesso: NodeJS.ProcessEnv = process.env,
): AmbienteModello {
  const voce = vocePerSdk(modello);
  if (voce?.fornitore !== 'hostyourai') return { terzo: false };

  const chiave = chiavi.hostyourai?.chiave;
  if (!chiave) {
    throw new Error(`Il modello ${voce.nome} richiede HOSTYOURAI_API_KEY in .env.`);
  }
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(ambienteProcesso)) if (v !== undefined) env[k] = v;
  /* HostYourAI espone `/v1/messages` sulla radice e accetta la chiave come
     `x-api-key`: è ciò che Claude Code manda con ANTHROPIC_API_KEY. Il token
     OAuth, se presente nel processo, non deve prevalere. */
  env['ANTHROPIC_BASE_URL'] = chiavi.hostyourai!.baseUrl;
  env['ANTHROPIC_API_KEY'] = chiave;
  delete env['ANTHROPIC_AUTH_TOKEN'];
  delete env['CLAUDE_CODE_OAUTH_TOKEN'];
  return {
    env,
    terzo: true,
    ...(voce.tariffaUsdPerMilione !== undefined && { tariffaUsdPerMilione: voce.tariffaUsdPerMilione }),
  };
}

/** Il costo di una sessione su un fornitore terzo: token letti e scritti alla tariffa del listino. */
export function costoATariffa(
  token: { input: number; output: number; cacheLettura: number; cacheScrittura: number },
  tariffaUsdPerMilione: number,
): number {
  const totale = token.input + token.output + token.cacheLettura + token.cacheScrittura;
  return Math.round((totale * tariffaUsdPerMilione) / 1_000_000 * 1e6) / 1e6;
}
