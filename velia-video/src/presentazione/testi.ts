/**
 * I testi della presentazione francese.
 *
 * Stessa lingua del sito e stesso glossario (`website/glossario-fr.md`): si
 * dà del «vous», lo studio è un «cabinet», l'agent général ha un'«agence»,
 * e le categorie sono quelle del registro ORIAS. Dove la presentazione dice
 * la stessa cosa del sito, la dice con le stesse parole: un prospect che
 * legge la brochure e poi la home non deve avere l'impressione di due
 * prodotti diversi.
 *
 * Non è un import dai dizionari del sito, che sono un altro progetto npm con
 * i suoi alias: è una copia consapevole, e quando il sito cambia va
 * riallineata. Il legame è dichiarato qui perché non si perda.
 *
 * Niente cifre da cruscotto: le pagine che contano mostrano il prodotto al
 * lavoro, non un numero grande al centro della diapositiva.
 *
 * La spaziatura tipografica francese (spazio unificatore prima di : ; ! ?)
 * la mette `spazia()` in fondo al file, come sul sito.
 */

const UNIFICATORE = String.fromCharCode(0xa0);

const spaziaTesto = (t: string) =>
  t.replace(/ ([:;!?»])/g, `${UNIFICATORE}$1`).replace(/« /g, `«${UNIFICATORE}`);

const spazia = <T,>(v: T): T => {
  if (typeof v === 'string') return spaziaTesto(v) as T;
  if (Array.isArray(v)) return v.map(spazia) as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, spazia(x)])) as T;
  }
  return v;
};

