import Anthropic from '@anthropic-ai/sdk';

import { configurazione } from '../../config.js';
import { servitoDaAnthropic } from '../../contratto/modelli.js';
import { clientPerModello } from '../cliente-modello.js';
import { segnaUso } from '../consumi.js';
import { promptBlocco, promptBloccoImmagini, REGOLE_CONVERSIONE } from './convenzioni.js';
import { pagineInPng } from './rasterizza.js';

/**
 * La conversione di un blocco di pagine PDF in Markdown con ancore.
 *
 * È un'interfaccia perché il gestore del job non deve sapere chi converte:
 * nei test è una funzione finta (zero chiamate API), in produzione è il
 * modello del livello del tenant (`TrascrittoriPerModello`).
 */
export interface Convertitore {
  convertiBlocco(
    pdfBlocco: Buffer,
    opzioni: { paginaIniziale: number; pagineTotali: number },
  ): Promise<string>;
  /**
   * Quante pagine per chiamata regge chi trascrive, e quante chiamate
   * insieme. Lo dice lui e non il gestore, perché dipende da quanto output
   * gli sta in una risposta: dieci pagine a Claude, una a DeepSeek. Assenti,
   * valgono le misure della skill (`gestore.ts`, `lettura-visiva.ts`).
   */
  pagineNelBlocco?: number | undefined;
  blocchiInsieme?: number | undefined;
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
 * Chi trascrive quando non è Anthropic: una pagina per chiamata, il tetto di
 * output che il collaudo ha visto reggere, e qualche chiamata in più insieme
 * perché a pagina singola le chiamate sono dieci volte tante.
 */
const PAGINA_SINGOLA = { pagineNelBlocco: 1, blocchiInsieme: 6, maxTokens: 8192 } as const;

/**
 * Il convertitore vero: il modello guarda le pagine e produce Markdown fedele.
 *
 * Quale modello lo decide il livello del tenant (`TrascrittoriPerModello`,
 * qui sotto). Da lì discende **come** si guardano le pagine:
 *
 * - **Anthropic** legge il PDF: gli si manda lo spezzone intero, dieci
 *   pagine per chiamata, e il testo vettoriale gli arriva tale e quale;
 * - **chiunque altro** (oggi DeepSeek) non sa leggere i PDF: le pagine
 *   diventano PNG a 150 dpi, una per chiamata. È la variante che il collaudo
 *   del 12/09/2026 ha promosso, e le mezze pagine quella che ha scartato.
 *
 * Streaming perché l'output di un blocco può essere lungo (decine di
 * migliaia di token): senza, si rischia il timeout HTTP dell'SDK.
 */
export class ConvertitoreModello implements Convertitore {
  private readonly client: Anthropic;
  private readonly modello: string;
  private readonly aPagine: boolean;
  readonly pagineNelBlocco: number | undefined;
  readonly blocchiInsieme: number | undefined;

  constructor(modello?: string) {
    const c = configurazione();
    this.modello = modello ?? c.MODELLO_LETTURA_VISIVA ?? c.MODELLO_MOTORE;
    this.client = clientPerModello(this.modello);
    this.aPagine = !servitoDaAnthropic(this.modello);
    this.pagineNelBlocco = this.aPagine ? PAGINA_SINGOLA.pagineNelBlocco : undefined;
    this.blocchiInsieme = this.aPagine ? PAGINA_SINGOLA.blocchiInsieme : undefined;
  }

  async convertiBlocco(
    pdfBlocco: Buffer,
    opzioni: { paginaIniziale: number; pagineTotali: number },
  ): Promise<string> {
    const contenuto = this.aPagine
      ? immaginiDelBlocco(pdfBlocco, opzioni)
      : [
          {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: pdfBlocco.toString('base64'),
            },
          },
          { type: 'text' as const, text: promptBlocco(opzioni.paginaIniziale, opzioni.pagineTotali) },
        ];

    const flusso = this.client.messages.stream({
      model: this.modello,
      max_tokens: this.aPagine ? PAGINA_SINGOLA.maxTokens : 32000,
      system: REGOLE_CONVERSIONE,
      messages: [{ role: 'user', content: contenuto }],
    });

    const messaggio = await flusso.finalMessage();
    segnaUso(this.modello, messaggio.usage);
    if (messaggio.stop_reason === 'max_tokens') {
      throw new Error(
        `conversione troncata (max_tokens) sul blocco da pag. ${opzioni.paginaIniziale}: ridurre PAGINE_PER_BLOCCO`,
      );
    }
    /* Il filtro dei contenuti è di Anthropic: sugli altri fornitori questo
       ramo non scatta, e le pagine di articoli di legge passano lisce. */
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

/**
 * Chi trascrive, per modello (21/09/2026).
 *
 * La trascrizione segue il livello che il tenant ha scelto nelle
 * Impostazioni, come la chat: Medio la fa Sonnet, Avanzato DeepSeek, Boost
 * Opus. Il 19/09 era DeepSeek per tutti, e un'agenzia che teneva i suoi dati
 * in Europa scegliendo Medio o Boost se li vedeva mandare in Cina lo stesso.
 *
 * L'ordine delle scelte:
 *  1. `forzato` (`MODELLO_LETTURA_VISIVA`): la piattaforma decide per tutti,
 *     per un collaudo o per spegnere un fornitore che non risponde;
 *  2. il modello del livello del tenant;
 *  3. `predefinito` (`MODELLO_MOTORE`): chi non ha scelto, e i pubblici.
 *
 * Un convertitore per modello, costruito alla prima richiesta e poi tenuto:
 * ognuno ha il suo client, e un fornitore senza chiave fa fallire solo i
 * documenti di chi lo usa, non tutti.
 */
export class TrascrittoriPerModello {
  private readonly pronti = new Map<string, Convertitore>();

  constructor(
    private readonly scelte: { forzato?: string | undefined; predefinito: string },
    private readonly crea: (modello: string) => Convertitore = (modello) => new ConvertitoreModello(modello),
  ) {}

  /** Il modello che trascrive per questo tenant. */
  modelloPer(modelloTenant: string | undefined): string {
    return this.scelte.forzato ?? modelloTenant ?? this.scelte.predefinito;
  }

  per(modelloTenant: string | undefined): Convertitore {
    const modello = this.modelloPer(modelloTenant);
    let convertitore = this.pronti.get(modello);
    if (!convertitore) {
      convertitore = this.crea(modello);
      this.pronti.set(modello, convertitore);
    }
    return convertitore;
  }
}

/** Le pagine del blocco come immagini, più il prompt che le numera. */
function immaginiDelBlocco(
  pdfBlocco: Buffer,
  opzioni: { paginaIniziale: number; pagineTotali: number },
): Anthropic.ContentBlockParam[] {
  const png = pagineInPng(pdfBlocco);
  return [
    ...png.map(
      (byte): Anthropic.ContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: byte.toString('base64') },
      }),
    ),
    {
      type: 'text',
      text: promptBloccoImmagini(opzioni.paginaIniziale, opzioni.pagineTotali, png.length),
    },
  ];
}
