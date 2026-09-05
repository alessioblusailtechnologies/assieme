import type { Destinazione } from '~/i18n/rotte';
import type { Chiusura, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Cas d’usage',
  description:
    'Trois démonstrations sur documents réels : comparaison entre conditions générales et devis en branche auto, tableaux d’analyse multi-produits et agents programmés.',
};

const testata: Testata = {
  eyebrow: 'Cas d’usage',
  title: 'Trois démonstrations, sur de vrais documents',
  lead: 'Velia travaille chaque jour dans des cabinets réels, sur des documents réels. Plutôt que de vous le raconter, nous préférons vous montrer ce qu’elle fait.',
};

const briciola = 'Cas d’usage';

const numeri: { title: string; lead: string } = {
  title: 'Les chiffres de la plateforme',
  lead: 'Non pas des promesses commerciales, mais des choix de conception : la plateforme est faite ainsi. Chaque ligne se vérifie en une demi-heure de démo.',
};

const dimostrazioni: {
  title: string;
  targhetta: string;
  azione: string;
  link: Destinazione;
  voci: {
    id: string;
    img: string;
    eyebrow: string;
    title: string;
    body: string;
    note: string;
  }[];
} = {
  title: 'Les démonstrations',
  targhetta: 'Démonstration',
  azione: 'Demander cette démo',
  link: { rotta: 'demo' },
  voci: [
    {
      id: 'comparaison-auto',
      img: '/media/demo-confronto.jpg',
      eyebrow: 'Branche auto',
      title: 'Un devis concurrent démonté en dix minutes',
      body: 'Le client arrive avec le devis d’un autre assureur. Vous le déposez, et Velia le met en regard des conditions du contrat en cours, déjà en bibliothèque. Neuf écarts qui comptent sur cinquante-quatre garanties, et pour chacun l’article dont il vient.',
      note: 'C’est le cas par lequel les cabinets nous mettent le plus souvent à l’épreuve.',
    },
    {
      id: 'tableau-analyse',
      img: '/media/demo-tabella.jpg',
      eyebrow: 'Tableaux',
      title: 'Dix produits comparés dans un seul tableau',
      body: 'Quand les documents sont trop nombreux pour être lus un à un, ils deviennent un tableau : les produits en ligne, les critères en colonne. Là où la donnée n’est pas dans le document, la case indique « non prévu » au lieu de deviner.',
      note: 'Le tableau s’interroge à voix haute et s’exporte en tableur.',
    },
    {
      id: 'agent-versions',
      img: '/media/demo-agenti.jpg',
      eyebrow: 'Agents',
      title: 'Les nouvelles versions signalées sans aller les chercher',
      body: '« Préviens-moi quand une nouvelle version des produits que je place paraît. » Vous l’écrivez une fois, vous choisissez la fréquence, et à partir de là vous le retrouvez fait.',
      note: 'La méthode de votre cabinet s’applique, et la source est citée quand même.',
    },
  ],
};

const adozione: {
  title: string;
  paragrafi: string[];
  azione: { label: string; link: Destinazione };
} = {
  title: 'Une adoption qui s’accélère',
  paragrafi: [
    'Velia est sur le marché et l’adoption progresse vite. Ceux qui entrent maintenant trouvent une plateforme qui s’améliore de semaine en semaine et une équipe qui écoute : les meilleures fonctions naissent des demandes de ceux qui s’en servent tous les jours.',
  ],
  azione: { label: 'Rejoignez-les', link: { rotta: 'demo' } },
};

const chiusura: Chiusura = {
  title: 'Envie de le voir sur un de vos devis ?',
  cta: 'Demander une démo',
  link: { rotta: 'demo' },
};

const clienti = {
  meta,
  testata,
  briciola,
  numeri,
  dimostrazioni,
  adozione,
  chiusura,
};

export default clienti;
