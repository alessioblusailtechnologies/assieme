import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';
import { REGOLE_TRASCRIZIONE } from './convenzioni.js';

/**
 * Il secondo sguardo (§4b della skill `/ingest-visivo`).
 *
 * Una pagina segnalata dai testimoni, o marcata `[!ATTENZIONE]`, o pescata
 * nel campione di una ogni dieci, torna davanti al modello **in un contesto
 * separato**: non quello che l'ha trascritta. Chi ha scritto una pagina la
 * rilegge come l'ha scritta; chi la vede per la prima volta la rilegge come
 * sta sul foglio. È il motivo per cui nella skill è un subagente nuovo, e qui
 * è una chiamata a sé con la sola pagina e la sua trascrizione.
 *
 * La domanda è una sola: «la trascrizione dice tutto quello che dice la
 * pagina, e solo quello?». Se sì, il testo resta com'è; se no, il secondo
 * sguardo **riscrive la pagina** e dice cosa ha cambiato.
 */

const ISTRUZIONI = `Sei il secondo lettore di una pagina già trascritta da un collega, per l'archivio documentale di un'agenzia assicurativa. Non l'hai mai vista prima: è un vantaggio, non un limite.

Guarda la pagina allegata e leggi la trascrizione che ti viene data. Rispondi a una domanda sola: la trascrizione dice tutto quello che dice la pagina, e solo quello?

Guarda con attenzione particolare a: numeri, importi, percentuali, date, franchigie, massimali, riferimenti ad articoli; testo dentro figure, box colorati e tabelle disegnate; righe di tabella intere; il testo delle colonne nell'ordine giusto.

${REGOLE_TRASCRIZIONE}

Rispondi in UNA delle due forme, senza preamboli:

- se la trascrizione è fedele, esattamente la riga:
CONFERMATA

- se non lo è, la riga \`CORRETTA: <cosa hai cambiato, in una frase>\`, poi una riga vuota, poi la trascrizione corretta INTERA della pagina (solo il testo della pagina, senza ancore [pag. N], senza commenti).`;

export interface EsitoSecondoSguardo {
  /** Il testo della pagina dopo il controllo: uguale se confermata. */
  testo: string;
  /** Cosa è cambiato, per il log del job; assente se confermata. */
  correzione?: string;
}

export interface SecondoSguardo {
  ricontrolla(
    paginaPdf: Buffer,
    trascrizione: string,
    contesto: { pagina: number; motivo: string },
  ): Promise<EsitoSecondoSguardo>;
}

export class SecondoSguardoModello implements SecondoSguardo {
  private readonly client: Anthropic;
  private readonly modello: string;

  constructor() {
    const chiave = configurazione().ANTHROPIC_API_KEY;
    if (!chiave) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: il secondo sguardo la richiede.');
    }
    this.client = new Anthropic({ apiKey: chiave });
    this.modello = configurazione().MODELLO_INGESTION;
  }

  async ricontrolla(
    paginaPdf: Buffer,
    trascrizione: string,
    contesto: { pagina: number; motivo: string },
  ): Promise<EsitoSecondoSguardo> {
    const risposta = await this.client.messages.create({
      model: this.modello,
      max_tokens: 16000,
      system: ISTRUZIONI,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: paginaPdf.toString('base64'),
              },
            },
            {
              type: 'text',
              text:
                `Pagina ${contesto.pagina} del documento. Perché la ricontrolli: ${contesto.motivo}.\n\n` +
                `Trascrizione da verificare:\n\n---\n${trascrizione || '(pagina trascritta come vuota)'}\n---`,
            },
          ],
        },
      ],
    });

    const testo = risposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (/^CONFERMATA\b/i.test(testo)) return { testo: trascrizione };

    const corretta = testo.match(/^CORRETTA:\s*(.*?)\n\s*\n([\s\S]*)$/i);
    if (corretta) {
      return { testo: corretta[2]!.trim(), correzione: corretta[1]!.trim() };
    }

    /* Fuori contratto: si tiene la trascrizione di prima. Un secondo sguardo
       che non si capisce non deve poter peggiorare l'archivio. */
    return { testo: trascrizione };
  }
}
