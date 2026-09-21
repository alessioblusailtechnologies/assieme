/** Le forme di `giri.mjs`, per i test del worker che lo importano. */
export interface ContatoreGiri {
  valuta(strumento: string, input: unknown): string | undefined;
  readonly giri: number;
}
export function contaGiri(massimo: number): ContatoreGiri;
