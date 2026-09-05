/**
 * I tipi e le funzioni attorno alla tabella delle rotte.
 *
 * La tabella vera sta in `src/config/rotte.mjs`: la stessa che legge
 * `astro.config.mjs` per scrivere gli alternate in sitemap. Una sorgente
 * sola, due consumatori.
 */

import { rotte as tabella } from '~/config/rotte.mjs';
import { attiva, LINGUA_PREDEFINITA, type Lingua } from './lingue';
import { cleanPath } from '~/utils/url';

export const rotte = tabella;

export type ChiaveRotta = keyof typeof tabella;

/**
 * Una destinazione interna al sito: la rotta più, se serve, l'ancora della
 * sezione. L'ancora sta nel dizionario e non nella tabella perché si traduce
 * insieme al titolo di sezione che nomina.
 */
export type Destinazione =
  | { rotta: ChiaveRotta; ancora?: string }
  | { esterno: string };

/** Il percorso di una rotta in una lingua. */
export function percorso(chiave: ChiaveRotta, lingua: Lingua): string {
  return rotte[chiave][lingua];
}

/** L'href di una destinazione, interna o esterna. */
export function href(destinazione: Destinazione, lingua: Lingua): string {
  if ('esterno' in destinazione) return destinazione.esterno;
  const base = percorso(destinazione.rotta, lingua);
  return destinazione.ancora ? `${base}#${destinazione.ancora}` : base;
}

/** `true` se la destinazione esce dal sito. */
export function esterna(destinazione: Destinazione): boolean {
  return 'esterno' in destinazione;
}

/** La lingua di un percorso, dedotta dal prefisso. */
export function linguaDi(pathname: string): Lingua {
  const path = cleanPath(pathname);
  return path === '/fr' || path.startsWith('/fr/') ? 'fr' : LINGUA_PREDEFINITA;
}

/** La chiave di rotta di un percorso, se è una pagina in tabella. */
export function chiaveDi(pathname: string): ChiaveRotta | undefined {
  const path = cleanPath(pathname);
  const lingua = linguaDi(path);
  return (Object.keys(rotte) as ChiaveRotta[]).find(
    (chiave) => rotte[chiave][lingua] === path,
  );
}

export type Alternativa = { lingua: Lingua; href: string };

/**
 * Gli alternate hreflang di una pagina, **compreso l'autoriferimento**:
 * un hreflang che non nomina anche sé stesso Google lo scarta in blocco.
 *
 * Restituisce una lista vuota quando la pagina esiste in una lingua sola:
 * in quel caso non si emette nulla, perché un alternate non ricambiato è
 * peggio di nessun alternate.
 */
export function alternative(pathname: string): Alternativa[] {
  const chiave = chiaveDi(pathname);
  if (!chiave) return [];
  const trovate = (Object.keys(rotte[chiave]) as Lingua[])
    .filter(attiva)
    .map((lingua) => ({ lingua, href: rotte[chiave][lingua] }));
  return trovate.length > 1 ? trovate : [];
}

/**
 * Dove porta il selettore di lingua da una certa pagina: la gemella se
 * esiste, altrimenti la home dell'altra lingua. Mai un link rotto.
 */
export function gemella(pathname: string, verso: Lingua): string {
  const chiave = chiaveDi(pathname);
  return chiave ? rotte[chiave][verso] : rotte.home[verso];
}
