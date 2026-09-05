import type { Chiusura, MetaPagina, Riga, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Entreprise',
  description:
    'Velia est un produit de Blusail Technologies. Comment nous travaillons, pourquoi nous le construisons avec les cabinets, et quels postes sont ouverts.',
};

/** `{azienda}` è sostituito con la ragione sociale: non si traduce. */
const testata: Testata = {
  eyebrow: 'Entreprise',
  title: 'Un produit construit dans les cabinets, pas autour',
  lead: 'Velia est développé par {azienda}. Le produit est né d’une observation faite en cabinet, et il se règle avec ceux qui y travaillent tous les jours.',
};

const briciola = 'Entreprise';

const storia: { title: string; paragrafi: string[] } = {
  title: 'D’où vient Velia',
  paragrafi: [
    'Velia est né dans les cabinets, en regardant comment on y travaille vraiment. La valeur d’un intermédiaire tient à son jugement et à sa relation avec le client, et pourtant les journées partent à chercher, relire et recopier des informations qui existent déjà.',
    'Et le produit est né d’une conviction : dans ce métier, l’intelligence artificielle n’est utile que si elle respecte le métier. Chaque cabinet a sa propre façon d’apprécier une garantie, construite en des années de travail ; un outil sérieux doit l’apprendre, pas la remplacer par des critères décidés en usine.',
    'Velia met les deux ensemble. Les documents sont là et se tiennent à jour ; la façon de les apprécier, c’est vous qui l’écrivez. Le reste (décider, conseiller, signer) reste où il a toujours été.',
  ],
};

const criteri: { title: string; voci: Riga[] } = {
  title: 'Quatre critères qui guident nos décisions',
  voci: [
    {
      term: 'La source',
      detail:
        'Aucune réponse sans le passage qui la soutient. Si Velia ne peut pas citer, elle dit qu’elle ne sait pas : c’est moins impressionnant en démo, et bien plus utile le mardi matin.',
    },
    {
      term: 'Le dernier mot',
      detail:
        'L’outil prépare ; l’intermédiaire décide et signe. Dans un secteur régulé, aucune automatisation ne peut endosser une responsabilité professionnelle, et concevoir comme si c’était possible serait malhonnête.',
    },
    {
      term: 'L’usage',
      detail:
        'Il n’existe pas de critère universel d’appréciation des garanties. Chaque cabinet a le sien, et c’est précisément la valeur qu’il a construite : le logiciel doit s’y adapter, et non l’inverse.',
    },
    {
      term: 'Le métier',
      detail:
        'Nous construisons avec ceux qui sont en cabinet, pas autour d’une idée de cabinet. Chaque fonction naît d’un document réel que quelqu’un devait lire avant le soir.',
    },
  ],
};

const lavoro: {
  id: string;
  title: string;
  lead: string;
  candidati: string;
  notaPrima: string;
  notaDopo: string;
  posizioni: { title: string; detail: string }[];
} = {
  id: 'nous-rejoindre',
  title: 'Nous rejoindre',
  lead: 'Nous sommes une petite équipe, en travail hybride, avec une nette préférence pour ceux qui savent expliquer les choses simplement.',
  candidati: 'Postuler',
  notaPrima: 'Vous ne trouvez pas votre poste ? Écrivez quand même à ',
  notaDopo: ' : nous lisons tout.',
  posizioni: [
    {
      title: 'Produit · Domaine assurance',
      detail:
        'Vous venez du courtage ou d’une agence générale et vous voulez transformer ce métier en produit. Expérience technique non requise.',
    },
    {
      title: 'Customer success · Démarrage des cabinets',
      detail:
        'Accompagner les cabinets qui arrivent : mettre par écrit leur méthode et les amener à leurs premières comparaisons en autonomie.',
    },
  ],
};

const chiusura: Chiusura = {
  title: 'Envie de savoir si cela vous convient ?',
  cta: 'Demander une démo',
  link: { rotta: 'demo' },
};

const azienda = {
  meta,
  testata,
  briciola,
  storia,
  criteri,
  lavoro,
  chiusura,
};

export default azienda;
