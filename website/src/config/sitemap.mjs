/**
 * Gli aiutanti della sitemap, in JavaScript perché `astro.config.mjs` gira
 * fuori dalla pipeline TypeScript.
 */

import { HREFLANG, LINGUE_ATTIVE, rotte } from './rotte.mjs';

const chiavi = Object.keys(rotte);

/**
 * Gli alternate di una pagina, nel formato che `@astrojs/sitemap` passa al
 * pacchetto `sitemap`, che li scrive come `xhtml:link rel="alternate"`.
 *
 * Comprendono l'autoriferimento: un hreflang che non nomina anche sé stesso
 * viene scartato in blocco. Se la pagina esiste in una lingua sola l'elenco
 * ha una voce e chi chiama non lo emette: un alternate non ricambiato è
 * peggio di nessun alternate.
 *
 * @param {string} percorso percorso pulito, es. `/piattaforma`
 * @param {string} origine radice del sito
 */
export function alternativeSitemap(percorso, origine) {
  const chiave = chiavi.find((k) =>
    Object.values(rotte[k]).includes(percorso),
  );
  if (!chiave) return [];

  return LINGUE_ATTIVE.filter((lingua) => rotte[chiave][lingua]).map(
    (lingua) => ({
      url: new URL(rotte[chiave][lingua], origine).href,
      lang: HREFLANG[lingua],
    }),
  );
}

/**
 * La priorità di una pagina, decisa sulla chiave di rotta e non sul percorso:
 * scritta sui percorsi italiani, manderebbe tutte le pagine francesi a 0,7 e
 * farebbe pesare le legali francesi più di quelle italiane.
 *
 * @param {string} percorso
 */
export function prioritaDi(percorso) {
  const chiave = chiavi.find((k) =>
    Object.values(rotte[k]).includes(percorso),
  );

  if (chiave === 'home') return 1.0;
  if (chiave && ['piattaforma', 'soluzioni', 'demo'].includes(chiave)) return 0.9;
  if (chiave && ['privacy', 'cookie', 'noteLegali'].includes(chiave)) return 0.2;
  return 0.7;
}
