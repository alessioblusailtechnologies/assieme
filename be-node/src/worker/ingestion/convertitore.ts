import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';
import { promptBlocco, REGOLE_CONVERSIONE } from './convenzioni.js';

/**
 * La conversione di un blocco di pagine PDF in Markdown con ancore.
 *
 * È un'interfaccia perché il gestore del job non deve sapere chi converte:
 * nei test è una funzione finta (zero chiamate API), in produzione è il
 * modello di `MODELLO_INGESTION`.
 */
export interface Convertitore {
  convertiBlocco(
    pdfBlocco: Buffer,
    opzioni: { paginaIniziale: number; pagineTotali: number },
  ): Promise<string>;
}

/**
 * Il filtro dei contenuti ha rifiutato il blocco.
 *
 * Non è un guasto: succede, in modo deterministico, sulle pagine che
 * riportano per esteso gli articoli del Codice civile («Norme di legge
 * richiamate in polizza»). La skill `/ingest-visivo` §2 dice cosa fare, e la
 * lettura visiva lo fa: riprovare a pagine singole, e per quelle che restano
 * mute prendere la lettura del testimone OCR, dichiarandolo. Un errore di
 * altra natura (modello irraggiungibile, chiave scaduta) non passa di qui e
 * fa fallire il job, com'è giusto.
 */
export class ErroreFiltroContenuti extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreFiltroContenuti';
  }
}

/**
 * Il convertitore vero: il modello legge il PDF e produce Markdown fedele.
 *
 * Quale modello lo dice `MODELLO_INGESTION` (default Opus): la lettura è il
 * pavimento dell'archivio, e una cifra sbagliata qui la ereditano chat,
 * tabelle e agenti.
 *
 * Streaming perché l'output di un blocco può essere lungo (decine di
 * migliaia di token): senza, si rischia il timeout HTTP dell'SDK.
 */
export class ConvertitoreModello implements Convertitore {
  private readonly client: Anthropic;
  private readonly modello: string;

  constructor() {
    const chiave = configurazione().ANTHROPIC_API_KEY;
    if (!chiave) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la conversione documenti la richiede.');
    }
    this.client = new Anthropic({ apiKey: chiave });
    this.modello = configurazione().MODELLO_INGESTION;
  }

  async convertiBlocco(
    pdfBlocco: Buffer,
    opzioni: { paginaIniziale: number; pagineTotali: number },
  ): Promise<string> {
    const flusso = this.client.messages.stream({
      model: this.modello,
      max_tokens: 32000,
      system: REGOLE_CONVERSIONE,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBlocco.toString('base64'),
              },
            },
            {
              type: 'text',
              text: promptBlocco(opzioni.paginaIniziale, opzioni.pagineTotali),
            },
          ],
        },
      ],
    });

    const messaggio = await flusso.finalMessage();
    if (messaggio.stop_reason === 'max_tokens') {
      throw new Error(
        `conversione troncata (max_tokens) sul blocco da pag. ${opzioni.paginaIniziale}: ridurre PAGINE_PER_BLOCCO`,
      );
    }
    if (messaggio.stop_reason === 'refusal') {
      throw new ErroreFiltroContenuti(
        `blocco da pag. ${opzioni.paginaIniziale} rifiutato dal filtro dei contenuti`,
      );
    }

    return messaggio.content
      .filter((blocco): blocco is Anthropic.TextBlock => blocco.type === 'text')
      .map((blocco) => blocco.text)
      .join('\n');
  }
}
