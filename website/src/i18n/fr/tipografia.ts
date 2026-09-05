/**
 * La spaziatura tipografica francese, applicata una volta sola.
 *
 * In francese la punteggiatura doppia (`:` `;` `!` `?`) e i caporali
 * (`«  »`) vogliono uno spazio prima, e quello spazio deve essere
 * unificatore: con uno spazio normale i due punti possono finire da soli
 * all'inizio della riga successiva, che è il genere di dettaglio da cui un
 * lettore francese capisce che il testo è stato voltato e non scritto.
 *
 * Scrivere U+00A0 dentro ogni stringa del dizionario sarebbe illeggibile e
 * si dimenticherebbe. Le stringhe si scrivono quindi con spazi normali, e la
 * regola si applica qui, attraversando l'intero dizionario.
 *
 * Non tocca nient'altro: gli URL non hanno uno spazio prima dei due punti di
 * `https:`, e i segnaposto come `{n}` non contengono punteggiatura doppia.
 */

/**
 * Costruito da codice e non scritto come carattere: un U+00A0 letterale
 * nel sorgente è indistinguibile a occhio da uno spazio normale, e alla prima
 * modifica distratta diventa uno spazio normale senza che nessuno se ne
 * accorga.
 */
const UNIFICATORE = String.fromCharCode(0xa0);

export function spaziaturaFrancese(testo: string): string {
  return testo
    .replace(/ ([:;!?»])/g, `${UNIFICATORE}$1`)
    .replace(/« /g, `«${UNIFICATORE}`);
}

/**
 * La stessa regola su un frammento di HTML già reso.
 *
 * Serve alla prosa, che non passa dai dizionari: pagine legali e guide hanno
 * il contenuto dentro il markup, un file per lingua. Senza questo, il
 * francese delle pagine costruite a componenti avrebbe la tipografia giusta
 * e quello delle pagine di prosa no, che è peggio di non averla affatto.
 *
 * Trasforma solo il testo fra un tag e l'altro: dentro i tag ci sono gli
 * attributi, e lì un `href="https://…"` non va toccato.
 */
export function spaziaHtml(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((pezzo) => (pezzo.startsWith('<') ? pezzo : spaziaturaFrancese(pezzo)))
    .join('');
}

/** Applica la regola a ogni stringa di una struttura, comunque annidata. */
export function spazia<T>(valore: T): T {
  if (typeof valore === 'string') {
    return spaziaturaFrancese(valore) as T;
  }
  if (Array.isArray(valore)) {
    return valore.map(spazia) as T;
  }
  if (valore && typeof valore === 'object') {
    return Object.fromEntries(
      Object.entries(valore).map(([chiave, v]) => [chiave, spazia(v)]),
    ) as T;
  }
  return valore;
}
