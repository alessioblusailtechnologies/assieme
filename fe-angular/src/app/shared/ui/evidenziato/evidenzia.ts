/**
 * Evidenziazione dei termini cercati dentro un testo.
 *
 * Funzione pura e separata perché è il pezzo che rende scansionabile un
 * elenco di risultati: senza, otto titoli che cominciano tutti con «DIP
 * Danni — Allianz» si leggono uno per uno; con, l'occhio salta al punto che
 * ha fatto scattare la corrispondenza.
 *
 * Niente espressioni regolari: la query è testo scritto da una persona e può
 * contenere parentesi, punti e asterischi. Si scandisce con `indexOf`, che
 * non ha nulla da interpretare.
 */

export interface ParteEvidenziata {
  testo: string;
  /** Vero se questo tratto corrisponde a un termine cercato. */
  forte: boolean;
}

/**
 * Spezza `testo` nei tratti che corrispondono ai termini di `query` e in
 * quelli che non corrispondono.
 *
 * I termini si cercano **uno per uno**, non come frase: chi scrive «bonus
 * malus» si aspetta di vedere segnate le due parole anche dove il titolo le
 * separa. Sotto i due caratteri non si evidenzia: una «a» accesa in ogni
 * parola è rumore, non aiuto.
 */
export function evidenziaTermini(testo: string, query: string): ParteEvidenziata[] {
  const termini = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (!testo || !termini.length) return [{ testo, forte: false }];

  const basso = testo.toLowerCase();
  const coperto = new Array<boolean>(testo.length).fill(false);

  for (const termine of termini) {
    let da = basso.indexOf(termine);
    while (da !== -1) {
      for (let i = da; i < da + termine.length; i++) coperto[i] = true;
      da = basso.indexOf(termine, da + termine.length);
    }
  }

  /* I caratteri coperti si ricompattano in tratti: il template rende un nodo
     per tratto, non uno per carattere. */
  const parti: ParteEvidenziata[] = [];
  let inizio = 0;
  for (let i = 1; i <= testo.length; i++) {
    if (i === testo.length || coperto[i] !== coperto[inizio]) {
      parti.push({ testo: testo.slice(inizio, i), forte: coperto[inizio] });
      inizio = i;
    }
  }
  return parti;
}
