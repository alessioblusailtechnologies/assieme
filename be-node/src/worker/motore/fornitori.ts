import { vocePerSdk, type Tariffa } from '../../contratto/modelli.js';
import { avviaAdattatoreMistral, type AdattatoreMistral } from './adattatore-mistral.js';

/**
 * Da dove si serve un modello (RF-D-03). Tre strade, e la sessione del
 * motore resta sempre la stessa — cambiano endpoint e chiave, passati
 * all'Agent SDK come ambiente del processo:
 *  - **Anthropic**, diretta;
 *  - **HostYourAI**, che parla già l'API di Anthropic (modelli open in
 *    datacenter UE): basta puntarcelo;
 *  - **Mistral**, che parla un altro formato: davanti gli si mette
 *    l'adattatore in-process (`adattatore-mistral.ts`), che vive sul
 *    localhost del worker e traduce.
 *
 * Un id fuori catalogo (esperimenti via .env) si tratta come Anthropic.
 */

export interface ChiaviFornitori {
  hostyourai?: { chiave?: string; baseUrl: string };
  aki?: { chiave?: string; baseUrl: string };
  /** `baseUrl` serve solo ai test (un finto Mistral): senza, l'API vera. */
  mistral?: { chiave?: string; baseUrl?: string };
}

export interface AmbienteModello {
  /** L'ambiente da dare alla sessione; assente = quello del processo (Anthropic). */
  env?: Record<string, string>;
  /** Vero per i fornitori terzi: niente `effort`, costo a tariffa. */
  terzo: boolean;
  tariffa?: Tariffa;
  /**
   * Vero dove `input_tokens` **comprende** già i token serviti dalla cache
   * (convenzione OpenAI, che AKI.IO porta dentro a un'API per il resto
   * anthropica). Anthropic invece li tiene separati: sommarli entrambi
   * farebbe pagare la cache due volte — sul collaudo del 09/09/2026 erano
   * 1,28 $ dichiarati contro 0,44 $ veri.
   */
  usiInclusivi?: boolean;
}

export async function ambienteModello(
  modello: string,
  chiavi: ChiaviFornitori,
  ambienteProcesso: NodeJS.ProcessEnv = process.env,
): Promise<AmbienteModello> {
  const voce = vocePerSdk(modello);
  /* I gateway che parlano già l'API di Anthropic: cambia solo dove si punta. */
  if (voce?.fornitore === 'hostyourai' || voce?.fornitore === 'aki') {
    const gateway = voce.fornitore === 'aki' ? chiavi.aki : chiavi.hostyourai;
    const variabile = voce.fornitore === 'aki' ? 'AKI_API_KEY' : 'HOSTYOURAI_API_KEY';
    if (!gateway?.chiave) throw new Error(`Il modello ${voce.nome} richiede ${variabile} in .env.`);
    return {
      env: ambientePuntato(ambienteProcesso, gateway.baseUrl, gateway.chiave),
      terzo: true,
      ...(voce.tariffa !== undefined && { tariffa: voce.tariffa }),
      ...(voce.fornitore === 'aki' && { usiInclusivi: true }),
    };
  }
  if (voce?.fornitore === 'mistral') {
    const chiave = chiavi.mistral?.chiave;
    if (!chiave) throw new Error(`Il modello ${voce.nome} richiede MISTRAL_API_KEY in .env.`);
    const adattatore = await adattatoreCondiviso(chiave, chiavi.mistral?.baseUrl);
    return {
      env: ambientePuntato(ambienteProcesso, adattatore.url, adattatore.token),
      terzo: true,
      ...(voce.tariffa !== undefined && { tariffa: voce.tariffa }),
    };
  }
  return { terzo: false };
}

/**
 * L'ambiente del processo con l'SDK puntato altrove. La chiave va come
 * `x-api-key`, che è ciò che Claude Code manda con `ANTHROPIC_API_KEY`: il
 * token OAuth, se il processo ne ha uno, non deve prevalere.
 */
function ambientePuntato(processo: NodeJS.ProcessEnv, baseUrl: string, chiave: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(processo)) if (v !== undefined) env[k] = v;
  env['ANTHROPIC_BASE_URL'] = baseUrl;
  env['ANTHROPIC_API_KEY'] = chiave;
  delete env['ANTHROPIC_AUTH_TOKEN'];
  delete env['CLAUDE_CODE_OAUTH_TOKEN'];
  return env;
}

/**
 * L'adattatore è uno per processo: apre una porta, e non ha senso aprirne
 * una per sessione. Non trattiene il processo (`unref`), così gli strumenti
 * di collaudo escono da soli.
 */
let adattatore: Promise<AdattatoreMistral> | undefined;

function adattatoreCondiviso(chiave: string, base?: string): Promise<AdattatoreMistral> {
  adattatore ??= avviaAdattatoreMistral({ chiave, ...(base && { base }) });
  return adattatore;
}

/** Solo per i test: chiude l'adattatore, la prossima sessione lo riapre. */
export async function dimenticaAdattatoreMistral(): Promise<void> {
  const attuale = adattatore;
  adattatore = undefined;
  if (attuale) await (await attuale).chiudi();
}

/**
 * Il costo di una sessione su un fornitore terzo, al listino del catalogo.
 * L'input ripetuto che il fornitore serve dalla cache ha un prezzo suo
 * (Mistral: un decimo); dove la cache non esiste — HostYourAI non ne fa —
 * i contatori stanno a zero e non cambia niente.
 */
export function costoATariffa(
  token: { input: number; output: number; cacheLettura: number; cacheScrittura: number },
  tariffa: Tariffa,
): number {
  const inCache = token.cacheLettura + token.cacheScrittura;
  const usd =
    (token.input * tariffa.input + inCache * (tariffa.cache ?? tariffa.input) + token.output * tariffa.output) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
