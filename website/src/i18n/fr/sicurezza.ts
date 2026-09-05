/**
 * ⚠️ Nessuna certificazione dichiarata, come in italiano.
 *
 * Le ancore cambiano perché sono in francese, e la home ci punta dal
 * dizionario francese: le due liste vanno tenute allineate.
 */

import type { Chiusura, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Sécurité',
  description:
    'Chaque réponse citée, jamais de réponse inventée, des documents confidentiels et une mémoire que vous contrôlez : les engagements de Velia.',
};

const testata: Testata = {
  eyebrow: 'Sécurité',
  title: 'Une donnée fausse est pire qu’une donnée manquante',
  lead: 'De ce que vous conseillez, c’est vous qui répondez. L’exactitude, chez Velia, n’est donc pas une fonction parmi d’autres : c’est la contrainte autour de laquelle le reste est construit.',
};

const briciola = 'Sécurité';

const impegni: {
  title: string;
  voci: { id: string; mark: string; name: string; body: string }[];
} = {
  title: 'Six engagements, écrits avant le contrat',
  voci: [
    {
      id: 'citation',
      mark: 'Source',
      name: 'Chaque réponse citée',
      body: 'Sous chaque affirmation, vous trouvez le document et l’endroit exact, page et article, dont elle vient. Cela vaut en conversation, dans chaque case des tableaux et dans ce que produisent les agents.',
    },
    {
      id: 'non-couverture',
      mark: 'Je ne sais pas',
      name: 'Jamais de réponse inventée',
      body: 'Si la réponse n’est pas dans les documents, Velia le dit. Dans les tableaux, la case indique « non prévu ». Une donnée vraisemblable mais fausse sur une garantie est pire qu’une donnée manquante.',
    },
    {
      id: 'isolement',
      mark: 'À vous seuls',
      name: 'Documents confidentiels',
      body: 'Ce que vous déposez reste à votre cabinet. Cela n’apparaît pas dans les réponses faites à d’autres clients, n’est pas accessible de l’extérieur et circule chiffré.',
    },
    {
      id: 'rgpd',
      mark: 'RGPD',
      name: 'Traitement conforme',
      body: 'Vos documents contiennent des données de vos clients. Le traitement suit le Règlement européen, les rôles sont définis au contrat et la maîtrise de la donnée reste la vôtre.',
    },
    {
      id: 'tracabilite',
      mark: 'Traces',
      name: 'Sources toujours tracées',
      body: 'De chaque réponse, il reste la trace des documents utilisés. Cela vous sert pour vos contrôles internes, et cela nous sert à comprendre pourquoi une réponse est sortie ainsi.',
    },
    {
      id: 'memoire',
      mark: 'Mémoire',
      name: 'Sous votre contrôle',
      body: 'Ce que Velia apprend, vous pouvez le lire, le corriger et l’effacer. Les données de santé des assurés, elle ne les enregistre pas du tout, et vos règles passent toujours avant ce qu’elle a déduit.',
    },
  ],
};

const domande: { title: string; voci: { q: string; a: string }[] } = {
  title: 'Questions fréquentes',
  voci: [
    {
      q: 'Mes documents servent-ils à entraîner les modèles ?',
      a: 'Non. Ils restent dans votre cabinet et ne servent qu’à répondre à vos questions. Les contrats passés avec les fournisseurs de modèles excluent l’usage des contenus pour l’entraînement.',
    },
    {
      q: 'Un autre cabinet peut-il voir mes documents ?',
      a: 'Non, en aucun cas. Chaque cabinet travaille dans un espace séparé : un de vos documents ne peut pas apparaître dans la réponse faite à quelqu’un d’autre.',
    },
    {
      q: 'Puis-je faire confiance sans relire le document ?',
      a: 'La réponse vous dit où regarder, et depuis la citation vous ouvrez l’endroit exact. Velia raccourcit le temps de la vérification, elle ne vous en dispense pas : le devoir de conseil, c’est vous qui l’assumez.',
    },
    {
      q: 'Avez-vous des certifications de sécurité ?',
      a: 'Pas encore, et nous préférons le dire plutôt que de le laisser entendre. La démarche est engagée. En attendant, les engagements de cette page sont contractuels, et nous répondons en détail aux questionnaires de sécurité.',
    },
  ],
};

const chiusura: Chiusura = {
  title: 'Besoin du questionnaire de sécurité rempli ?',
  cta: 'Écrivez-nous',
  link: { rotta: 'demo' },
};

const sicurezza = {
  meta,
  testata,
  briciola,
  impegni,
  domande,
  chiusura,
};

export default sicurezza;
