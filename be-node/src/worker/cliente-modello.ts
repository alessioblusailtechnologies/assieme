import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../config.js';
import { vocePerSdk } from '../contratto/modelli.js';

/**
 * Il client per un modello, chiunque lo serva (RF-D-03).
 *
 * Il motore non passa di qui: l'Agent SDK gira in un processo figlio e il
 * fornitore glielo si dice con l'ambiente (`motore/fornitori.ts`). Chi invece
 * chiama l'API in-process — l'ingestion — ha bisogno di un client vero, e
 * dal 19/09/2026 non è più detto che sia Anthropic: la trascrizione delle
 * pagine sta su DeepSeek.
 *
 * Funziona perché HostYourAI, AKI.IO e DeepSeek parlano **già** l'API di
 * Anthropic: cambia l'indirizzo, non il codice che ci scrive contro. Mistral
 * e Gemini no, e lì questo client non basta: lo dice invece di provarci.
 */
export function clientPerModello(sdk: string): Anthropic {
  const c = configurazione();
  const voce = vocePerSdk(sdk);

  if (!voce) {
    /* Nessuna voce nel banco: è un Claude, o un esperimento via .env che si
       tratta come tale. */
    if (!c.ANTHROPIC_API_KEY) {
      throw new Error(`ANTHROPIC_API_KEY mancante in .env: il modello ${sdk} la richiede.`);
    }
    return new Anthropic({ apiKey: c.ANTHROPIC_API_KEY });
  }

  const gateway = {
    hostyourai: { chiave: c.HOSTYOURAI_API_KEY, baseURL: c.HOSTYOURAI_BASE_URL, variabile: 'HOSTYOURAI_API_KEY' },
    aki: { chiave: c.AKI_API_KEY, baseURL: c.AKI_BASE_URL, variabile: 'AKI_API_KEY' },
    deepseek: { chiave: c.DEEPSEEK_API_KEY, baseURL: c.DEEPSEEK_BASE_URL, variabile: 'DEEPSEEK_API_KEY' },
  }[voce.fornitore as 'hostyourai' | 'aki' | 'deepseek'];

  if (!gateway) {
    throw new Error(
      `${voce.nome} parla il dialetto OpenAI: in-process non si può chiamare direttamente, ` +
        `serve l'adattatore del motore (worker/motore/adattatore-openai.ts).`,
    );
  }
  if (!gateway.chiave) {
    throw new Error(`Il modello ${voce.nome} richiede ${gateway.variabile} in .env.`);
  }
  return new Anthropic({ apiKey: gateway.chiave, baseURL: gateway.baseURL });
}
