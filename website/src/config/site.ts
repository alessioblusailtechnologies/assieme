import {
  APP_URL,
  FORM_ACCESS_KEY,
  FORM_ENDPOINT,
  SITE_URL,
  STATUS_URL,
} from './env.mjs';

export { APP_URL, FORM_ACCESS_KEY, FORM_ENDPOINT, SITE_URL, STATUS_URL };

/* -------------------------------------------------------------------------
 * Identità
 *
 * Velia è il prodotto; il titolare è Blusail Technologies, come da
 * documento di analisi dei requisiti (v0.8).
 * ---------------------------------------------------------------------- */

export const site = {
  name: 'Velia',
  legalName: 'Blusail Technologies S.r.l.s.',
  /** Usato in `<title>` come suffisso e nei dati strutturati. */
  tagline: 'AI per la distribuzione assicurativa',
  locale: 'it_IT',
  lang: 'it',
  /** ⚠️ Ripreso dal design. Da confermare con la sede legale reale. */
  city: 'Milano',
  country: 'IT',
  foundingYear: 2025,
  email: 'ciao@sonovelia.it',
  social: {
    linkedin: 'https://www.linkedin.com/company/sono-velia',
    facebook: 'https://www.facebook.com/people/Sono-Velia/61593652101712/',
    instagram: 'https://www.instagram.com/sonovelia',
  },
} as const;

/* -------------------------------------------------------------------------
 * Navigazione principale
 * ---------------------------------------------------------------------- */

export type NavItem = {
  label: string;
  href: string;
  /** `true` per i link che escono dal sito istituzionale. */
  external?: boolean;
  description?: string;
};

export const primaryNav: NavItem[] = [
  { label: 'Piattaforma', href: '/piattaforma' },
  { label: 'Soluzioni', href: '/soluzioni' },
  { label: 'Clienti', href: '/clienti' },
  { label: 'Sicurezza', href: '/sicurezza' },
  { label: 'Risorse', href: '/risorse' },
  { label: 'Azienda', href: '/azienda' },
];

/* -------------------------------------------------------------------------
 * Footer
 * ---------------------------------------------------------------------- */

export type FooterColumn = { title: string; items: NavItem[] };

export const footerNav: FooterColumn[] = [
  {
    title: 'Piattaforma',
    items: [
      { label: 'Archivio pubblico', href: '/piattaforma#archivio-pubblico' },
      { label: 'Il tuo archivio', href: '/piattaforma#archivio-privato' },
      { label: 'Confronti e tabelle', href: '/piattaforma#confronto' },
      { label: 'Agenti', href: '/piattaforma#agenti' },
    ],
  },
  {
    title: 'Soluzioni',
    items: [
      { label: 'Agenzie', href: '/soluzioni#agenzie' },
      { label: 'Broker', href: '/soluzioni#broker' },
      { label: 'Intermediari', href: '/soluzioni#intermediari' },
      { label: 'Compagnie', href: '/soluzioni#compagnie' },
    ],
  },
  {
    title: 'Azienda',
    items: [
      { label: 'Chi siamo', href: '/azienda' },
      { label: 'Clienti', href: '/clienti' },
      { label: 'Sicurezza', href: '/sicurezza' },
      { label: 'Lavora con noi', href: '/azienda#lavora-con-noi' },
    ],
  },
  {
    title: 'Risorse',
    items: [
      { label: 'Guide', href: '/risorse#guide' },
      { label: 'Glossario', href: '/risorse#glossario' },
      { label: 'Assistenza', href: '/risorse#assistenza' },
      // La pagina di stato compare solo quando il sottodominio esiste:
      // un link che non risolve è un link rotto, per le persone e per gli audit.
      ...(STATUS_URL
        ? [{ label: 'Stato del servizio', href: STATUS_URL, external: true }]
        : []),
    ],
  },
  {
    title: 'Seguici',
    items: [
      { label: 'LinkedIn', href: site.social.linkedin, external: true },
      { label: 'Facebook', href: site.social.facebook, external: true },
      { label: 'Instagram', href: site.social.instagram, external: true },
    ],
  },
];

export const legalNav: NavItem[] = [
  { label: 'Privacy', href: '/legale/privacy' },
  { label: 'Cookie', href: '/legale/cookie' },
  { label: 'Note legali', href: '/legale/note-legali' },
];

/* -------------------------------------------------------------------------
 * Barra annunci
 * ---------------------------------------------------------------------- */

export const announcements: { label: string; text: string }[] = [
  {
    label: 'Novità',
    text: 'Tabelle di analisi: decine di prodotti a confronto, la fonte in ogni casella',
  },
  {
    label: 'Novità',
    text: 'I tuoi archivi ora parlano anche con gli strumenti AI che già usi',
  },
  {
    label: 'Novità',
    text: 'Documenti per il cliente già impaginati, col tuo marchio',
  },
];
