import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';
import type { Sceglicartella } from '../../archivio/collocazione.js';
import type { Sceglitore } from '../../archivio/clienti.js';
import type { Descrittore } from '../../archivio/convenzione.js';

/**
 * Le tre domande brevi che la Fase 10 fa al modello, e nessuna di più.
 *
 * Tutto il resto della collocazione è deterministico — normalizzazione,
 * match esatto, discesa nell'albero — e questa è la ragione per cui il
 * sistema regge su un archivio vero: il modello lo si chiama solo dove
 * serve davvero un giudizio, cioè su un'ambiguità, e mai per calcolare un
 * percorso.
 *
 * Regola comune a tutte e tre: **il modello sceglie fra ciò che gli
 * mostriamo, non oltre**. Un id che non è nell'elenco viene scartato dal
 * chiamante, esattamente come già si fa con le tassonomie in
 * `classificatore.ts`.
 */

function client(): Anthropic {
  const chiave = configurazione().ANTHROPIC_API_KEY;
  if (!chiave) throw new Error('ANTHROPIC_API_KEY mancante in .env');
  return new Anthropic({ apiKey: chiave });
}

/** Le domande di collocazione sono corte: un modello economico basta e avanza. */
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

const ISTRUZIONI_CARTELLA = `Lavori nell'archivio di un'agenzia assicurativa italiana. Ti do un documento appena arrivato e l'elenco delle cartelle in cui potrebbe andare, con la descrizione di cosa contengono. Devi dire in quale va.

Rispondi SOLO con un oggetto JSON:
- {"id": "<id di una delle cartelle elencate>"} se una è chiaramente la sua;
- {"incerto": true} se nessuna lo è in modo evidente.

Non proporre cartelle nuove e non scegliere per esclusione: "incerto" è una risposta giusta e frequente. Il documento finisce in «Da sistemare», resta cercabile e citabile come tutti gli altri, e qualcuno lo colloca quando passa di lì.`;

export class SceglicartellaModello implements Sceglicartella {
  async scegli(domanda: {
    titolo: string;
    tipologia: string;
    convenzione: string;
    cartelle: Array<{ id: string; percorso: string; descrizione?: string }>;
  }): Promise<{ id: string } | null> {
    const elenco = domanda.cartelle
      .map((c) => `- ${c.id}: ${c.percorso}${c.descrizione ? ` — ${c.descrizione}` : ''}`)
      .join('\n');
    const testo =
      (domanda.convenzione ? `${domanda.convenzione}\n\n---\n\n` : '') +
      `Documento: ${domanda.titolo}\nTipologia: ${domanda.tipologia}\n\n` +
      `Cartelle disponibili:\n${elenco}`;

    const risposta = estraiJson(await chiedi(ISTRUZIONI_CARTELLA, testo)) as {
      id?: unknown;
      incerto?: unknown;
    };
    if (risposta.incerto) return null;
    return typeof risposta.id === 'string' ? { id: risposta.id } : null;
  }
}

const ISTRUZIONI_DESCRIZIONE = `Lavori nell'archivio di un'agenzia assicurativa italiana. Per ogni cartella ti do il percorso e i titoli di alcuni documenti che contiene. Scrivi per ciascuna UNA riga che dica cosa ci va dentro, come la scriveresti per un collega appena arrivato.

Rispondi SOLO con un oggetto JSON che ha per chiave l'id della cartella e per valore la riga, così: {"<id>": "qui le circolari ANIA e le comunicazioni di aggiornamento normativo"}.

Una riga sola, in minuscolo, senza punto finale, massimo venticinque parole. Descrivi il criterio, non l'elenco: «i moduli in bianco da far firmare al cliente» è utile, «tre moduli e un listino» no. Se i titoli non bastano a capire un criterio, ometti quella chiave invece di inventarne uno.`;

export class DescrittoreModello implements Descrittore {
  async descrivi(
    cartelle: Array<{ id: string; percorso: string; titoli: string[] }>,
  ): Promise<Map<string, string>> {
    const testo = cartelle
      .map(
        (c) =>
          `## ${c.id}\nPercorso: ${c.percorso}\nDocumenti:\n${c.titoli.map((t) => `- ${t}`).join('\n')}`,
      )
      .join('\n\n');

    const risposta = estraiJson(await chiedi(ISTRUZIONI_DESCRIZIONE, testo, 1500));
    const mappa = new Map<string, string>();
    if (risposta && typeof risposta === 'object') {
      for (const [id, valore] of Object.entries(risposta as Record<string, unknown>)) {
        // Mai una descrizione su una cartella che non gli avevamo mostrato.
        if (typeof valore === 'string' && cartelle.some((c) => c.id === id)) {
          mappa.set(id, valore);
        }
      }
    }
    return mappa;
  }
}
