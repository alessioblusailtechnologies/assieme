/**
 * La tabella delle rotte: la sorgente unica dei percorsi del sito.
 *
 * È un `.mjs` per lo stesso motivo di `env.mjs`: `astro.config.mjs` gira in
 * Node, fuori dalla pipeline TypeScript, e la sitemap ha bisogno di questa
 * tabella per scrivere gli alternate hreflang. Da qui la importano sia la
 * configurazione sia `src/i18n/rotte.ts`, che ci mette sopra i tipi.
 *
 * L'italiano sta alla radice senza prefisso, il francese sotto /fr con gli
 * slug tradotti: `/fr/plateforme`, non `/fr/piattaforma`.
 */

export const rotte = {
  home: { it: '/', fr: '/fr' },
  piattaforma: { it: '/piattaforma', fr: '/fr/plateforme' },
  soluzioni: { it: '/soluzioni', fr: '/fr/solutions' },
  clienti: { it: '/clienti', fr: '/fr/clients' },
  sicurezza: { it: '/sicurezza', fr: '/fr/securite' },
  risorse: { it: '/risorse', fr: '/fr/ressources' },
  azienda: { it: '/azienda', fr: '/fr/entreprise' },
  demo: { it: '/demo', fr: '/fr/demander-une-demo' },
  demoGrazie: { it: '/demo/grazie', fr: '/fr/demander-une-demo/merci' },
  privacy: { it: '/legale/privacy', fr: '/fr/legal/confidentialite' },
  cookie: { it: '/legale/cookie', fr: '/fr/legal/cookies' },
  noteLegali: { it: '/legale/note-legali', fr: '/fr/legal/mentions-legales' },
  nonTrovata: { it: '/404', fr: '/fr/404' },
};

/**
 * Le lingue effettivamente pubblicate.
 *
 * Finché una lingua non ha le sue pagine resta fuori di qui, e tutto
 * l'impianto multilingua è inerte: nessun hreflang verso pagine che non
 * esistono, nessun selettore di lingua che porta a un 404. Il francese è pubblicato
 * dal 05/09/2026.
 */
export const LINGUE_ATTIVE = ['it', 'fr'];

export const LINGUA_PREDEFINITA = 'it';

/** hreflang per lingua, usato anche dalla sitemap. */
export const HREFLANG = { it: 'it-IT', fr: 'fr-FR' };
