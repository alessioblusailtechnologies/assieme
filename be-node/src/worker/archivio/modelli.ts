import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';
import type { Sceglitore } from '../../archivio/clienti.js';

/**
 * La domanda breve che l'ingestion fa al modello, e nessuna di più.
 *
 * Erano tre (cliente, cartella, descrizione della cartella) finché
 * l'archivio era un albero; dal 12/09/2026 resta solo la prima, perché è
 * l'unica che riguardi un giudizio e non un calcolo. Tutto il resto
 * dell'intestazione è deterministico — normalizzazione, match esatto,
 * identificativi, somiglianza — ed è la ragione per cui regge su un
 * archivio vero: il modello si chiama solo sull'ambiguità.
 *
 * La regola resta: **il modello sceglie fra ciò che gli mostriamo, non
 * oltre**. Un id che non è nell'elenco viene scartato dal chiamante,
 * esattamente come già si fa con le tassonomie in `classificatore.ts`.
 */

function client(): Anthropic {
  const chiave = configurazione().ANTHROPIC_API_KEY;
  if (!chiave) throw new Error('ANTHROPIC_API_KEY mancante in .env');
  return new Anthropic({ apiKey: chiave });
}

/** La domanda è corta: un modello economico basta e avanza. */
function modello(): string {
  return configurazione().MODELLO_INGESTION_RAPIDA;
}

async function chiedi(system: string, testo: string, maxTokens = 300): Promise<string> {
  const risposta = await client().messages.create({
    model: modello(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: testo }],
  });
  return risposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

function estraiJson(testo: string): unknown {
  const inizio = testo.indexOf('{');
  const fine = testo.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) throw new Error('risposta senza oggetto JSON');
  return JSON.parse(testo.slice(inizio, fine + 1));
}

const ISTRUZIONI_CLIENTE = `Lavori nell'archivio di un'agenzia assicurativa italiana. Ti do il nome di un contraente così come compare su un documento appena arrivato, e l'elenco dei clienti già in anagrafica che gli somigliano. Devi dire se è uno di quelli oppure un cliente nuovo.

Rispondi SOLO con un oggetto JSON:
- {"id": "<id di uno dei candidati>"} se è lo stesso cliente scritto in un altro modo (abbreviazioni, nome e cognome invertiti, forma sociale aggiunta o tolta, errori di battitura evidenti);
- {"nuovo": true} se è chiaramente una persona o un'azienda diversa;
- {"incerto": true} se non riesci a decidere.

Due omonimi esistono: «Rossi Mario» e «Rossi Marco» non sono la stessa persona, e «Rossi Mario» e «Rossi Mario srl» spesso non lo sono nemmeno. Nel dubbio rispondi "incerto": il documento finirà in «Da sistemare» e qualcuno lo collocherà in due secondi, mentre un documento messo nella pratica del cliente sbagliato si scopre fra sei mesi.`;

export class SceglitoreModello implements Sceglitore {
  async scegli(domanda: {
    contraente: string;
    candidati: Array<{ id: string; nome: string; somiglianza: number }>;
    codiceFiscale?: string | null;
    partitaIva?: string | null;
  }): Promise<{ id: string } | { nuovo: true } | null> {
    const elenco = domanda.candidati
      .map((c) => `- ${c.id}: ${c.nome} (somiglianza ${c.somiglianza.toFixed(2)})`)
      .join('\n');
    const testo =
      `Contraente sul documento: ${domanda.contraente}\n` +
      (domanda.codiceFiscale ? `Codice fiscale: ${domanda.codiceFiscale}\n` : '') +
      (domanda.partitaIva ? `Partita IVA: ${domanda.partitaIva}\n` : '') +
      `\nClienti già in anagrafica:\n${elenco}`;

    const risposta = estraiJson(await chiedi(ISTRUZIONI_CLIENTE, testo)) as {
      id?: unknown;
      nuovo?: unknown;
      incerto?: unknown;
    };
    if (risposta.incerto) return null;
    if (typeof risposta.id === 'string') return { id: risposta.id };
    if (risposta.nuovo === true) return { nuovo: true };
    return null;
  }
}
