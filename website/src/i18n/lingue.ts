/**
 * Le lingue del sito.
 *
 * `lingueAttive` è l'interruttore generale: finché una lingua non ha le sue
 * pagine, resta fuori di qui e l'impianto multilingua è inerte. Niente
 * hreflang verso pagine che non esistono, niente selettore di lingua che
 * porta a un 404. Si accende tutto aggiungendo la lingua a quell'array.
 */

import { LINGUE_ATTIVE } from '~/config/rotte.mjs';

export type Lingua = 'it' | 'fr';

export const LINGUA_PREDEFINITA: Lingua = 'it';

/**
 * Le lingue effettivamente pubblicate. L'elenco vero sta in
 * `src/config/rotte.mjs`, perché lo legge anche la sitemap.
 */
export const lingueAttive = LINGUE_ATTIVE as Lingua[];

export type SchedaLingua = {
  /** Valore di `<html lang>`. */
  htmlLang: string;
  /** Valore di `hreflang`, con la regione. */
  hreflang: string;
  /** Valore di `og:locale`. */
  ogLocale: string;
  /** Locale per `Intl`, per le date lunghe delle guide e delle legali. */
  intl: string;
  /** Nome della lingua nella lingua stessa, per il selettore. */
  nome: string;
  /** Sigla breve, per la barra compatta. */
  sigla: string;
};

export const lingue: Record<Lingua, SchedaLingua> = {
  it: {
    htmlLang: 'it',
    hreflang: 'it-IT',
    ogLocale: 'it_IT',
    intl: 'it-IT',
    nome: 'Italiano',
    sigla: 'IT',
  },
  fr: {
    htmlLang: 'fr',
    hreflang: 'fr-FR',
    ogLocale: 'fr_FR',
    intl: 'fr-FR',
    nome: 'Français',
    sigla: 'FR',
  },
};

/** `true` se la lingua è pubblicata. */
export function attiva(lingua: Lingua): boolean {
  return lingueAttive.includes(lingua);
}
