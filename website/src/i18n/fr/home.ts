/**
 * Contenuti della homepage, in francese.
 *
 * Non è la traduzione dell'italiano: è la stessa offerta raccontata a un
 * courtier francese. Due scarti deliberati rispetto all'italiano, decisi in
 * `glossario-fr.md`:
 *
 *  - la biblioteca di mercato non si promette come già pronta, perché sul
 *    mercato francese non lo è: si racconta come qualcosa che si costruisce
 *    insieme al cliente;
 *  - i numeri della home sono stati rifatti, perché tre dei cinque italiani
 *    poggiavano proprio su quell'archivio già popolato.
 *
 * La spaziatura tipografica francese la mette `spazia()` in `index.ts`: qui
 * si scrive con spazi normali.
 */

import type { Destinazione } from '~/i18n/rotte';
import type { Riga } from '~/i18n/tipi';

export const hero: {
  title: string[];
  lead: string;
  cta: string;
  link: Destinazione;
  loghiEtichetta: string;
  proveEtichetta: string;
  proveCta: string;
  proveLink: Destinazione;
  logoSegnaposto: string;
  logoCliente: string;
  prove: string[];
} = {
  title: ['L’IA qui apprend', 'la façon de travailler de votre cabinet.', 'Et qui ne l’oublie pas.'],
  lead: 'Velia est l’intelligence artificielle des professionnels de la distribution d’assurance, courtiers, agents généraux et mandataires. Le métier, elle le connaît déjà. Il lui reste à apprendre votre façon de l’exercer.',
  cta: 'Demander une démo',
  link: { rotta: 'demo' },
  loghiEtichetta: 'Compagnies dont les produits sont en bibliothèque',
  proveEtichetta: 'Pourquoi Velia',
  proveCta: 'Voir Velia au travail',
  proveLink: { rotta: 'clienti' },
  logoSegnaposto: 'logo',
  /** `{n}` è il numero dello slot. */
  logoCliente: 'Logo client {n}',
  prove: [
    'Chaque réponse cite sa source',
    'Zéro document à déposer pour commencer',
    'Vos documents restent les vôtres',
  ],
};

export const statement: { titolo: string; strong: string; muted: string } = {
  titolo: 'Ce qu’est Velia',
  strong: 'Les IA généralistes repartent de zéro à chaque conversation. Velia, non.',
  muted:
    'Elle travaille sur les documents que vous avez déjà, raisonne selon les critères de votre cabinet, et vous laisse toujours le dernier mot.',
};

export const media: { filmato: string; video: string; grafo: string; ritratto: string } = {
  filmato: 'memoria-viva-fr',
  video:
    'Velia au travail : en conversation, la comparaison entre un contrat et un devis devient un souvenir dans la mémoire du cabinet',
  grafo:
    'Représentation de la mémoire vivante du cabinet : des centaines de nœuds (documents, règles et cas déjà tranchés) regroupés en grappes et reliés entre eux.',
  ritratto: 'Au travail sur les documents, en fin de journée, dans la lumière de l’écran',
};

/* -------------------------------------------------------------------------
 * Riproduzione dell'interfaccia
 *
 * Nessun nome di compagnia francese: sarebbe un marchio altrui dentro un
 * confronto inventato. Le colonne sono neutre, e la scena resta leggibile.
 *
 * La riga «protection du conducteur» regge anche in Francia: è una garanzia
 * che esiste, e che molti cabinet collocano a parte. Un comparatore a criteri
 * fissi la segnalerebbe come lacuna grave; chi la copre sempre con un
 * contrat séparé non vuole vedersela segnalata.
 * ---------------------------------------------------------------------- */

export type Cell = { value: string; tone?: 'neg' | 'pos' };

export const productShot: {
  breadcrumb: string;
  title: string;
  columns: string[];
  rows: { label: string; a: Cell; b: Cell }[];
  summary: string;
  citations: string[];
} = {
  breadcrumb: 'Dossier / Renouvellement auto · client Martin',
  title: 'Branche auto : le contrat en cours et le devis, côte à côte',
  columns: ['Garantie', 'Contrat en cours', 'Devis concurrent'],
  rows: [
    {
      label: 'Plafond RC',
      a: { value: '6 450 000 €' },
      b: { value: '25 000 000 €', tone: 'pos' },
    },
    {
      label: 'Franchise dommages',
      a: { value: '500 €' },
      b: { value: '750 €' },
    },
    {
      label: 'Franchise vandalisme',
      a: { value: '10 %' },
      b: { value: '15 %', tone: 'neg' },
    },
    {
      label: 'Protection du conducteur',
      a: { value: 'Incluse' },
      b: { value: 'Non prévue' },
    },
  ],
  summary:
    'Neuf écarts qui comptent sur 54 garanties. La protection du conducteur n’apparaît pas comme une lacune : vous le lui avez expliqué une fois, votre cabinet la couvre à part.',
  citations: ['conditions_generales.pdf · art. 12 p. 34', 'devis_concurrent.pdf · sect. 3 p. 2'],
};

