import type { Destinazione } from '~/i18n/rotte';
import type { MetaPagina, Testata } from '~/i18n/tipi';

const grazie: {
  meta: MetaPagina;
  testata: Testata;
  notaPrima: string;
  notaDopo: string;
} = {
  meta: {
    title: 'Demande reçue',
    description:
      'Votre demande de démo est bien arrivée : nous vous répondons sous un jour ouvré.',
  },
  testata: {
    eyebrow: 'Démo',
    title: 'Demande reçue, à très vite',
    lead: 'Nous vous répondons sous un jour ouvré pour fixer la visioconférence. Si vous avez un cahier des charges à nous montrer, gardez-le sous la main : c’est le moyen le plus rapide de savoir si Velia vous sert.',
    cta: { label: 'Retour à la plateforme', link: { rotta: 'piattaforma' } },
  },
  notaPrima:
    'Sans nouvelles de notre part sous un jour ouvré ? Écrivez-nous directement à ',
  notaDopo: '.',
};

const nonTrovata: {
  meta: MetaPagina;
  eyebrow: string;
  title: string;
  lead: string;
  navEtichetta: string;
  home: string;
  cta: { label: string; link: Destinazione };
} = {
  meta: {
    title: 'Page introuvable',
    description:
      'La page que vous cherchiez n’existe pas ou a été déplacée. Revenez à l’accueil de Velia, ou rejoignez la plateforme, les solutions et la sécurité.',
  },
  eyebrow: 'Erreur 404',
  title: 'Cette page ne figure pas au dossier',
  lead: 'Le lien est peut-être ancien, ou l’adresse contient une coquille. D’ici, vous pouvez repartir.',
  navEtichetta: 'Sections du site',
  home: 'Accueil',
  cta: { label: 'Demander une démo', link: { rotta: 'demo' } },
};

const servizio = { grazie, nonTrovata };

export default servizio;
