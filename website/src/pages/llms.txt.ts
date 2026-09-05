import type { APIRoute } from 'astro';
import { site } from '~/config/site';
import { generaLlms } from '~/i18n/llms';

/**
 * llms.txt (llmstxt.org): la presentazione del sito per i modelli e gli
 * assistenti AI, nello stesso spirito di robots.txt per i crawler.
 *
 * Il testo si costruisce dal dizionario della lingua: il francese avrà il suo
 * su /fr/llms.txt, con lo stesso generatore.
 */
export const GET: APIRoute = ({ site: siteUrl }) => {
  const origin = (siteUrl?.href ?? 'https://www.sonovelia.it').replace(/\/$/, '');

  return new Response(generaLlms('it', origin, site), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
