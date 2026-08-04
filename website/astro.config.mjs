// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

import { SITE_URL } from './src/config/env.mjs';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  build: {
    // Emette /piattaforma.html invece di /piattaforma/index.html: URL puliti,
    // senza slash finale, coerenti con i canonical e con la sitemap.
    format: 'file',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'it',
        locales: { it: 'it-IT' },
      },
      // Le pagine di sistema non devono finire nella sitemap.
      filter: (page) => !/\/(404|500)$/.test(page.replace(/\/$/, '')),
      changefreq: 'weekly',
      lastmod: new Date(),
      // Priorità relativa fra le pagine. `changefreq` resta quello globale:
      // è un suggerimento che i crawler moderni ignorano quasi sempre, e
      // differenziarlo per pagina non porterebbe nulla.
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, '') || '/';
        if (path === '/') return { ...item, priority: 1.0 };
        if (['/piattaforma', '/soluzioni', '/demo'].includes(path)) {
          return { ...item, priority: 0.9 };
        }
        if (path.startsWith('/legale/')) return { ...item, priority: 0.2 };
        return { ...item, priority: 0.7 };
      },
    }),
  ],
});
