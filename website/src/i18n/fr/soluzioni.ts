/**
 * Le quattro figure cambiano rispetto all'italiano, perché cambia il
 * mercato. In Italia si parla ad agenzie, broker, intermediari e compagnie;
 * in Francia le categorie sono quelle del registro ORIAS: courtier, agent
 * général, mandataire. La compagnia resta la quarta.
 */

import type { Blocco, Chiusura, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Solutions pour courtiers, agents et mandataires',
  description:
    'Velia adapte son IA au métier : réponses immédiates pour le courtier, comparaisons à grande échelle pour l’agent général, autonomie pour le mandataire.',
};

const testata: Testata = {
  eyebrow: 'Solutions',
  title: 'Le même outil, quatre métiers différents',
  lead: 'Un cabinet de courtage avec quarante compagnies au portefeuille, une agence générale et une direction technique ne demandent pas les mêmes choses. Velia s’adapte au métier, et non l’inverse.',
};

const briciola = 'Solutions';

const agenzie: Blocco = {
  id: 'courtiers',
  eyebrow: 'Courtiers',
  title: 'Répondre au client pendant qu’il est encore en face',
  rows: [
    { term: 'Tout de suite', detail: 'Les produits que vous placez sont là : on commence à la première question' },
    { term: 'Côte à côte', detail: 'Le devis que le client rapporte d’un concurrent, démonté à côté de vos conditions' },
    { term: 'À votre façon', detail: 'Les conventions et les textes du cabinet deviennent la façon dont Velia raisonne' },
  ],
  paragrafi: [
    'Au cabinet, le temps ne part pas dans les décisions difficiles : il part à retrouver, revérifier et recopier. Velia prend cette partie-là, et vous laisse le client.',
  ],
};

const broker: Blocco = {
  id: 'agents-generaux',
  eyebrow: 'Agents généraux',
  title: 'Vos produits, et ceux d’en face, dans le même tableau',
  rows: [
    { term: 'Échelle', detail: 'Des dizaines de produits dans un seul tableau, là où les autres s’arrêtent à cinq' },
    { term: 'Critères', detail: 'Plafonds, franchises, exclusions, ou les colonnes que vous écrivez vous-même' },
    { term: 'Livraison', detail: 'Le même travail ressort en document aux couleurs de l’agence' },
  ],
  paragrafi: [
    'La valeur d’un agent général tient à ce qu’un tableau comparatif ne montre pas : une reprise du passé réduite, une exclusion ajoutée en fin d’article, une franchise proportionnelle qui change de nature selon le sinistre.',
    'Velia fait le travail mécanique à une échelle que vous n’aborderiez pas à la main. Ce qui compte, c’est vous qui le décidez, mais en partant d’une table déjà mise.',
  ],
};

const intermediari: Blocco = {
  id: 'mandataires',
  eyebrow: 'Mandataires',
  title: 'La structure d’un grand cabinet, sans le service technique',
  rows: [
    { term: 'Démarrage', detail: 'Aucun projet de migration : on commence le premier jour' },
    { term: 'Autonomie', detail: 'Cela se configure en écrivant en français, pas en programmant' },
    { term: 'Continuité', detail: 'Ce que le cabinet a appris reste, même quand les personnes changent' },
  ],
  paragrafi: [
    'Travailler à deux ou trois, c’est avoir les mêmes obligations et les mêmes clients exigeants qu’un réseau structuré, sans la même machine derrière. Ce qui, dans les grandes structures, est un manuel de procédures devient ici quelques règles écrites une fois et appliquées toujours.',
  ],
};

const compagnie: Blocco = {
  id: 'compagnies',
  eyebrow: 'Compagnies',
  title: 'Vos produits, vus avec les yeux du réseau',
  rows: [
    { term: 'Réseau', detail: 'Un outil commun pour ceux qui placent vos produits' },
    { term: 'Millésimes', detail: 'Le réseau travaille toujours sur la bonne version, pas sur celle téléchargée il y a deux ans' },
    { term: 'Signal', detail: 'Les clauses qui suscitent le plus de questions émergent avant le contentieux' },
  ],
  paragrafi: [
    'Une compagnie écrit les textes ; le réseau les interprète. Entre les deux il y a un écart, et on le découvre d’ordinaire au moment du règlement.',
  ],
};

const chiusura: Chiusura = {
  title: 'Vous ne savez pas quelle configuration vous conviendrait ?',
  cta: 'En parler en démo',
  link: { rotta: 'demo' },
};

const soluzioni = {
  meta,
  testata,
  briciola,
  agenzie,
  broker,
  intermediari,
  compagnie,
  chiusura,
};

export default soluzioni;
