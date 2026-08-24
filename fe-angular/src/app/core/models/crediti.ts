import { IsoDateTime } from './comune';

/**
 * Crediti: l'unità del listino. Il canone include un lotto al mese, i
 * pacchetti si comprano e non scadono; ogni operazione AI ne addebita in
 * proporzione al lavoro fatto (token letti e scritti): una risposta tipica
 * con Claude Opus fa ~10, con Sonnet ~5, con un modello open 1-2; una
 * domanda breve 1; la conversione di un documento 1 fisso.
 * Memoria, titoli e suggerimenti sono inclusi.
 *
 * Nessuna scrittura dal client: i pacchetti li accredita il gestore, gli
 * addebiti li fa il sistema a fine lavoro.
 */

export type ClasseModello = 'opus' | 'sonnet' | 'haiku' | 'open';
export type OperazioneCrediti = 'risposta' | 'tabella' | 'agente' | 'conversione';

export interface SaldoCrediti {
  inclusi: number;
  inclusiUsati: number;
  acquistati: number;
  acquistatiUsati: number;
  /** Ciò che resta da spendere, inclusi e pacchetti insieme. */
  disponibili: number;
}

export interface MovimentoCrediti {
  id: string;
  tipo: 'pacchetto' | 'rettifica' | 'addebito';
  /** Negativo per gli addebiti. */
  crediti: number;
  operazione?: OperazioneCrediti;
  modello?: string;
  descrizione: string;
  istante: IsoDateTime;
}

export interface RiepilogoCrediti {
  saldo: SaldoCrediti;
  /**
   * Il listino: `perUsd` è il cambio (crediti per dollaro di calcolo, minimo 1
   * a operazione), le classi sono il «tipico» di una risposta, `conversione` è fissa.
   */
  pesi: Record<ClasseModello | 'conversione' | 'perUsd', number>;
  meseCorrente: Record<OperazioneCrediti, number>;
  movimenti: MovimentoCrediti[];
}
