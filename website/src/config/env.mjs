/**
 * Costanti condivise fra `astro.config.mjs` (che gira in Node, fuori dalla
 * pipeline TypeScript) e il codice dell'applicazione. Per questo è un `.mjs`.
 *
 * In produzione imposta `SITE_URL` come variabile d'ambiente: canonical,
 * sitemap e tag Open Graph la usano tutti come radice.
 */

export const SITE_URL = (
  process.env.SITE_URL || 'https://www.sonovelia.it'
).replace(/\/$/, '');

/** Sottodominio dell'applicativo: da sostituire con l'URL reale del login. */
export const APP_URL = process.env.APP_URL || 'https://app.sonovelia.it';

/** Pagina di stato del servizio, ospitata fuori dal sito istituzionale. */
export const STATUS_URL = process.env.STATUS_URL || 'https://status.sonovelia.it';

/**
 * Endpoint a cui il modulo «Richiedi una demo» invia i dati.
 *
 * Il sito è statico: non esiste un backend che possa riceverli. Va impostato
 * con l'URL del CRM, del form provider o di una funzione serverless PRIMA
 * della messa online — altrimenti le richieste di demo si perdono.
 */
export const FORM_ENDPOINT = process.env.FORM_ENDPOINT || '';
