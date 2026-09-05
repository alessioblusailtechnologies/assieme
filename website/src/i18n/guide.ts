/**
 * Gli alternate hreflang delle guide.
 *
 * Le guide sono rotte dinamiche e non stanno nella tabella delle rotte: il
 * legame fra le due versioni lo dichiara il frontmatter, con la chiave
 * `gemella`. Qui quel legame diventa una lista di alternate con le stesse
 * regole di tutto il resto: autoriferimento sempre incluso, e niente del
 * tutto quando la gemella non esiste o la sua lingua non è pubblicata.
 */

import { attiva, type Lingua } from './lingue';
import { percorso, type Alternativa } from './rotte';

/** L'URL di una guida nella sua lingua. */
export function percorsoGuida(slug: string, lingua: Lingua): string {
  return `${percorso('risorse', lingua)}/${slug}`;
}

/**
 * Gli alternate di una guida. `gemella` è lo slug della stessa guida
 * nell'altra lingua, quando la traduzione esiste.
 */
export function alternativeGuida(
  slug: string,
  lingua: Lingua,
  gemella: string | undefined,
): Alternativa[] {
  const altra: Lingua = lingua === 'it' ? 'fr' : 'it';
  if (!gemella || !attiva(lingua) || !attiva(altra)) return [];

  const coppia: Alternativa[] = [
    { lingua, href: percorsoGuida(slug, lingua) },
    { lingua: altra, href: percorsoGuida(gemella, altra) },
  ];

  // In ordine di lingua, così l'x-default cade sulla predefinita.
  return coppia.sort((a, b) => (a.lingua === 'it' ? -1 : b.lingua === 'it' ? 1 : 0));
}
