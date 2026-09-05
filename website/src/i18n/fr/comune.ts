/**
 * Tutto ciò che compare su ogni pagina, in francese.
 *
 * Registro: si dà del «vous», e lo studio è un «cabinet», non un'«agence»
 * (che in Francia è quella dell'agent général). Vedi `glossario-fr.md`.
 *
 * Gli spazi prima di due punti, punti interrogativi ed esclamativi sono
 * U+00A0, non spazi normali: è la tipografia francese, e con uno spazio
 * normale la punteggiatura può andare a capo da sola.
 */

import { STATUS_URL, site } from '~/config/site';
import type { ColonnaFooter, VoceNav } from '~/i18n/tipi';

const nav: VoceNav[] = [
  { label: 'Plateforme', link: { rotta: 'piattaforma' } },
  { label: 'Solutions', link: { rotta: 'soluzioni' } },
  { label: 'Cas d’usage', link: { rotta: 'clienti' } },
  { label: 'Sécurité', link: { rotta: 'sicurezza' } },
  { label: 'Ressources', link: { rotta: 'risorse' } },
  { label: 'Entreprise', link: { rotta: 'azienda' } },
];

const footer: ColonnaFooter[] = [
  {
    title: 'Plateforme',
    items: [
      { label: 'Bibliothèque de marché', link: { rotta: 'piattaforma', ancora: 'bibliotheque' } },
      { label: 'Vos documents', link: { rotta: 'piattaforma', ancora: 'vos-documents' } },
      { label: 'Comparaisons et tableaux', link: { rotta: 'piattaforma', ancora: 'comparaison' } },
      { label: 'Agents', link: { rotta: 'piattaforma', ancora: 'agents' } },
    ],
  },
  {
    title: 'Solutions',
    items: [
      { label: 'Courtiers', link: { rotta: 'soluzioni', ancora: 'courtiers' } },
      { label: 'Agents généraux', link: { rotta: 'soluzioni', ancora: 'agents-generaux' } },
      { label: 'Mandataires', link: { rotta: 'soluzioni', ancora: 'mandataires' } },
      { label: 'Compagnies', link: { rotta: 'soluzioni', ancora: 'compagnies' } },
    ],
  },
  {
    title: 'Entreprise',
    items: [
      { label: 'Qui nous sommes', link: { rotta: 'azienda' } },
      { label: 'Cas d’usage', link: { rotta: 'clienti' } },
      { label: 'Sécurité', link: { rotta: 'sicurezza' } },
      { label: 'Nous rejoindre', link: { rotta: 'azienda', ancora: 'nous-rejoindre' } },
    ],
  },
  {
    title: 'Ressources',
    items: [
      { label: 'Guides', link: { rotta: 'risorse', ancora: 'guides' } },
      { label: 'Glossaire', link: { rotta: 'risorse', ancora: 'glossaire' } },
      { label: 'Assistance', link: { rotta: 'risorse', ancora: 'assistance' } },
      ...(STATUS_URL
        ? [{ label: 'État du service', link: { esterno: STATUS_URL } }]
        : []),
    ],
  },
  {
    title: 'Nous suivre',
    items: [
      { label: 'LinkedIn', link: { esterno: site.social.linkedin } },
      { label: 'Facebook', link: { esterno: site.social.facebook } },
      { label: 'Instagram', link: { esterno: site.social.instagram } },
    ],
  },
];

const legale: VoceNav[] = [
  { label: 'Confidentialité', link: { rotta: 'privacy' } },
  { label: 'Cookies', link: { rotta: 'cookie' } },
  { label: 'Mentions légales', link: { rotta: 'noteLegali' } },
];

const annunci: { label: string; text: string }[] = [
  {
    label: 'Nouveau',
    text: 'Tableaux d’analyse : des dizaines de produits comparés, la source dans chaque case',
  },
  {
    label: 'Nouveau',
    text: 'Vos documents dialoguent aussi avec les outils d’IA que vous utilisez déjà',
  },
  {
    label: 'Nouveau',
    text: 'Des documents client déjà mis en page, à vos couleurs',
  },
];

const comune = {
  /** Il saluto è il marchio: si adatta, non si traduce alla lettera. */
  saluto: 'Bonjour, je suis Velia.',
  tornaAllaHome: 'Velia, retour à l’accueil',
  tagline: 'L’IA de la distribution d’assurance',

  nav,
  navEtichetta: 'Navigation principale',
  navEtichettaCompatta: 'Navigation principale, version compacte',
  apriMenu: 'Ouvrir le menu',
  accedi: 'Se connecter',
  demo: 'Demander une démo',
  vaiAlContenuto: 'Aller au contenu principal',

  footer,
  legale,
  dirittiRiservati: 'Tous droits réservés',
  nuovaScheda: ' (s’ouvre dans un nouvel onglet)',

  annunci,
  annunciEtichetta: 'Nouveautés produit',

  briciole: {
    home: 'Accueil',
    etichetta: 'Fil d’Ariane',
  },

  selettoreLingua: 'Langue du site',

  chiusuraPredefinita: {
    title: 'Expliquez-lui votre façon de travailler. Une seule fois.',
    cta: 'Demander une démo',
  },
};

export default comune;
