import { vocePerSdk } from './modelli.js';

/**
 * Crediti: l'unità del listino (pricing, 24/08/2026). Il canone include
 * `tenant.crediti_inclusi` al mese, i pacchetti si comprano e non scadono;
 * ogni operazione AI addebita crediti in proporzione al lavoro della
 * sessione (1 credito ogni 4 centesimi di calcolo, minimo 1): una risposta
 * tipica con Opus fa ~10, con Sonnet ~5, con un modello open 1-2; una
 * conversione di documento vale 1 fisso. Memoria, titoli e
 * suggerimenti sono inclusi.
 *
 * Specchio di `fe-angular/core/models/crediti.ts`.
 */

export type ClasseModello = 'opus' | 'sonnet' | 'haiku' | 'open';
export type OperazioneCrediti = 'risposta' | 'tabella' | 'agente' | 'conversione';

export interface SaldoCrediti {
  /** I crediti del canone per il mese corrente. */
  inclusi: number;
  inclusiUsati: number;
  /** Comprati con i pacchetti (più le rettifiche del gestore). */
  acquistati: number;
  acquistatiUsati: number;
  /** Ciò che resta da spendere, inclusi e pacchetti insieme. */
  disponibili: number;
}

export interface MovimentoCrediti {
  id: string;
  tipo: 'pacchetto' | 'rettifica' | 'addebito';
  crediti: number;
  operazione?: OperazioneCrediti;
  modello?: string;
  descrizione: string;
  istante: string;
}

export interface RiepilogoCrediti {
  saldo: SaldoCrediti;
  /**
   * Il listino: `perUsd` è il cambio (crediti per dollaro di calcolo, minimo 1
   * a operazione), le classi sono il «tipico» indicativo di una risposta,
   * `conversione` è fissa.
   */
  pesi: Record<ClasseModello | 'conversione' | 'perUsd', number>;
  /** Gli addebiti del mese corrente, per operazione. */
  meseCorrente: Record<OperazioneCrediti, number>;
  /** Gli ultimi movimenti, il più recente in cima. */
  movimenti: MovimentoCrediti[];
}

/** La classe di un modello: il peso segue questa, non il nome preciso. */
export function classeModello(sdk: string): ClasseModello {
  const voce = vocePerSdk(sdk);
  if (voce?.fornitore === 'hostyourai') return 'open';
  const nome = (voce?.sdk ?? sdk).toLowerCase();
  if (nome.includes('opus')) return 'opus';
  if (nome.includes('sonnet')) return 'sonnet';
  if (nome.includes('haiku')) return 'haiku';
  /* Un id sconosciuto (esperimenti via .env) si tratta come il più caro. */
  return 'opus';
}
