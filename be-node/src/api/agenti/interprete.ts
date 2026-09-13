import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { configurazione } from '../../config.js';

/**
 * Chi legge la richiesta di un agente e ne scrive il piano (14/09/2026).
 *
 * Una chiamata sola, a ogni salvataggio di una richiesta nuova, con uno
 * strumento a schema fisso: il modello non risponde a parole, compila il
 * piano. Scrive i destinatari delle email **come la richiesta li nomina**
 * («me», un indirizzo, il marcatore di un cliente, un nome): a risolverli
 * nell'anagrafica ci pensa chi lo chiama (`piano.ts`), perché un indirizzo
 * non lo sceglie il modello.
 */

const TIPI_PASSO = ['leggi', 'cerca', 'confronta', 'genera-file', 'invia-email', 'altro'] as const;
const TIPI_LETTURA = ['documento', 'prodotto', 'cliente', 'archivio'] as const;

/** Il piano come lo scrive il modello: i destinatari ancora a parole. */
export const schemaPianoGrezzo = z.object({
  obiettivo: z.string().trim().min(1).max(400),
  passi: z
    .array(
      z.object({
        tipo: z.enum(TIPI_PASSO),
        titolo: z.string().trim().min(1).max(160),
        dettaglio: z.string().trim().max(400).optional(),
      }),
    )
    .min(1)
    .max(12),
  letture: z
    .array(
      z.object({
        tipo: z.enum(TIPI_LETTURA),
        etichetta: z.string().trim().min(1).max(200),
        riferimento: z.string().trim().max(300).optional(),
      }),
    )
    .max(20)
    .default([]),
  file: z
    .array(z.object({ formato: z.string().trim().min(1).max(12), descrizione: z.string().trim().min(1).max(300) }))
    .max(10)
    .default([]),
  email: z
    .array(
      z.object({
        a: z.string().trim().min(1).max(200),
        oggetto: z.string().trim().max(200).optional(),
        contenuto: z.string().trim().min(1).max(600),
        allegati: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
      }),
    )
    .max(10)
    .default([]),
  dubbi: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});

export type PianoGrezzo = z.infer<typeof schemaPianoGrezzo>;

export interface RichiestaPiano {
  agenzia: string;
  nome: string;
  /** La richiesta coi riferimenti resi «titolo», ciascuno col suo marcatore. */
  richiesta: string;
  riferimenti: Array<{ tipo: string; chiave: string; titolo: string }>;
  /** Quando corre, a parole; assente = solo quando qualcuno lo avvia. */
  quando?: string | undefined;
}

export interface InterpretePiano {
  interpreta(richiesta: RichiestaPiano): Promise<PianoGrezzo>;
}

const ISTRUZIONI = `Leggi la richiesta con cui un operatore di un'agenzia assicurativa definisce un agente di Velia, e scrivi il piano: che cosa farà l'agente ogni volta che parte. Il piano lo legge l'operatore prima di confermarlo, quindi deve dire con parole semplici che cosa succederà, senza aggiungere niente.

L'agente lavora come la chat di Velia: legge i documenti degli archivi (l'Archivio Pubblico coi set informativi delle compagnie, l'Archivio Privato coi documenti dell'agenzia e dei clienti), cerca fra i clienti e le loro polizze, confronta, prepara file in qualsiasi formato (PDF, Word, Excel, pagine web) e invia email. Mentre lavora non può fare domande a nessuno.

Come scrivere il piano:
- obiettivo: una frase su che cosa ottiene chi ha scritto la richiesta.
- passi: da 1 a 8, nell'ordine in cui l'agente li farà, ciascuno con un titolo breve al presente («Legge le condizioni di Km&Servizi», «Prepara il PDF del confronto», «Manda il PDF a Marta Ferrero») e, se serve, un dettaglio di una frase. Il tipo è leggi, cerca, confronta, genera-file, invia-email oppure altro.
- letture: ogni documento, prodotto o cliente referenziato, con riferimento uguale al suo marcatore come compare nell'elenco dei riferimenti (per esempio @[documento:doc-1]), e ogni porzione di archivio nominata a parole (tipo archivio, senza riferimento).
- file: uno per ogni file che la richiesta chiede di produrre, con l'estensione (pdf, docx, xlsx, html).
- email: una per destinatario. In «a» scrivi «me» se l'email è per chi ha scritto la richiesta («mandamela», «a me», «avvisami per email»); l'indirizzo, se è scritto; il marcatore del cliente, se il destinatario è un cliente referenziato; altrimenti il nome come è scritto. In «contenuto» una o due frasi su che cosa conterrà; in «allegati» i file del piano che porta, con la loro descrizione breve.
- dubbi: le cose che la richiesta lascia aperte e che l'agente non potrà chiedere mentre lavora (a chi mandare, quale edizione, entro quando), come domande brevi. Nessun dubbio di maniera: se la richiesta è chiara, la lista è vuota.

Regole:
- riporta quello che la richiesta chiede, non quello che sarebbe utile: niente passi, file, email o destinatari che la richiesta non nomina;
- un destinatario non si inventa e non si completa: se la richiesta dice «mandalo al cliente» senza dire quale, è un dubbio, non un'email;
- se la richiesta contiene parti fra parentesi quadre da completare («[scegli il prodotto]»), sono un dubbio;
- italiano semplice, frasi brevi, niente trattini lunghi.

Scrivi il piano con lo strumento scrivi_piano.`;

