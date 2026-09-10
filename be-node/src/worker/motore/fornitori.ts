import { vocePerSdk, type Tariffa } from '../../contratto/modelli.js';
import { avviaAdattatoreOpenAI, type AdattatoreOpenAI, type ProfiloFornitore } from './adattatore-openai.js';

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
 * Un id fuori dal banco dei fornitori terzi (`MODELLI_SERVITI`: tutti i
 * Claude, e gli esperimenti via .env) si tratta come Anthropic.
 */

export interface ChiaviFornitori {
  hostyourai?: { chiave?: string; baseUrl: string };
  aki?: { chiave?: string; baseUrl: string };
  /** `baseUrl` serve solo ai test (un finto fornitore): senza, l'API vera. */
  mistral?: { chiave?: string; baseUrl?: string };
  gemini?: { chiave?: string; baseUrl?: string };
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
      tariffa: voce.tariffa,
      ...(voce.fornitore === 'aki' && { usiInclusivi: true }),
    };
  }
  if (voce?.fornitore === 'mistral' || voce?.fornitore === 'gemini') {
    const scelte = DIALETTO_OPENAI[voce.fornitore];
    const dato = voce.fornitore === 'gemini' ? chiavi.gemini : chiavi.mistral;
    if (!dato?.chiave) throw new Error(`Il modello ${voce.nome} richiede ${scelte.variabile} in .env.`);
    const adattatore = await adattatoreCondiviso(voce.fornitore, {
      ...scelte.profilo,
      chiave: dato.chiave,
      ...(dato.baseUrl && { base: dato.baseUrl }),
    });
    return {
      env: ambientePuntato(ambienteProcesso, adattatore.url, adattatore.token),
      terzo: true,
      tariffa: voce.tariffa,
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
 * Chi parla il dialetto OpenAI, e in che cosa differisce. Sono le due
 * differenze viste dal vivo il 09/09/2026, non un'astrazione preventiva.
 */
const DIALETTO_OPENAI = {
  mistral: {
    variabile: 'MISTRAL_API_KEY',
    profilo: { base: 'https://api.mistral.ai', chiaveCache: true },
  },
  gemini: {
    variabile: 'GEMINI_API_KEY',
    /* Senza `stream_options` Gemini non manda gli usi, e con i tool in
       streaming risponde addirittura 403. */
    profilo: { base: 'https://generativelanguage.googleapis.com/v1beta/openai', usiInStreaming: true },
  },
} as const satisfies Record<string, { variabile: string; profilo: Omit<ProfiloFornitore, 'chiave'> }>;

/**
 * Un adattatore per fornitore, non per sessione: apre una porta, e non ha
 * senso aprirne una a ogni domanda. Non trattiene il processo (`unref`),
 * così gli strumenti di collaudo escono da soli.
 */
const adattatori = new Map<string, Promise<AdattatoreOpenAI>>();

function adattatoreCondiviso(fornitore: string, profilo: ProfiloFornitore): Promise<AdattatoreOpenAI> {
  const gia = adattatori.get(fornitore);
  if (gia) return gia;
  const nuovo = avviaAdattatoreOpenAI(profilo);
  adattatori.set(fornitore, nuovo);
  return nuovo;
}

/** Solo per i test: chiude gli adattatori, la prossima sessione li riapre. */
export async function dimenticaAdattatori(): Promise<void> {
  const aperti = [...adattatori.values()];
  adattatori.clear();
  for (const a of aperti) await (await a).chiudi();
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
