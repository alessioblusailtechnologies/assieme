/**
 * Il glossario è il punto in cui l'adattamento si vede di più.
 *
 * Due voci non sono traduzioni ma equivalenti di diritto francese, e vanno
 * lasciate così: «franchise proportionnelle» al posto dello scoperto (in
 * Francia non è una voce distinta, è una franchigia in percentuale) e
 * «devoir de conseil» al posto dell'adeguatezza (è l'obbligo corrispondente,
 * con lo stesso peso pratico). Vedi `glossario-fr.md` §3.
 */

import type { Chiusura, MetaPagina, Riga, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Ressources',
  description:
    'Des guides sur la lecture des documentations précontractuelles, un glossaire des termes qui reviennent chaque jour, et les canaux d’assistance.',
};

const testata: Testata = {
  eyebrow: 'Ressources',
  title: 'Des outils de travail, pas des brochures',
  lead: 'Ce que nous publions naît des questions que les cabinets nous posent. Si un guide ne vous fait pas gagner du temps le jour même, c’est que nous l’avons mal écrit.',
};

const briciola = 'Ressources';

const guide: { id: string; title: string; lead: string; linkLabel: string } = {
  id: 'guides',
  title: 'Guides',
  lead: 'Des pages qui valent des années, pas une semaine : la méthode de travail, la lecture des documents, l’IA en cabinet. Elles se lisent entre deux rendez-vous.',
  linkLabel: 'Lire le guide',
};

const glossario: { id: string; title: string; lead: string; voci: Riga[] } = {
  id: 'glossaire',
  title: 'Glossaire',
  lead: 'Les mots qui reviennent chaque jour dans les documents et dans les questions des clients, y compris ceux que l’on prend pour des synonymes et qui n’en sont pas.',
  voci: [
    {
      term: 'Documentation précontractuelle',
      detail:
        'L’ensemble des documents que l’assureur doit remettre avant la signature : IPID, notice d’information, conditions générales et, le cas échéant, conditions particulières. C’est le dossier auquel le client a droit avant de s’engager.',
    },
    {
      term: 'IPID',
      detail:
        'Le document d’information sur le produit d’assurance, au format européen : trois pages, la même structure pour tous les assureurs. Utile pour comparer vite, insuffisant pour conseiller : les exclusions qui comptent sont ailleurs.',
    },
    {
      term: 'Franchise et franchise proportionnelle',
      detail:
        'Deux façons de laisser une part du sinistre à la charge de l’assuré : la franchise en valeur absolue est un montant fixe, la franchise proportionnelle un pourcentage, souvent encadré par un minimum et un maximum. Deux contrats affichant la même franchise peuvent se comporter très différemment.',
    },
    {
      term: 'Plafond de garantie',
      detail:
        'Le montant au-delà duquel l’assureur ne paie plus. Il peut être unique par sinistre, annuel, ou distinct pour chaque garantie : deux contrats affichant le même chiffre en couverture ne se valent pas forcément.',
    },
    {
      term: 'Reprise du passé',
      detail:
        'En base réclamation, jusqu’où en arrière le contrat couvre des faits antérieurs à sa souscription. Illimitée ou limitée à quelques années : c’est l’un des écarts qui pèsent le plus et qui se voient le moins.',
    },
    {
      term: 'Garantie subséquente',
      detail:
        'Le pendant de la reprise du passé, à l’autre bout : la période pendant laquelle une réclamation reste couverte après la fin du contrat. C’est ce qui rend délicat tout changement d’assureur.',
    },
    {
      term: 'Base réclamation',
      detail:
        'La garantie joue selon la date à laquelle la réclamation est formulée, et non selon celle du fait générateur. C’est le régime qui rend décisives la reprise du passé et la garantie subséquente.',
    },
    {
      term: 'Exclusions',
      detail:
        'Ce que le contrat ne couvre pas. Elles sont à la fin, souvent dans un article unique, et c’est là que deux produits apparemment identiques cessent de l’être.',
    },
    {
      term: 'Devoir de conseil',
      detail:
        'L’obligation de proposer un contrat cohérent avec les exigences et besoins du client, de motiver ce conseil par écrit et de pouvoir le reconstituer des années plus tard. C’est la raison pour laquelle une réponse sans source ne sert à rien.',
    },
    {
      term: 'Bibliothèque de marché',
      detail:
        'La bibliothèque des documentations précontractuelles de vos assureurs, rangée par branche, produit et millésime. Nous la constituons avec vous à partir des produits que vous placez, et nous la tenons à jour.',
    },
    {
      term: 'Mémoire vivante',
      detail:
        'C’est ainsi que nous appelons ce qui rend Velia différente pour chaque cabinet : les règles que vous lui dictez, ce qu’elle apprend en travaillant avec vous, et les cas que vous avez déjà tranchés. À la différence d’un dossier partagé, cela grandit et cela répond.',
    },
  ],
};

const assistenza: { id: string; title: string; body: string; stato: string } = {
  id: 'assistance',
  title: 'Assistance',
  body: 'Nous sommes une petite équipe, concentrée sur la qualité : peu de choses, bien suivies, jusqu’au bout. Nous écrivons et répondons en français, sous un jour ouvré.',
  stato: 'État du service',
};

const chiusura: Chiusura = {
  title: 'Vous préférez le voir en direct ?',
  cta: 'Demander une démo',
  link: { rotta: 'demo' },
};

const risorse = {
  meta,
  testata,
  briciola,
  guide,
  glossario,
  assistenza,
  chiusura,
};

export default risorse;
