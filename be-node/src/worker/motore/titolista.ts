import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';

/**
 * Il titolo della conversazione (RF-C-01): all'invio del primo messaggio
 * l'API mette un provvisorio (le prime parole della domanda), e a risposta
 * pronta il worker lo sostituisce con un titolo che abbia senso — generato
 * dal modello su domanda e risposta, mai sulle prime parole e basta.
 *
 * Interfaccia perché il gestore non deve sapere chi intitola: nei test è
 * una risposta fissa. Un titolo mancato non è un errore: resta il
 * provvisorio, che è comunque leggibile.
 */
export interface GeneratoreTitolo {
  genera(domanda: string, risposta: string): Promise<string>;
}

const ISTRUZIONI = `Sei chi dà il titolo alle conversazioni di Velia, piattaforma AI per intermediari assicurativi italiani. Ricevi la prima domanda di una conversazione e l'inizio della risposta.

Rispondi SOLO con il titolo: in italiano, massimo 6 parole, concreto e specifico (garanzia, prodotto, compagnia o cliente se ci sono), senza virgolette, senza punto finale, senza la parola "conversazione". Esempi dello stile: «Franchigie Furto e Rapina Km&Servizi», «Confronto polizza Cattolica e preventivo Unipol», «Esclusioni rally nella polizza auto».`;

export class GeneratoreTitoloHaiku implements GeneratoreTitolo {
  private readonly client: Anthropic;

  constructor() {
    const chiave = configurazione().ANTHROPIC_API_KEY;
    if (!chiave) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la generazione dei titoli la richiede.');
    }
    this.client = new Anthropic({ apiKey: chiave });
  }

  async genera(domanda: string, risposta: string): Promise<string> {
    const messaggio = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 50,
      system: ISTRUZIONI,
      messages: [
        {
          role: 'user',
          content: `Domanda:\n${domanda.slice(0, 1500)}\n\nInizio della risposta:\n${risposta.slice(0, 1500)}`,
        },
      ],
    });
    const testo = messaggio.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join(' ');
    return ripulisciTitolo(testo);
  }
}

/** Dal testo del modello al titolo: una riga sola, senza virgolette né punto, mai oltre i 60 caratteri. */
export function ripulisciTitolo(testo: string): string {
  const pulito = testo
    .split('\n')
    .map((r) => r.trim())
    .find(Boolean)
    ?.replace(/^["'«»“”\s]+|["'«»“”\s.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!pulito) return '';
  if (pulito.length <= 60) return pulito;
  const tronco = pulito.slice(0, 60);
  const spazio = tronco.lastIndexOf(' ');
  return `${tronco.slice(0, spazio > 20 ? spazio : 60)}…`;
}
