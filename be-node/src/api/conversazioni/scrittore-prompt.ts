import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';

/**
 * «Scrivi il prompt» nel composer (29/08/2026): l'utente butta giù due
 * parole, il modello le riscrive come una richiesta completa per Velia,
 * che l'utente rilegge, ritocca e manda. Non risponde alla domanda: la
 * formula. Stesso schema dei suggerimenti della home: una chiamata breve,
 * un modello economico, nessun credito addebitato (è aiuto alla scrittura,
 * non lavoro sui documenti).
 */
export interface RichiestaPrompt {
  /** Ciò che l'utente ha scritto, com'è. */
  abbozzo: string;
  /** I titoli dei documenti nel contesto o referenziati nella bozza. */
  documenti: string[];
  agenzia: string;
}

export interface ScrittorePrompt {
  scrivi(richiesta: RichiestaPrompt): Promise<string>;
}

const ISTRUZIONI = `Sei chi aiuta un operatore di agenzia assicurativa a scrivere la richiesta da fare a Velia, l'assistente AI che risponde sui documenti assicurativi (set informativi, DIP, condizioni, preventivi) e produce confronti, tabelle e documenti con le fonti citate.

Ricevi un abbozzo scritto di fretta e i titoli dei documenti che l'operatore ha già messo nel contesto. Riscrivi l'abbozzo come UN prompt chiaro e completo, in italiano, in prima persona come lo scriverebbe l'operatore.

Velia trova da sola i documenti nei suoi archivi (l'archivio pubblico con i set informativi delle compagnie e l'archivio privato dell'agenzia): se nel contesto non ci sono documenti, il prompt chiede a Velia di cercare quelli giusti (compagnia, prodotto, edizione), MAI all'operatore di caricarli o di dire quali servono.

Regole:
- conserva l'intento e ogni dettaglio dell'abbozzo (garanzie, importi, cliente, veicolo, date): non inventare fatti, non aggiungere dati che non ci sono;
- rendi esplicito cosa deve produrre Velia (una risposta, un confronto, una tabella, un elenco, una bozza di email o di documento) e per chi è (un cliente, un collega, uso interno), se l'abbozzo lo lascia capire;
- se ci sono documenti nel contesto, nominali per titolo e di' cosa cercarci; se l'abbozzo chiede un confronto, chiedi una tabella con le voci che contano;
- chiedi le fonti (pagina o articolo) per le affermazioni sui documenti, e di segnalare ciò che nei documenti non c'è;
- niente preamboli, niente saluti, niente spiegazioni, niente frasi sul perché serve: solo il prompt; da 2 a 5 frasi, massimo 90 parole; senza elenchi puntati, senza emoji, senza trattini lunghi.

Rispondi SOLO con il testo del prompt.`;

export class ScrittorePromptAnthropic implements ScrittorePrompt {
  private readonly client: Anthropic;
  readonly modello: string;

  constructor() {
    const config = configurazione();
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: «Scrivi il prompt» la richiede.');
    }
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    this.modello = config.MODELLO_PROMPT;
  }

  async scrivi(richiesta: RichiestaPrompt): Promise<string> {
    const messaggio = await this.client.messages.create({
      model: this.modello,
      /* Largo: sui modelli col pensiero adattivo il ragionamento conta nel tetto. */
      max_tokens: 2000,
      system: ISTRUZIONI,
      messages: [{ role: 'user', content: descriviRichiesta(richiesta) }],
    });
    const testo = messaggio.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return ripulisciPrompt(testo);
  }
}

/** Il messaggio utente: l'abbozzo e ciò che l'operatore ha davanti. */
export function descriviRichiesta(r: RichiestaPrompt): string {
  return [
    `Agenzia: ${r.agenzia}`,
    'Documenti nel contesto:',
    ...(r.documenti.length ? r.documenti.map((d) => `- ${d}`) : ['- (nessuno)']),
    '',
    'Abbozzo:',
    r.abbozzo.trim(),
  ].join('\n');
}

/**
 * Il testo del modello, pulito: via virgolette che lo avvolgono, via un
 * eventuale «Prompt:» in testa, trattini lunghi in trattini semplici, righe
 * vuote doppie compresse. Vuoto se non resta niente.
 */
export function ripulisciPrompt(testo: string): string {
  let t = testo.trim();
  t = t.replace(/^(prompt|richiesta)\s*:\s*/i, '');
  if ((t.startsWith('«') && t.endsWith('»')) || (t.startsWith('"') && t.endsWith('"'))) t = t.slice(1, -1).trim();
  t = t.replace(/\s[—–]\s/g, ' - ').replace(/[—–]/g, '-');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/** Lo scrittore vero solo con la chiave: senza, la rotta risponde che non è disponibile. */
export function scrittoreDallaConfigurazione(): ScrittorePrompt | undefined {
  return configurazione().ANTHROPIC_API_KEY ? new ScrittorePromptAnthropic() : undefined;
}
