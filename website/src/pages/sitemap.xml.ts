import type { APIRoute } from 'astro';

/**
 * Alias del percorso convenzionale: molti strumenti (e qualche motore)
 * cercano la sitemap a /sitemap.xml prima ancora di leggere robots.txt.
 * In una build statica non si può rispondere con un redirect, quindi qui
 * si serve un indice equivalente che punta al file vero di @astrojs/sitemap
 * (`sitemap-0.xml`, nome stabile dell'integrazione).
 */
export const GET: APIRoute = ({ site }) => {
  const origin = (site?.href ?? 'https://www.sonovelia.it').replace(/\/$/, '');

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap>`,
    '</sitemapindex>',
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
