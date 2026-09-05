import type { APIRoute } from 'astro';
import { site } from '~/config/site';
import { generaLlms } from '~/i18n/llms';

/** La versione francese di llms.txt, stesso generatore dell'italiana. */
export const GET: APIRoute = ({ site: siteUrl }) => {
  const origin = (siteUrl?.href ?? 'https://www.sonovelia.it').replace(/\/$/, '');

  return new Response(generaLlms('fr', origin, site), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