const contenuto = {
  copertina: {
    marchio: 'Velia',
    titolo: 'L’IA qui apprend la façon de travailler de votre cabinet.',
    sottotitolo:
      'Pour les courtiers, agents généraux et mandataires d’assurance. Le métier, elle le connaît déjà. Il lui reste à apprendre votre façon de l’exercer.',
    piede: 'Présentation produit · 2026',
  },

  /* La memoria apre la presentazione, come apre il sito: è il differenziale,
     e va detto prima dell'elenco delle funzioni. */
  memoire: {
    occhiello: 'Mémoire vivante',
    titolo: 'Voilà ce que veut dire ne pas oublier',
    attacco:
      'Un dossier partagé conserve, et c’est tout : il ne relie rien, ne se souvient de rien, ne répond à rien. Chez Velia, chaque document lu entre dans quelque chose qui grandit, fait des règles que vous lui dictez, des choix qu’elle vous voit faire, des cas que vous avez déjà tranchés ensemble. Le lundi, elle sait ce que vous lui avez expliqué le vendredi.',
    righe: [
      { termine: 'Vos règles', dettaglio: 'Écrites une fois, elles valent tout de suite pour toute l’équipe' },
      { termine: 'Ce qu’elle apprend', dettaglio: 'Usages, exceptions et préférences : expliqués une fois, jamais répétés' },
      { termine: 'À vous, toujours', dettaglio: 'Vous consultez, corrigez, supprimez. Ce qu’elle apprend reste au cabinet' },
    ],
    didascalia: 'Documents, règles et cas déjà tranchés, reliés entre eux',
  },

  differenza: {
    occhiello: 'Ce qu’est Velia',
    titolo: 'Les IA généralistes repartent de zéro à chaque conversation. Velia, non.',
    attacco:
      'Elle travaille sur les documents que vous avez déjà, raisonne selon les critères de votre cabinet, et vous laisse toujours le dernier mot.',
    colonne: [
      {
        titolo: 'Une IA généraliste',
        voci: [
          'Repart de zéro à chaque conversation',
          'Répond la moyenne du marché',
          'Invente quand la donnée manque',
          'Ne cite pas sa source',
        ],
      },
      {
        titolo: 'Velia',
        voci: [
          'Retient vos règles et les applique seule',
          'Raisonne selon les critères du cabinet',
          'Dit « je ne sais pas » plutôt que d’inventer',
          'Cite le document, l’article et la page',
        ],
      },
    ],
  },

  /* --- Le funzionalità, ciascuna con la sua schermata --------------------- */

  comparaison: {
    occhiello: 'Comparaison',
    titolo: 'Deux contrats, garantie par garantie',
    attacco:
      'Le devis que le client rapporte d’un concurrent, mis en regard des conditions du contrat en cours. Ce qui à la main prend une heure par dossier arrive en secondes.',
  },

  citation: {
    occhiello: 'Citation de la source',
    titolo: 'Chaque affirmation renvoie à sa page',
    attacco:
      'Pas « le contrat prévoit un recours », mais le document, l’article et la page, qui s’ouvrent en un clic. C’est ce qui fait la différence entre une réponse et une réponse vérifiable.',
  },

  sauvegarde: {
    occhiello: 'La mémoire s’écrit',
    titolo: 'Vous le dites une fois, elle le retient',
    attacco:
      'Une règle du cabinet dictée en français au fil de la conversation devient une entrée de mémoire : lisible, corrigible, effaçable, et valable pour toute l’équipe.',
  },

  rappel: {
    occhiello: 'La mémoire se rappelle',
    titolo: 'Un autre client, la même règle, sans la répéter',
    attacco:
      'Sur un dossier qui n’a rien à voir, Velia applique la règle apprise et le déclare avec l’étiquette « Mémoire ». C’est ainsi qu’on contrôle, et qu’on la corrige si elle a changé.',
  },

  instructions: {
    occhiello: 'Méthode du cabinet',
    titolo: 'Vos critères, écrits en français',
    attacco:
      'Pas de paramétrage, pas de formulaire : quelques lignes comme vous les expliqueriez à un nouveau collaborateur. Velia apprécie avec elles, et le dit chaque fois qu’elle les applique.',
  },

  archive: {
    occhiello: 'Documents du cabinet',
    titolo: 'Ce qui entre trouve sa place tout seul',
    attacco:
      'Vos dossiers, vos conventions, vos modèles : rangés comme vous les rangez, confidentiels, et interrogeables à côté des documents des assureurs. Ce qui arrive par e-mail se classe seul.',
  },

  tableaux: {
    occhiello: 'Tableaux d’analyse',
    titolo: 'Des dizaines de produits, vos critères en colonne',
    attacco:
      'Quand les documents sont trop nombreux pour être lus un à un, ils deviennent un tableau. Là où la donnée n’est pas dans le document, la case le dit au lieu de deviner.',
  },

  agents: {
    occhiello: 'Agents',
    titolo: 'Le travail qui se répète, décrit une fois',
    attacco:
      'Vous écrivez ce qu’il faut faire et quand, en français. L’agent le fait seul, avec la méthode du cabinet et la source citée, et vous retrouvez le résultat.',
  },

  documents: {
    occhiello: 'Ce qui sort',
    titolo: 'Des documents client, à vos couleurs',
    attacco:
      'Le tableau comparatif, la synthèse, la note de conseil : mis en page depuis vos propres modèles et prêts à partir. Vous relisez, vous signez.',
    formati: ['PDF', 'DOCX', 'XLSX', 'PPTX'],
  },

  /* ----------------------------------------------------------------------- */

  ecosysteme: {
    occhiello: 'Canaux et écosystème',
    titolo: 'Elle vous rejoint là où vous êtes déjà',
    attacco:
      'Le devis qui arrive par WhatsApp ou par e-mail entre tout seul dans le dossier. Et si l’outil d’IA que vous utilisez tous les jours est un autre, vos documents restent accessibles de là aussi.',
    righe: [
      { termine: 'Canaux', dettaglio: 'WhatsApp et e-mail : la pièce jointe est classée et indexée à l’arrivée' },
      { termine: 'Vos outils', dettaglio: 'Vos documents interrogeables depuis les outils d’IA déjà en place' },
      { termine: 'Mêmes règles', dettaglio: 'La méthode du cabinet et la citation de la source valent aussi ici' },
    ],
    avvertenza:
      'Un avertissement que nous préférons donner tout de suite : hors de Velia, ce sont les règles de ce logiciel-là qui s’appliquent, pas les vôtres.',
  },

  securite: {
    occhiello: 'Sécurité',
    titolo: 'Une donnée fausse est pire qu’une donnée manquante',
    attacco:
      'De ce que vous conseillez, c’est vous qui répondez. L’exactitude n’est donc pas une fonction parmi d’autres : c’est la contrainte autour de laquelle le reste est construit.',
    impegni: [
      { marchio: 'Source', nome: 'Chaque réponse citée', riga: 'Le document et l’endroit exact, page et article, sous chaque affirmation' },
      { marchio: 'Je ne sais pas', nome: 'Jamais de réponse inventée', riga: 'Si la réponse n’est pas dans les documents, Velia le dit' },
      { marchio: 'À vous seuls', nome: 'Documents confidentiels', riga: 'Ce que vous déposez reste au cabinet, chiffré, invisible aux autres' },
      { marchio: 'RGPD', nome: 'Traitement conforme', riga: 'Rôles définis au contrat, maîtrise de la donnée qui reste la vôtre' },
      { marchio: 'Traces', nome: 'Sources toujours tracées', riga: 'De chaque réponse il reste la trace des documents utilisés' },
      { marchio: 'Mémoire', nome: 'Sous votre contrôle', riga: 'Lisible, corrigible, effaçable entrée par entrée' },
    ],
  },

  pourQui: {
    occhiello: 'Pour qui',
    titolo: 'Le même outil, quatre métiers différents',
    attacco:
      'Un cabinet de courtage avec quarante compagnies au portefeuille, une agence générale et une direction technique ne demandent pas les mêmes choses. Velia s’adapte au métier, et non l’inverse.',
    profili: [
      { nome: 'Courtiers', riga: 'Répondre au client pendant qu’il est encore en face, le devis concurrent démonté à côté de vos conditions.' },
      { nome: 'Agents généraux', riga: 'Vos produits et ceux d’en face dans le même tableau, à l’échelle, aux couleurs de l’agence.' },
      { nome: 'Mandataires', riga: 'La structure d’un grand cabinet sans le service technique : quelques règles écrites une fois.' },
      { nome: 'Compagnies', riga: 'Vos produits vus avec les yeux du réseau, sur la bonne version, avant le contentieux.' },
    ],
  },

  demarrer: {
    occhiello: 'Comment on démarre',
    titolo: 'Trois pas, et le premier prend une demi-heure',
    passi: [
      {
        numero: '01',
        nome: 'Une démo sur un de vos documents',
        riga: 'Apportez un cahier des charges, même anonymisé. En une demi-heure vous voyez si Velia vous fait gagner du temps, ou non.',
      },
      {
        numero: '02',
        nome: 'Vos cinq premières règles',
        riga: 'Celles que vous répétez le plus souvent aux nouveaux collaborateurs. Une ligne chacune, en français, comme vous les diriez à voix haute.',
      },
      {
        numero: '03',
        nome: 'Le travail récurrent',
        riga: 'Quand les deux premiers pas fonctionnent, vous lui laissez ce qui se répète : les nouvelles versions, les devis qui arrivent.',
      },
    ],
    nota: 'Aucune installation, aucun projet de migration, aucun contrat à signer pour essayer.',
  },

  chiusura: {
    titolo: 'Expliquez-lui votre façon de travailler. Une seule fois.',
    invito: 'Demander une démo',
    sito: 'sonovelia.it/fr',
    email: 'ciao@sonovelia.it',
    societa: 'Velia est un produit de Blusail Technologies S.r.l.s.',
    nota: 'Velia n’est pas un intermédiaire d’assurance : le devoir de conseil et la responsabilité professionnelle restent ceux de l’intermédiaire qui utilise l’outil.',
  },
};

export const testi = spazia(contenuto);

/** L'ordine delle diapositive. Il numero di pagine si conta da qui. */
export const diapositive = [
  'copertina',
  'memoire',
  'differenza',
  'comparaison',
  'citation',
  'sauvegarde',
  'rappel',
  'instructions',
  'archive',
  'tableaux',
  'agents',
  'documents',
  'ecosysteme',
  'securite',
  'pourQui',
  'demarrer',
  'chiusura',
] as const;

export type NomeDiapositiva = (typeof diapositive)[number];