export const shot: {
  titolo: string;
  didascalia: string;
  tabellaDidascalia: string;
  schede: string[];
  richiesta: string;
  invia: string;
  sintesi: string;
} = {
  titolo: 'Velia au travail : deux propositions comparées',
  didascalia:
    'Exemple de comparaison produite par Velia : chaque valeur renvoie à l’article et à la page du document dont elle vient.',
  tabellaDidascalia:
    'Comparaison en branche auto : le contrat en cours et un devis concurrent, garantie par garantie, avec la source citée pour chaque valeur.',
  schede: ['Comparaison', 'Exporter'],
  richiesta: 'Demandez à Velia…',
  invia: 'Envoyer',
  sintesi: 'Synthèse',
};

export const reel: {
  titolo: string;
  descrizione: string;
  didascalia: string;
  pausa: string;
} = {
  titolo: 'Velia au travail : du document à la comparaison',
  descrizione:
    'Velia lit deux cahiers des charges d’assurance, en extrait les garanties et met leurs conditions en regard.',
  didascalia:
    'Deux cahiers des charges comparés : garanties alignées, écarts mis en évidence, et chaque valeur rattachée à son article d’origine.',
  pausa: 'Pause',
};

export const memory: {
  eyebrow: string;
  title: string;
  body: string;
  rows: Riga[];
  cta: string;
  link: Destinazione;
} = {
  eyebrow: 'Mémoire vivante',
  title: 'Voilà ce que veut dire ne pas oublier',
  cta: 'Comment fonctionne la mémoire vivante',
  link: { rotta: 'piattaforma', ancora: 'memoire' },
  body: 'Un dossier partagé conserve, et c’est tout : il ne relie rien, ne se souvient de rien, ne répond à rien. Chez Velia, chaque document lu entre dans quelque chose qui grandit, fait des règles que vous lui dictez, des choix qu’elle vous voit faire, des cas que vous avez déjà tranchés ensemble. Le lundi, elle sait ce que vous lui avez expliqué le vendredi.',
  rows: [
    {
      term: 'Vos règles',
      detail:
        'Écrivez en français comment votre cabinet apprécie une garantie. Cela vaut tout de suite, pour toute l’équipe.',
    },
    {
      term: 'Ce qu’elle apprend',
      detail: 'Usages, exceptions et préférences : expliqués une fois, jamais répétés.',
    },
    {
      term: 'À vous, toujours',
      detail:
        'Vous consultez, corrigez, supprimez. Ce que Velia apprend reste au cabinet.',
    },
  ],
};

export const useCasesIntro: string[] = [
  'Chaque jour, les cabinets',
  'utilisent Velia pour',
];

export const useCasesCta: { label: string; link: Destinazione } = {
  label: 'Explorer la plateforme',
  link: { rotta: 'piattaforma' },
};

export const useCases: string[] = [
  'Comparer des contrats',
  'Analyser les garanties',
  'Lire un cahier des charges',
  'Vérifier un devis',
  'Chercher dans les conditions',
  'Pièces jointes WhatsApp et e-mail',
  'Documentation du cabinet',
  'Propositions prêtes pour le client',
];

export const testimonial: {
  titolo: string;
  quote: string;
  cta: string;
  link: Destinazione;
} = {
  titolo: 'Sur le terrain',
  quote:
    'Un cabinet nous a expliqué une seule fois, en français, qu’il couvre toujours la protection du conducteur par un contrat séparé. Depuis, Velia ne la signale plus comme une lacune : elle raisonne comme ils raisonnent.',
  cta: 'Voir la démonstration',
  link: { rotta: 'clienti' },
};

export const storiesIntro: {
  title: string;
  cta: string;
  link: Destinazione;
  targhetta: string;
} = {
  title: 'Trois démonstrations. Documents réels, réponses vérifiables.',
  cta: 'Voir toutes les démonstrations',
  link: { rotta: 'clienti' },
  targhetta: 'Démonstration',
};

