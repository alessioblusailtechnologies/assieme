import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { configurazione } from '../../config.js';

/**
 * I suggerimenti della schermata iniziale: a fine risposta si generano le
 * domande che avrebbero senso come passo successivo, e la home le propone
 * al posto degli esempi fissi. Interfaccia perché il gestore non deve
 * sapere chi suggerisce; un suggerimento mancato non è un errore.
 */
export interface GeneratoreSuggerimenti {
  genera(domanda: string, risposta: string): Promise<string[]>;
}

const ISTRUZIONI = `Sei chi propone le prossime domande in Velia, piattaforma AI per intermediari assicurativi italiani. Ricevi l'ultima domanda di un utente e l'inizio della risposta ricevuta.

Rispondi SOLO con un array JSON di 3 stringhe: tre domande brevi (massimo 12 parole l'una), in italiano, che quell'utente potrebbe sensatamente fare come passo successivo — più specifiche possibile rispetto a garanzie, prodotti, compagnie o clienti citati. Dai del tu. Niente numerazione, niente testo fuori dall'array.`;

export const schemaSuggerimenti = z.array(z.string().trim().min(1).max(300)).min(1).max(5);

export class GeneratoreSuggerimentiHaiku implements GeneratoreSuggerimenti {
  private readonly client: Anthropic;

  constructor() {
    const chiave = configurazione().ANTHROPIC_API_KEY;
    if (!chiave) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la generazione dei suggerimenti la richiede.');
    }
    this.client = new Anthropic({ apiKey: chiave });
  }

  async genera(domanda: string, risposta: string): Promise<string[]> {
    const messaggio = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: ISTRUZIONI,
      messages: [
        {
          role: 'user',
          content: `Domanda:\n${domanda.slice(0, 1500)}\n\nInizio della risposta:\n${risposta.slice(0, 2000)}`,
        },
      ],
    });
    const testo = messaggio.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return interpretaSuggerimenti(testo);
  }
}

/** Dal testo del modello all'elenco: tollera il JSON dentro una recinzione; se non c'è, lancia. */
export function interpretaSuggerimenti(testo: string): string[] {
  const inizio = testo.indexOf('[');
  const fine = testo.lastIndexOf(']');
  if (inizio < 0 || fine <= inizio) throw new Error('risposta senza array JSON');
  return schemaSuggerimenti.parse(JSON.parse(testo.slice(inizio, fine + 1))).slice(0, 3);
}
