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
 * Il sito è statico: la ricezione è affidata a Web3Forms, che fa da staffetta
 * verso la casella dell'agenzia senza conservare gli invii. Il piano gratuito
 * accetta solo POST dal browser: qualunque test va fatto dalla pagina, non
 * da terminale.
 */
export const FORM_ENDPOINT =
  process.env.FORM_ENDPOINT || 'https://api.web3forms.com/submit';

/**
 * La access key di Web3Forms identifica la destinazione degli invii. È
 * pensata per stare in chiaro nell'HTML: non è un segreto, il filtro spam
 * sta nel campo botcheck e nei controlli del servizio.
 */
export const FORM_ACCESS_KEY =
  process.env.FORM_ACCESS_KEY || '932e5e9d-30dc-406e-82dd-6fb042b20a7e';