export const stories: { title: string; link: Destinazione; img: string }[] = [
  {
    title: 'Un devis concurrent démonté en dix minutes',
    link: { rotta: 'clienti', ancora: 'comparaison-auto' },
    img: '/media/demo-confronto.jpg',
  },
  {
    title: 'Dix produits, un tableau, la source dans chaque case',
    link: { rotta: 'clienti', ancora: 'tableau-analyse' },
    img: '/media/demo-tabella.jpg',
  },
  {
    title: 'Les nouvelles versions viennent à vous, pas l’inverse',
    link: { rotta: 'clienti', ancora: 'agent-versions' },
    img: '/media/demo-agenti.jpg',
  },
];

export const statsIntro: string[] = [
  'Moins de temps sur les documents,',
  'plus de temps avec vos clients',
];

/*
 * Gli stessi cinque numeri dell'italiano. L'ultimo dice «les principales» e
 * non un conteggio: dichiarare che la biblioteca francese c'è è una cosa,
 * inventare quante compagnie contiene è un'altra. Il numero si mette quando
 * l'ingestion l'ha prodotto.
 */
export const stats: { label: string; value: string }[] = [
  { label: 'Documents à déposer pour commencer', value: 'Zéro' },
  { label: 'Fois où vous expliquez une règle', value: 'Une' },
  { label: 'Réponses avec la source citée', value: '100 %' },
  { label: 'Documents dans une seule comparaison', value: 'Des dizaines' },
  { label: 'Compagnies déjà en bibliothèque', value: 'Les principales' },
];

export const security: {
  title: string[];
  body: string;
  cta: string;
  link: Destinazione;
  dettagli: string;
  badges: { mark: string; name: string; link: Destinazione }[];
} = {
  title: ['Exactitude et confidentialité,', 'avant toute autre chose'],
  body: 'Velia cite toujours d’où vient une réponse et, quand elle ne sait pas, elle le dit. Vos documents restent les vôtres et ce qu’elle apprend reste au cabinet : cela ne sort pas, n’atterrit pas chez d’autres clients, n’entraîne aucun modèle.',
  cta: 'En savoir plus sur la sécurité',
  link: { rotta: 'sicurezza' },
  dettagli: 'Détails →',
  badges: [
    { mark: 'Mémoire', name: 'Sous votre contrôle', link: { rotta: 'sicurezza', ancora: 'memoire' } },
    { mark: 'Source', name: 'Chaque réponse citée', link: { rotta: 'sicurezza', ancora: 'citation' } },
    { mark: 'Je ne sais pas', name: 'Jamais de réponse inventée', link: { rotta: 'sicurezza', ancora: 'non-couverture' } },
    { mark: 'À vous seuls', name: 'Documents confidentiels', link: { rotta: 'sicurezza', ancora: 'isolement' } },
    { mark: 'RGPD', name: 'Traitement conforme', link: { rotta: 'sicurezza', ancora: 'rgpd' } },
    { mark: 'Traces', name: 'Sources toujours tracées', link: { rotta: 'sicurezza', ancora: 'tracabilite' } },
  ],
};

export const meta = {
  title: 'Velia | L’IA des courtiers et agents d’assurance',
  description:
    'L’IA de la distribution d’assurance : elle apprend les règles de votre cabinet, compare contrats et devis, et cite sa source à chaque fois. Demandez une démo.',
  schemaDescription:
    'IA pour courtiers, agents généraux et mandataires d’assurance : elle apprend les règles du cabinet et ne les oublie pas, les conditions des assureurs sont déjà en bibliothèque, et la source est toujours citée.',
  audience:
    'Courtiers, agents généraux, mandataires et compagnies d’assurance',
  paese: 'France',
  featureList: [
    'Documentations précontractuelles des assureurs déjà en bibliothèque : IPID, notices et conditions générales',
    'Documents du cabinet, confidentiels, consultables aux côtés de ceux des assureurs',
    'Comparaison entre contrats et devis, avec la source citée pour chaque valeur',
    'Tableaux d’analyse sur des dizaines de produits, la source dans chaque case',
    'Appréciation selon les critères du cabinet, écrits en français',
    'Documents client déjà mis en page en PDF, DOCX, XLSX et PPTX',
    'Agents qui répètent le travail récurrent selon un calendrier',
    'Documents accessibles depuis les outils d’IA déjà en place',
    'Mémoire persistante des règles, usages et cas du cabinet : expliqués une fois, retenus dans chaque conversation, consultables et effaçables',
  ],
};

const home = {
  meta,
  media,
  shot,
  reel,
  hero,
  statement,
  productShot,
  memory,
  useCases,
  useCasesIntro,
  useCasesCta,
  testimonial,
  storiesIntro,
  stories,
  statsIntro,
  stats,
  security,
};

export default home;
