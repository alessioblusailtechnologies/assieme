import type { APIRoute } from 'astro';
import { site } from '~/config/site';

/**
 * llms.txt (llmstxt.org): la presentazione del sito per i modelli e gli
 * assistenti AI, nello stesso spirito di robots.txt per i crawler. Markdown
 * essenziale: un titolo, un riassunto, le pagine che contano.
 */
export const GET: APIRoute = ({ site: siteUrl }) => {
  const origin = (siteUrl?.href ?? 'https://www.sonovelia.it').replace(/\/$/, '');

  const body = [
    `# ${site.name}`,
    '',
    `> Velia è l'AI di ${site.legalName} per la distribuzione assicurativa italiana: agenzie, broker e intermediari. Conosce i set informativi delle compagnie (DIP, DIP Aggiuntivo, Condizioni di Assicurazione), affianca l'archivio riservato dell'agenzia e risponde in italiano citando la fonte in ogni passaggio: documento, articolo, pagina. Quando la fonte non c'è, lo dice.`,
    '',
    'Le cose da sapere: ogni risposta porta la citazione al passaggio di origine; i confronti fra polizze e preventivi escono in tabelle con la fonte in ogni casella; i documenti per il cliente escono già impaginati col marchio dell\'agenzia; le regole e la casistica dell\'agenzia diventano memoria persistente, consultabile e cancellabile; gli archivi si collegano anche agli strumenti AI che l\'agenzia già usa.',
    '',
    '## Pagine principali',
    '',
    `- [Piattaforma](${origin}/piattaforma): l'archivio pubblico dei set informativi, l'archivio dell'agenzia, i confronti e le tabelle di analisi, gli agenti su pianificazione`,
    `- [Soluzioni](${origin}/soluzioni): come lavora con agenzie, broker, intermediari e compagnie`,
    `- [Sicurezza](${origin}/sicurezza): dove stanno i dati, come sono protetti, con le domande frequenti`,
    `- [Clienti](${origin}/clienti): i casi d'uso raccontati da chi la usa`,
    `- [Risorse](${origin}/risorse): guide pratiche e il glossario assicurativo`,
    `- [Azienda](${origin}/azienda): chi c'è dietro Velia`,
    `- [Richiedi una demo](${origin}/demo): una videochiamata sulla casistica reale dell'agenzia`,
    '',
    '## Contatti',
    '',
    `- Email: ${site.email}`,
    `- LinkedIn: ${site.social.linkedin}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
