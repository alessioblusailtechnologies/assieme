/**
 * llms.txt in francese, servito su /fr/llms.txt.
 *
 * `{azienda}` è sostituito con la ragione sociale. Come nel resto del sito
 * francese, la biblioteca di mercato non si promette come già pronta.
 */

import type { ChiaveRotta } from '~/i18n/rotte';

const llms: {
  sommario: string;
  daSapere: string;
  titoloPagine: string;
  pagine: { rotta: ChiaveRotta; label: string; nota: string }[];
  titoloContatti: string;
  etichettaEmail: string;
} = {
  sommario:
    'Velia est l’IA de {azienda} pour la distribution d’assurance : courtiers, agents généraux et mandataires. Elle travaille sur les documentations précontractuelles des assureurs (IPID, notices, conditions générales) et sur les documents confidentiels du cabinet, et répond en français en citant sa source à chaque passage : document, article, page. Quand la source n’existe pas, elle le dit.',
  daSapere:
    'Ce qu’il faut savoir : chaque réponse porte la citation du passage dont elle vient ; les comparaisons entre contrats et devis sortent en tableaux avec la source dans chaque case ; les documents client sortent déjà mis en page aux couleurs du cabinet ; les règles et les cas du cabinet deviennent une mémoire persistante, consultable et effaçable ; les documents sont aussi accessibles depuis les outils d’IA que le cabinet utilise déjà.',
  titoloPagine: 'Pages principales',
  pagine: [
    {
      rotta: 'piattaforma',
      label: 'Plateforme',
      nota: 'la bibliothèque de marché constituée avec le cabinet, les documents du cabinet, les comparaisons et les tableaux d’analyse, les agents programmés',
    },
    {
      rotta: 'soluzioni',
      label: 'Solutions',
      nota: 'comment elle travaille avec les courtiers, les agents généraux, les mandataires et les compagnies',
    },
    {
      rotta: 'sicurezza',
      label: 'Sécurité',
      nota: 'où sont les données, comment elles sont protégées, avec les questions fréquentes',
    },
    {
      rotta: 'clienti',
      label: 'Cas d’usage',
      nota: 'trois démonstrations sur des documents réels',
    },
    {
      rotta: 'risorse',
      label: 'Ressources',
      nota: 'guides pratiques et glossaire de l’assurance',
    },
    {
      rotta: 'azienda',
      label: 'Entreprise',
      nota: 'qui est derrière Velia',
    },
    {
      rotta: 'demo',
      label: 'Demander une démo',
      nota: 'une visioconférence sur les dossiers réels du cabinet',
    },
  ],
  titoloContatti: 'Contact',
  etichettaEmail: 'E-mail',
};

export default llms;
