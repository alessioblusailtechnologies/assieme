import type { APIRoute } from 'astro';

/**
 * Generato come endpoint e non come file statico in `public/`: così l'URL
 * della sitemap segue sempre il `site` configurato, anche cambiando dominio
 * fra staging e produzione.
 */
export const GET: APIRoute = ({ site }) => {
  const origin = (site?.href ?? 'https://www.assieme.ai').replace(/\/$/, '');

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    '# Pagine di servizio: nessun valore per l’indice.',
    'Disallow: /404',
    '',
    `Sitemap: ${origin}/sitemap-index.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
