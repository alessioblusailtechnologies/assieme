/**
 * La pagina Piattaforma in francese.
 *
 * Lo scarto principale rispetto all'italiano è il primo blocco. In italiano
 * si intitola «Non parti mai da zero» e promette il mercato già dentro; in
 * francese la biblioteca si costruisce insieme al cliente, sul suo mercato.
 * Vedi `glossario-fr.md` §1.1.
 */

import type { Blocco, Chiusura, Griglia, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'La plateforme IA du travail de cabinet',
  description:
    'L’IA des courtiers, agents généraux et mandataires : interrogez vos documents, comparez les produits, préparez vos propositions, la source sous chaque réponse.',
};

const testata: Testata = {
  eyebrow: 'Plateforme',
  title: 'Tout le cabinet, une seule intelligence',
  lead: 'Interrogez vos documents, comparez les produits, préparez les propositions, surveillez les nouvelles versions. Velia met le travail de plusieurs jours dans une conversation, avec la méthode de votre cabinet et la source sous chaque réponse.',
  cta: { label: 'Demander une démo', link: { rotta: 'demo' } },
};

const briciola = 'Plateforme';

const griglia: Griglia = {
  title: 'Ce que vous trouvez dedans',
  lead: 'Dix outils qui se passent le travail et parlent la langue du métier, pas celle des logiciels.',
  cards: [
    {
      id: 'bibliotheque',
      title: 'Bibliothèque de marché',
      body: 'Les documentations précontractuelles de vos assureurs, rangées par branche, produit et millésime. Nous la constituons avec vous, sur votre marché.',
    },
    {
      id: 'vos-documents',
      title: 'Vos documents',
      body: 'Ce qui entre au cabinet trouve sa place tout seul. Et répond, chaque fois que vous le mettez en cause.',
    },
    {
      id: 'comparaison',
      title: 'Comparaison',
      body: 'Deux produits, une question : qu’est-ce qui change vraiment. La réponse arrive en secondes, pas en après-midis.',
    },
    {
      id: 'tableaux',
      title: 'Tableaux',
      body: 'Des dizaines de produits lus en parallèle, les critères que vous choisissez, la source dans chaque case.',
    },
    {
      id: 'methode',
      title: 'Méthode',
      body: 'Velia apprécie selon les critères de votre cabinet, pas selon des critères décidés en usine.',
    },
    {
      id: 'documents',
      title: 'Documents',
      body: 'Ce qui sort est déjà mis en page à vos couleurs, prêt à partir chez le client.',
    },
    {
      id: 'canaux',
      title: 'Canaux',
      body: 'Le devis qui arrive par WhatsApp ou par e-mail entre tout seul. Et la proposition repart de là, quand vous le décidez.',
    },
    {
      id: 'agents',
      title: 'Agents',
      body: 'Le travail qui se répète, vous le décrivez une fois, en français. Ensuite vous le retrouvez fait.',
    },
    {
      id: 'ecosysteme',
      title: 'Écosystème',
      body: 'Velia vous rejoint dans les outils que vous utilisez déjà, sans vous faire changer d’habitudes.',
    },
    {
      id: 'memoire',
      title: 'Elle retient',
      body: 'Chaque semaine de travail la rend plus juste. Et ce qu’elle apprend reste au cabinet.',
    },
  ],
};

const archivio: Blocco = {
  eyebrow: 'Bibliothèque de marché',
  title: 'Une bibliothèque qui se construit sur votre marché',
  rows: [
    {
      term: 'Constituée avec vous',
      detail: 'Les produits que vous placez vraiment, pas un catalogue générique',
    },
    {
      term: 'Rangée',
      detail: 'Assureurs, branches, produits et millésimes, avec la version en cours en évidence',
    },
    {
      term: 'Tenue à jour',
      detail: 'Nous nous en occupons. S’il manque quelque chose, vous le signalez d’un clic',
    },
  ],
  paragrafi: [
    'Les outils généralistes naissent vides : avant de vous aider, il faut les remplir, les instruire et les entretenir, cabinet par cabinet. Velia arrive avec un métier déjà appris, et une bibliothèque que nous montons avec vous à partir des produits que vous placez.',
    'Vous n’ajoutez que ce qui est à vous : le devis que le client a apporté ce matin, le contrat à renouveler. Et s’il est arrivé par WhatsApp ou par e-mail, il entre tout seul.',
  ],
  azione: {
    label: 'Demandez comment nous constituons votre bibliothèque',
    link: { rotta: 'demo' },
  },
};

const metodo: Blocco = {
  eyebrow: 'Méthode',
  title: 'Personne n’apprécie une garantie comme vous l’appréciez',
  rows: [
    {
      term: 'Vous l’écrivez',
      detail: 'En français, comme vous l’expliqueriez à un nouveau collaborateur',
    },
    {
      term: 'Cela vaut toujours',
      detail: 'Pour tout le cabinet, dans chaque conversation, sans avoir à le répéter',
    },
    {
      term: 'Cela reste honnête',
      detail: 'Cela change l’appréciation, jamais les faits : la source est citée quand même',
    },
  ],
  paragrafi: [
    'Le cas est toujours le même. Un comparateur signale comme lacune grave l’absence de la protection du conducteur. Mais vous, cette garantie, vous la couvrez depuis toujours par un contrat séparé : ce signalement, pour vous, c’est du bruit.',
    'À Velia, vous le dites une fois. C’est toute la différence entre un outil qui applique ses propres critères et un outil qui applique les vôtres.',
  ],
};

const ecosistema: Blocco = {
  eyebrow: 'Écosystème et agents',
  title: 'Elle travaille aussi quand vous ne la regardez pas',
  rows: [
    {
      term: 'Là où vous êtes',
      detail: 'Vos documents accessibles depuis les outils d’IA que vous utilisez déjà',
    },
    {
      term: 'Quand vous voulez',
      detail: 'Une tâche décrite une fois, répétée chaque jour, chaque semaine ou chaque mois',
    },
    {
      term: 'Avec les mêmes règles',
      detail: 'La méthode du cabinet et la citation de la source valent aussi ici',
    },
  ],
  paragrafi: [
    'Certaines choses ne valent pas la peine d’être refaites à la main : vérifier si une nouvelle version est parue, relire chaque lundi ce qui est entré au cabinet. Vous les décrivez une fois et Velia les fait seule.',
    'Et si l’outil d’IA que vous utilisez tous les jours est un autre, inutile d’en changer : vos documents sont accessibles de là aussi. Avec un avertissement que nous préférons donner tout de suite : hors de Velia, ce sont les règles de ce logiciel qui s’appliquent, pas les vôtres.',
  ],
};

const chiusura: Chiusura = {
  title: 'Envie de la voir travailler sur un de vos devis ?',
  cta: 'Demander une démo',
  link: { rotta: 'demo' },
};

const piattaforma = {
  meta,
  testata,
  briciola,
  griglia,
  archivio,
  metodo,
  ecosistema,
  chiusura,
};

export default piattaforma;