const SCHEMA_STRUMENTO: Anthropic.Tool.InputSchema = {
  type: 'object',
  properties: {
    obiettivo: { type: 'string' },
    passi: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: [...TIPI_PASSO] },
          titolo: { type: 'string' },
          dettaglio: { type: 'string' },
        },
        required: ['tipo', 'titolo'],
      },
    },
    letture: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: [...TIPI_LETTURA] },
          etichetta: { type: 'string' },
          riferimento: { type: 'string' },
        },
        required: ['tipo', 'etichetta'],
      },
    },
    file: {
      type: 'array',
      items: {
        type: 'object',
        properties: { formato: { type: 'string' }, descrizione: { type: 'string' } },
        required: ['formato', 'descrizione'],
      },
    },
    email: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          oggetto: { type: 'string' },
          contenuto: { type: 'string' },
          allegati: { type: 'array', items: { type: 'string' } },
        },
        required: ['a', 'contenuto'],
      },
    },
    dubbi: { type: 'array', items: { type: 'string' } },
  },
  required: ['obiettivo', 'passi', 'letture', 'file', 'email', 'dubbi'],
};

export class InterpretePianoAnthropic implements InterpretePiano {
  private readonly client: Anthropic;
  readonly modello: string;

  constructor() {
    const config = configurazione();
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la lettura del piano degli agenti la richiede.');
    }
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    this.modello = config.MODELLO_PIANO;
  }

  async interpreta(richiesta: RichiestaPiano): Promise<PianoGrezzo> {
    const risposta = await this.client.messages.create({
      model: this.modello,
      max_tokens: 4000,
      system: ISTRUZIONI,
      tools: [
        {
          name: 'scrivi_piano',
          description: 'Il piano dell’agente, ricavato dalla richiesta.',
          input_schema: SCHEMA_STRUMENTO,
        },
      ],
      tool_choice: { type: 'tool', name: 'scrivi_piano' },
      messages: [{ role: 'user', content: descriviRichiestaPiano(richiesta) }],
    });
    const blocco = risposta.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!blocco) throw new Error('il modello non ha scritto il piano');
    return ripulisciPiano(schemaPianoGrezzo.parse(blocco.input));
  }
}

/** Il messaggio per il modello: chi, quando, la richiesta e la legenda dei riferimenti. */
export function descriviRichiestaPiano(r: RichiestaPiano): string {
  return [
    `Agenzia: ${r.agenzia}`,
    `Nome dell'agente: ${r.nome}`,
    `Quando corre: ${r.quando ?? 'solo quando qualcuno lo avvia'}`,
    '',
    'Richiesta:',
    r.richiesta.trim(),
    '',
    'Riferimenti nella richiesta:',
    ...(r.riferimenti.length
      ? r.riferimenti.map((x) => `- @[${x.tipo}:${x.chiave}] ${x.tipo} «${x.titolo}»`)
      : ['- (nessuno)']),
  ].join('\n');
}

/** Niente trattini lunghi in quello che l'utente leggerà: la regola dei testi dell'app. */
export function ripulisciPiano(piano: PianoGrezzo): PianoGrezzo {
  return JSON.parse(JSON.stringify(piano).replace(/\s[—–]\s/g, ' - ').replace(/[—–]/g, '-')) as PianoGrezzo;
}

/** Il lettore vero solo con la chiave: senza, il piano resta da leggere e lo si dice. */
export function interpreteDallaConfigurazione(): InterpretePiano | undefined {
  return configurazione().ANTHROPIC_API_KEY ? new InterpretePianoAnthropic() : undefined;
}
