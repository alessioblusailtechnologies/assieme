import { ErroreApi } from '../../contratto/errori.js';
import { configurazione } from '../../config.js';

/**
 * La dettatura nel composer (29/08/2026): il browser registra, il server
 * trascrive con Voxtral (Mistral, dati in UE) e il testo torna nel campo.
 * Voxtral Mini Transcribe 2 via `voxtral-mini-latest`; `context_bias` porta
 * il gergo assicurativo, dove ogni trascrittore inciampa («Kasko» → «casco»).
 * Senza chiave la rotta risponde che non è configurata: il pulsante lo dice.
 */

export interface AudioDaTrascrivere {
  byte: Buffer;
  /** Il MIME del registratore del browser: `audio/webm`, `audio/mp4`, `audio/ogg`, `audio/wav`. */
  tipo: string;
  nome: string;
}

export interface OpzioniTrascrizione {
  log?: { warn: (obj: object, msg: string) => void } | undefined;
}

export interface Trascrittore {
  trascrivi(audio: AudioDaTrascrivere, opzioni?: OpzioniTrascrizione): Promise<string>;
}

/**
 * I termini da riconoscere al volo: sigle e nomi che il parlato assicurativo
 * usa di continuo e che un modello generalista scrive a orecchio. Voxtral
 * ne accetta fino a 100, e **solo parole singole**: uno spazio o una virgola
 * in un termine fa rifiutare l'intera richiesta (misurato il 29/08/2026, e
 * misurato anche che con «Kasko» e «AUTOPIÙ» in lista la frase di prova esce
 * giusta, accento compreso).
 */
export const TERMINI_ASSICURATIVI: readonly string[] = [
  'RCA', 'Kasko', 'CVT', 'DIP', 'CdA', 'IVASS', 'ANIA', 'CID', 'CARD',
  'franchigia', 'scoperto', 'massimale', 'premio', 'sinistro', 'rivalsa', 'quietanza', 'carenza',
  'recesso', 'disdetta', 'contraente', 'assicurato', 'beneficiario', 'cristalli', 'appendice',
  'Allianz', 'Generali', 'UnipolSai', 'Cattolica', 'AXA', 'Zurich', 'Nobis', 'Vittoria', 'Groupama',
  'Helvetia', 'Itas', 'Verti', 'ConTe', 'Genertel', 'Linear', 'Quixa', 'Prima', 'AUTOPIÙ', 'Velia',
];

/** Un termine è valido per Voxtral solo se è una parola sola. */
export const terminePerBias = (t: string): boolean => !/[\s,]/.test(t);

const ENDPOINT = 'https://api.mistral.ai/v1/audio/transcriptions';

export class TrascrittoreMistral implements Trascrittore {
  constructor(
    private readonly apiKey: string,
    readonly modello: string,
  ) {}

  async trascrivi(audio: AudioDaTrascrivere, opzioni: OpzioniTrascrizione = {}): Promise<string> {
    /* Le sigle in `context_bias` aiutano; se una versione dell'API le
       rifiutasse, si riprova senza: meglio una trascrizione senza aiuto che
       nessuna trascrizione. Ma si dice nel log: un ripiego muto è come si
       perde una settimana a chiedersi perché «Kasko» esce «casco». */
    let risposta = await this.chiama(audio, true);
    if (!risposta.ok && risposta.status >= 400 && risposta.status < 500) {
      const dettaglio = await risposta.text().catch(() => '');
      if (/context.?bias/i.test(dettaglio)) {
        opzioni.log?.warn({ stato: risposta.status, dettaglio: dettaglio.slice(0, 300) }, 'trascrizione: context_bias rifiutato, riprovo senza');
        risposta = await this.chiama(audio, false);
      } else throw erroreTrascrizione(risposta.status, dettaglio);
    }
    if (!risposta.ok) throw erroreTrascrizione(risposta.status, await risposta.text().catch(() => ''));
    const corpo = (await risposta.json()) as { text?: unknown };
    return ripulisciTrascrizione(typeof corpo.text === 'string' ? corpo.text : '');
  }

  private chiama(audio: AudioDaTrascrivere, conTermini: boolean): Promise<Response> {
    const form = new FormData();
    form.append('model', this.modello);
    form.append('language', 'it');
    form.append('file', new Blob([new Uint8Array(audio.byte)], { type: audio.tipo }), audio.nome);
    if (conTermini) for (const t of TERMINI_ASSICURATIVI.filter(terminePerBias)) form.append('context_bias', t);
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  }
}

function erroreTrascrizione(stato: number, dettaglio: string): ErroreApi {
  const messaggio =
    stato === 401 || stato === 403
      ? 'La chiave del servizio di trascrizione non è valida.'
      : stato === 429
        ? 'Il servizio di trascrizione è al limite: riprova fra qualche secondo.'
        : 'La trascrizione non è riuscita: riprova.';
  /* Il dettaglio del provider va nel log (via `cause`), non all'utente. */
  return Object.assign(new ErroreApi(502, 'TRASCRIZIONE_NON_RIUSCITA', messaggio), {
    cause: { stato, dettaglio: dettaglio.slice(0, 300) },
  });
}

/**
 * Il gergo scritto come si scrive in agenzia, non come suona: «casco» detto
 * in una frase assicurativa è la Kasko, «auto più» è l'AUTOPIÙ di Cattolica,
 * le sigle vanno in maiuscolo. Poche voci, con confine di parola, sempre le
 * stesse: l'utente rilegge comunque prima di inviare.
 */
/* Il `\b` di JavaScript conosce solo le lettere ASCII: dopo una «ù» non
   vede il confine. Confini di parola su lettere e cifre Unicode, a mano. */
const parola = (forma: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])(?:${forma})(?![\\p{L}\\p{N}])`, 'giu');

const GERGO: readonly [RegExp, string][] = [
  [parola('kasko|casco'), 'Kasko'],
  [parola('auto ?pi[uù]'), 'AUTOPIÙ'],
  [parola('unipol ?sai'), 'UnipolSai'],
  [parola('ivass'), 'IVASS'],
  [parola('ania'), 'ANIA'],
  [parola('r\\.?c\\.?a\\.?'), 'RCA'],
  [parola('dip'), 'DIP'],
  [parola('cvt'), 'CVT'],
];

export function normalizzaGergo(testo: string): string {
  let t = testo;
  for (const [forma, giusta] of GERGO) t = t.replace(forma, giusta);
  return t;
}

/**
 * Spazi doppi, spazi ai bordi, trattini lunghi: via; il gergo nella sua
 * forma; la maiuscola a inizio frase (un termine minuscolo in `context_bias`
 * la fa saltare al modello). Il resto è del parlante.
 */
export function ripulisciTrascrizione(testo: string): string {
  return normalizzaGergo(
    testo
      .replace(/[—–]/g, '-')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim(),
  )
    .replace(/^(\p{Ll})/u, (l) => l.toUpperCase())
    .replace(/([.!?]\s+)(\p{Ll})/gu, (_, prima: string, lettera: string) => prima + lettera.toUpperCase());
}

/** Il trascrittore vero solo con la chiave: senza, la rotta risponde che non è configurata. */
export function trascrittoreDallaConfigurazione(): Trascrittore | undefined {
  const config = configurazione();
  return config.MISTRAL_API_KEY ? new TrascrittoreMistral(config.MISTRAL_API_KEY, config.MODELLO_TRASCRIZIONE) : undefined;
}
