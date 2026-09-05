// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/config/env.mjs';
import {
  alternativeSitemap,
  fuoriSitemap,
  linguaSpenta,
  prioritaDi,
} from './src/config/sitemap.mjs';

/** I percorsi che la build ha davvero prodotto, riempito da `filter`. */
const costruite = new Set();

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  /*
   * Serve a `Astro.currentLocale` e a dichiarare le lingue una volta sola.
   * Le pagine francesi restano file veri sotto src/pages/fr: niente
   * `fallback`, che genererebbe pagine francesi con dentro l'italiano,
   * cioè esattamente il contenuto che gli hreflang promettono di non essere.
   */
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'fr'],
    routing: { prefixDefaultLocale: false },
  },
  build: {
    // Emette /piattaforma.html invece di /piattaforma/index.html: URL puliti,
    // senza slash finale, coerenti con i canonical e con la sitemap.
    format: 'file',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      /*
       * Niente opzione `i18n` qui: raggruppa le lingue per il percorso che
       * resta dopo il prefisso, quindi /piattaforma e /fr/plateforme non si
       * incontrerebbero mai e non uscirebbe alcun alternate. Con gli slug
       * tradotti gli alternate li mettiamo noi, dalla tabella delle rotte.
       */
      /*
       * `filter` gira su tutte le pagine prima di `serialize`, quindi qui si
       * raccoglie anche l'elenco di ciò che la build ha davvero prodotto:
       * serve a non dichiarare mai un alternate verso una pagina che non
       * esiste, che è il modo più rapido per far ignorare a Google l'intero
       * gruppo di hreflang.
       */
      // Le pagine noindex non devono finire nella sitemap.
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '') || '/';
        // Una lingua non ancora pubblicata non entra nemmeno in sitemap.
        if (linguaSpenta(path)) return false;
        costruite.add(path);
        if (fuoriSitemap(path)) return false;
        return !/\/(404|500)$/.test(page.replace(/\/$/, ''));
      },
      changefreq: 'weekly',
      lastmod: new Date(),
      // Priorità relativa fra le pagine. `changefreq` resta quello globale:
      // è un suggerimento che i crawler moderni ignorano quasi sempre, e
      // differenziarlo per pagina non porterebbe nulla.
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        const links = alternativeSitemap(path, SITE_URL).filter((l) =>
          costruite.has(new URL(l.url).pathname.replace(/\/$/, '') || '/'),
        );
        return {
          ...item,
          priority: prioritaDi(path),
          ...(links.length > 1 ? { links } : {}),
        };
      },
    }),
  ],
});
