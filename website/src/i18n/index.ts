/**
 * L'accesso ai contenuti: `contenuti(lingua)` e nient'altro.
 *
 * Il contratto è il dizionario italiano. `Contenuti` è il suo tipo derivato,
 * quindi ogni altra lingua deve avere le stesse chiavi con le stesse forme:
 * una voce che manca o una che avanza non compila, e `astro check` gira già
 * dentro `npm run build`.
 */

import it from './it';
import { LINGUA_PREDEFINITA, type Lingua } from './lingue';

export type Contenuti = typeof it;

/**
 * ⚠️ Quando il francese entra, questa mappa diventa
 * `Record<Lingua, Contenuti>` e il tipo `Partial` sparisce: da lì in poi
 * dimenticare una lingua è un errore di compilazione, non un ripiego
 * silenzioso sull'italiano.
 */
const dizionari: Partial<Record<Lingua, Contenuti>> = { it };

export function contenuti(lingua: Lingua): Contenuti {
  return dizionari[lingua] ?? dizionari[LINGUA_PREDEFINITA] ?? it;
}

export { LINGUA_PREDEFINITA, lingue, lingueAttive, type Lingua } from './lingue';
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
