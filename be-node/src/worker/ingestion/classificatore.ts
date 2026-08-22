import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { configurazione } from '../../config.js';
import { TIPOLOGIE } from '../../contratto/documenti.js';

/** Una voce di tassonomia come la vede il classificatore: id e nome. */
export interface VoceTassonomia {
  id: string;
  nome: string;
}

export interface ContestoClassificazione {
  /** Il nome del file caricato: spesso dice già tutto («preventivo-rossi-unipol.pdf»). */
  nomeFile: string;
  /** L'inizio del Markdown convertito: le prime pagine bastano a capire cos'è. */
  estratto: string;
  compagnie: VoceTassonomia[];
  rami: VoceTassonomia[];
}

/**
 * La proposta (RF-B-03): sempre correggibile dall'utente, mai definitiva.
 * `compagniaId` e `ramoId` sono id delle tassonomie passate nel contesto,
 * o assenti se il documento non ne parla.
 */
export const schemaProposta = z.object({
  tipologia: z.enum(TIPOLOGIE),
  compagniaId: z.string().nullable().optional(),
  ramoId: z.string().nullable().optional(),
  /** Cliente o pratica (es. «Rossi Mario», «polizza 123456»). */
  riferimentoCliente: z.string().trim().max(200).nullable().optional(),
});

export type PropostaClassificazione = z.infer<typeof schemaProposta>;

/**
 * Il passo 3 della pipeline (VELIA-piano-sviluppo-be.md §4.2): tipologia,
 * compagnia, ramo e cliente proposti dal modello. Interfaccia perché il
 * gestore non deve sapere chi classifica: nei test è una risposta fissa.
 */
export interface Classificatore {
  classifica(contesto: ContestoClassificazione): Promise<PropostaClassificazione>;
}

const ISTRUZIONI = `Sei il classificatore documentale di Velia, piattaforma AI per intermediari assicurativi italiani. Ricevi l'inizio di un documento caricato da un'agenzia nel suo archivio privato e devi proporne la classificazione.

Rispondi SOLO con un oggetto JSON, senza commenti né testo attorno, con queste chiavi:
- "tipologia": una fra ${TIPOLOGIE.map((t) => `"${t}"`).join(', ')}. Se non sei sicuro usa "altro".
- "compagniaId": l'id della compagnia fra quelle elencate, oppure null se il documento non riguarda una di quelle.
- "ramoId": l'id del ramo fra quelli elencati, oppure null.
- "riferimentoCliente": il nome del cliente o il riferimento della pratica (contraente, numero di polizza o preventivo) se il documento è di un cliente specifico, altrimenti null. Breve: massimo una riga.

Non inventare id: usa solo quelli elencati. Quando il testo è ambiguo preferisci null a una scelta tirata a indovinare.`;

/**
 * Il classificatore vero: Haiku, una chiamata breve sul solo estratto (il
 * documento intero l'ha già letto il convertitore). Se il modello risponde
 * fuori contratto, la classificazione resta quella iniziale: una proposta
 * mancata non è un errore di ingestion.
 */
export class ClassificatoreHaiku implements Classificatore {
  private readonly client: Anthropic;

  constructor() {
    const chiave = configurazione().ANTHROPIC_API_KEY;
    if (!chiave) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la classificazione la richiede.');
    }
    this.client = new Anthropic({ apiKey: chiave });
  }

  async classifica(contesto: ContestoClassificazione): Promise<PropostaClassificazione> {
    const elenco = (voci: VoceTassonomia[]) => voci.map((v) => `- ${v.id}: ${v.nome}`).join('\n');
    const risposta = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: ISTRUZIONI,
      messages: [
        {
          role: 'user',
          content:
            `Nome del file: ${contesto.nomeFile}\n\n` +
            `Compagnie:\n${elenco(contesto.compagnie)}\n\n` +
            `Rami:\n${elenco(contesto.rami)}\n\n` +
            `Inizio del documento:\n\n${contesto.estratto}`,
        },
      ],
    });

    const testo = risposta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return interpretaProposta(testo);
  }
}

/**
 * Dal testo del modello alla proposta validata. Tollera il JSON dentro a
 * una recinzione o con testo attorno; se non c'è un oggetto valido lancia.
 */
export function interpretaProposta(testo: string): PropostaClassificazione {
  const inizio = testo.indexOf('{');
  const fine = testo.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) throw new Error('risposta senza oggetto JSON');
  return schemaProposta.parse(JSON.parse(testo.slice(inizio, fine + 1)));
}

/** Quanti caratteri del Markdown passare al classificatore. */
export const CARATTERI_ESTRATTO = 6000;
