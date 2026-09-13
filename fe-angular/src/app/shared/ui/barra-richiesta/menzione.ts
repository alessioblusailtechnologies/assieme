/**
 * Riconoscimento della menzione `@` nel testo in composizione (RF-C-02).
 *
 * Funzione pura, separata dal componente perché è il punto che si rompe in
 * silenzio: un falso positivo apre il selettore mentre si scrive un
 * indirizzo email, un falso negativo lo nega a chi lo sta chiedendo.
 */

export interface Menzione {
  /** Posizione del carattere `@` nel testo. */
  inizio: number;
  /** Ciò che l'utente ha digitato dopo la `@`, fino al cursore. */
  query: string;
}

/**
 * La menzione attiva alla posizione del cursore, se c'è.
 *
 * Una `@` conta come inizio di menzione solo a inizio testo o dopo uno
 * spazio o una parentesi aperta: `nome@dominio.it` non deve aprire il
 * selettore. La query si ferma al cursore e non contiene spazi né altre
 * `@` — appena l'utente esce dalla parola, la menzione non è più tale.
 */
export function menzioneAlCursore(testo: string, cursore: number): Menzione | undefined {
  const finoAlCursore = testo.slice(0, cursore);
  const corrispondenza = /(?:^|[\s([{])@([^\s@]*)$/.exec(finoAlCursore);
  if (!corrispondenza) return undefined;
  return {
    inizio: cursore - corrispondenza[1].length - 1,
    query: corrispondenza[1],
  };
}
