import { AsyncLocalStorage } from 'node:async_hooks';

import type pg from 'pg';

import { costoATariffa, tariffaPerModello } from '../contratto/modelli.js';
import { usiInclusiviDi } from './motore/fornitori.js';

/**
 * I consumi dei compiti che chiamano l'API diretta (RF-F-03).
 *
 * Il motore, la memoria e le tabelle passano dall'Agent SDK, che di una
 * sessione dichiara i token e il costo: a loro basta scrivere la riga.
 * L'ingestion no — guarda le pagine con l'SDK Anthropic in mano — e fino al
 * 19/09/2026 non scriveva niente: `velia.consumi` prevedeva `origine =
 * 'ingestion'` fin dalla prima migrazione e quella riga non è mai esistita.
 * Era la parte piu' cara della piattaforma, e l'unica che nessuno poteva
 * misurare.
 *
 * Il contatore vive un job: le classi che chiamano il modello
 * (`convertitore`, `classificatore`, `secondo-sguardo`, lo `sceglitore`
 * dell'intestazione) segnano gli usi con `segnaUso`, il gestore raccoglie e
 * scrive una riga per modello. Il legame fra le due cose è
 * `AsyncLocalStorage`: senza, la firma di ogni chiamata dovrebbe portarsi
 * dietro un contatore fino all'ultimo blocco di pagine, e il giorno che un
 * ramo se lo dimentica i token spariscono in silenzio. Fuori da `contando`
 * non c'è contatore e `segnaUso` non fa niente: un test che chiama il
 * convertitore da solo non deve scrivere consumi.
 */

/** I token di una chiamata, come li conta l'API. */
export interface UsoModello {
  input: number;
  output: number;
  cacheLettura: number;
  cacheScrittura: number;
}

/**
 * Gli usi come li riporta un'API Anthropic-compatibile. Struttura e non
 * tipo dell'SDK: la stessa riga la manda DeepSeek dal suo endpoint.
 */
export interface UsiApi {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Quanto è costato un job, modello per modello. */
export class ContatoreConsumi {
  private readonly per = new Map<string, UsoModello>();

  aggiungi(modello: string, uso: UsoModello): void {
    const gia = this.per.get(modello) ?? { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 };
    this.per.set(modello, {
      input: gia.input + uso.input,
      output: gia.output + uso.output,
      cacheLettura: gia.cacheLettura + uso.cacheLettura,
      cacheScrittura: gia.cacheScrittura + uso.cacheScrittura,
    });
  }

  /**
   * Una voce per modello, col costo al listino. Un modello senza listino
   * (un esperimento via .env) vale zero e resta scritto col suo nome: il
   * buco si vede, invece di sparire dentro una somma.
   */
  voci(): Array<{ modello: string; uso: UsoModello; costoUsd: number }> {
    return [...this.per].map(([modello, uso]) => {
      const tariffa = tariffaPerModello(modello);
      return { modello, uso, costoUsd: tariffa ? costoATariffa(uso, tariffa) : 0 };
    });
  }

  get vuoto(): boolean {
    return this.per.size === 0;
  }
}

const corrente = new AsyncLocalStorage<ContatoreConsumi>();

/** Esegue il lavoro con un contatore attivo: dentro, `segnaUso` scrive lì. */
export function contando<T>(contatore: ContatoreConsumi, lavoro: () => Promise<T>): Promise<T> {
  return corrente.run(contatore, lavoro);
}

/**
 * Segna gli usi di una chiamata sul contatore del job in corso.
 *
 * Mai solleva: un consumo non registrato è un buco nei conti, una chiamata
 * fallita per i conti è un documento che non entra in archivio.
 */
export function segnaUso(modello: string, usi: UsiApi | null | undefined): void {
  const contatore = corrente.getStore();
  if (!contatore || !usi) return;
  const cacheLettura = usi.cache_read_input_tokens ?? 0;
  const cacheScrittura = usi.cache_creation_input_tokens ?? 0;
  /* Dove `input_tokens` comprende già la cache (AKI.IO, convenzione OpenAI)
     sommarla di nuovo la farebbe pagare due volte. */
  const input = usiInclusiviDi(modello)
    ? Math.max(0, usi.input_tokens - cacheLettura - cacheScrittura)
    : usi.input_tokens;
  contatore.aggiungi(modello, { input, output: usi.output_tokens, cacheLettura, cacheScrittura });
}

/**
 * Scrive i consumi del job: una riga per modello, origine `ingestion`.
 *
 * Si chiama anche quando il job è fallito a metà — i token spesi sono spesi
 * — e non fa mai fallire niente: se la scrittura dei conti non riesce, il
 * documento resta pronto e il log lo dice.
 */
export async function registraConsumi(
  db: pg.Pool,
  tenantId: string | null,
  jobId: string,
  contatore: ContatoreConsumi,
  origine: 'ingestion' = 'ingestion',
): Promise<void> {
  /* Un job senza tenant (i collaudi da riga di comando) non ha a chi
     intestare la spesa: `tenant_id` è not null, e va bene così. */
  if (!tenantId || contatore.vuoto) return;
  for (const { modello, uso, costoUsd } of contatore.voci()) {
    try {
      await db.query(
        `insert into velia.consumi
           (tenant_id, job_id, origine, modello, token_input, token_output,
            token_cache_lettura, token_cache_scrittura, costo_usd)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          jobId,
          origine,
          modello,
          uso.input,
          uso.output,
          uso.cacheLettura,
          uso.cacheScrittura,
          costoUsd,
        ],
      );
    } catch (errore) {
      console.error('[consumi] riga non scritta:', modello, errore);
    }
  }
}
