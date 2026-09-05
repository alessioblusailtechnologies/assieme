/**
 * L'accesso ai contenuti: `contenuti(lingua)` e nient'altro.
 *
 * Il contratto è il dizionario italiano. `Contenuti` è il suo tipo derivato,
 * quindi ogni altra lingua deve avere le stesse chiavi con le stesse forme:
 * una voce che manca o una che avanza non compila, e `astro check` gira già
 * dentro `npm run build`.
 */

import fr from './fr';
import it from './it';
import type { Lingua } from './lingue';

export type Contenuti = typeof it;

/**
 * Mappa completa, non parziale: dimenticare una lingua è un errore di
 * compilazione, non un ripiego silenzioso sull'italiano. Una pagina francese
 * non può finire per mostrare testo italiano senza che qualcuno se ne
 * accorga.
 */
const dizionari: Record<Lingua, Contenuti> = { it, fr };

export function contenuti(lingua: Lingua): Contenuti {
  return dizionari[lingua];
}

export { attiva, LINGUA_PREDEFINITA, lingue, lingueAttive, type Lingua } from './lingue';
export {
  alternative,
  chiaveDi,
  esterna,
  gemella,
  href,
  linguaDi,
  percorso,
  rotte,
  type Alternativa,
  type ChiaveRotta,
  type Destinazione,
} from './rotte';
