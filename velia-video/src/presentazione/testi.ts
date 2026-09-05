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
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, spazia(x)]),
    ) as T;
  }
  return v;
};

export type Cella = { value: string; tono?: 'pos' | 'neg' };

const contenuto = {
  copertina: {
    marchio: 'Velia',
    titolo: 'L’IA qui apprend la façon de travailler de votre cabinet.',
    sottotitolo:
      'Pour les courtiers, agents généraux et mandataires d’assurance. Le métier, elle le connaît déjà. Il lui reste à apprendre votre façon de l’exercer.',
    piede: 'Présentation produit · 2026',
  },

  constat: {
    occhiello: 'Le constat',
    titolo: 'Le temps ne part pas dans les décisions difficiles',
    attacco:
      'Il part à retrouver, revérifier et recopier des informations qui existent déjà. La documentation précontractuelle d’un seul produit dommages, ce sont quatre-vingts à cent pages entre IPID, notice et conditions générales. Un cabinet en traite des dizaines.',
    cifre: [
      { valore: '1 à 2 h', etichetta: 'pour comparer deux contrats à la main, dossier par dossier' },
      { valore: '54', etichetta: 'garanties dans une comparaison auto ordinaire' },
      { valore: '2 ou 3', etichetta: 'personnes qui détiennent la façon de faire du cabinet' },
    ],
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

  ecran: {
    occhiello: 'Velia au travail',
    titolo: 'Le contrat en cours et le devis, côte à côte',
    attacco:
      'Neuf écarts qui comptent sur 54 garanties, et pour chacun l’article dont il vient. La protection du conducteur n’est pas signalée comme lacune : votre cabinet la couvre à part, et vous le lui avez expliqué une fois.',
    colonne: ['Garantie', 'Contrat en cours', 'Devis concurrent'],
    righe: [
      { label: 'Plafond RC', a: { value: '6 450 000 €' }, b: { value: '25 000 000 €', tono: 'pos' } },
      { label: 'Franchise dommages', a: { value: '500 €' }, b: { value: '750 €' } },
      { label: 'Franchise vandalisme', a: { value: '10 %' }, b: { value: '15 %', tono: 'neg' } },
      { label: 'Protection du conducteur', a: { value: 'Incluse' }, b: { value: 'Non prévue' } },
      { label: 'Vol et incendie', a: { value: 'Valeur à neuf' }, b: { value: 'Valeur vénale', tono: 'neg' } },
      { label: 'Protection juridique', a: { value: '10 000 €' }, b: { value: '15 000 €', tono: 'pos' } },
    ] as { label: string; a: Cella; b: Cella }[],
    fonti: ['conditions_generales.pdf · art. 12 p. 34', 'devis_concurrent.pdf · sect. 3 p. 2'],
  },

  strumenti: {
    occhiello: 'La plateforme',
    titolo: 'Dix outils qui se passent le travail',
    attacco:
      'Ils parlent la langue du métier, pas celle des logiciels. Les quatre premiers font le travail de tous les jours ; les six autres font qu’il ne se refait pas deux fois.',
    voci: [
      {
        nome: 'Bibliothèque de marché',
        riga: 'Le marché français est déjà dedans, rangé par branche, produit et millésime. Le premier jour, vous posez des questions.',
      },
      {
        nome: 'Vos documents',
        riga: 'Ce qui entre au cabinet trouve sa place tout seul, et répond chaque fois que vous le mettez en cause.',
      },
      {
        nome: 'Comparaison',
        riga: 'Deux produits, une question : qu’est-ce qui change vraiment. La réponse arrive en secondes.',
      },
      {
        nome: 'Tableaux',
        riga: 'Des dizaines de produits lus en parallèle, vos critères en colonne, la source dans chaque case.',
      },
      {
        nome: 'Méthode',
        riga: 'Velia apprécie selon les critères de votre cabinet, pas selon des critères décidés en usine.',
      },
      {
        nome: 'Documents',
        riga: 'Ce qui sort est déjà mis en page à vos couleurs, en PDF, DOCX, XLSX ou PPTX.',
      },
      {
        nome: 'Canaux',
        riga: 'Le devis qui arrive par WhatsApp ou par e-mail entre tout seul, et la proposition repart de là.',
      },
      {
        nome: 'Agents',
        riga: 'Le travail qui se répète, vous le décrivez une fois en français. Ensuite vous le retrouvez fait.',
      },
      {
        nome: 'Écosystème',
        riga: 'Vos documents restent accessibles depuis les outils d’IA que vous utilisez déjà.',
      },
      {
        nome: 'Mémoire',
        riga: 'Chaque semaine de travail la rend plus juste, et ce qu’elle apprend reste au cabinet.',
      },
    ],
  },

  bibliotheque: {
    occhiello: 'Bibliothèque de marché',
    titolo: 'Vous ne partez jamais de zéro',
    attacco:
      'Les outils généralistes naissent vides : avant de vous aider, il faut les remplir, les instruire et les entretenir, cabinet par cabinet. Velia arrive pleine.',
    righe: [
      { termine: 'Déjà prête', dettaglio: 'Les produits des principaux assureurs français, chargés et entretenus par nous' },
      { termine: 'Rangée', dettaglio: 'Assureurs, branches, produits et millésimes, avec la version en cours en évidence' },
      { termine: 'Tenue à jour', dettaglio: 'Nous nous en occupons. S’il manque quelque chose, vous le signalez d’un clic' },
      { termine: 'À vous d’ajouter le reste', dettaglio: 'Le devis apporté ce matin, le contrat à renouveler : c’est tout ce que vous déposez' },
    ],
  },

  methode: {
    occhiello: 'Méthode',
    titolo: 'Personne n’apprécie une garantie comme vous l’appréciez',
    attacco:
      'Un comparateur signale comme lacune grave l’absence de la protection du conducteur. Mais vous, cette garantie, vous la couvrez depuis toujours par un contrat séparé : ce signalement, pour vous, c’est du bruit.',
    righe: [
      { termine: 'Vous l’écrivez', dettaglio: 'En français, comme vous l’expliqueriez à un nouveau collaborateur' },
      { termine: 'Cela vaut toujours', dettaglio: 'Pour tout le cabinet, dans chaque conversation, sans avoir à le répéter' },
      { termine: 'Cela reste honnête', dettaglio: 'Cela change l’appréciation, jamais les faits : la source est citée quand même' },
    ],
  },

  memoire: {
    occhiello: 'Mémoire vivante',
    titolo: 'Voilà ce que veut dire ne pas oublier',
    attacco:
      'Un dossier partagé conserve, et c’est tout : il ne relie rien, ne se souvient de rien, ne répond à rien. Chez Velia, chaque document lu entre dans quelque chose qui grandit. Le lundi, elle sait ce que vous lui avez expliqué le vendredi.',
    righe: [
      { termine: 'Vos règles', dettaglio: 'Écrites une fois, elles valent tout de suite pour toute l’équipe' },
      { termine: 'Ce qu’elle apprend', dettaglio: 'Usages, exceptions et préférences : expliqués une fois, jamais répétés' },
      { termine: 'Les cas tranchés', dettaglio: 'Chaque comparaison corrigée par vous rend la suivante meilleure' },
      { termine: 'À vous, toujours', dettaglio: 'Vous consultez, corrigez, supprimez. Ce qu’elle apprend reste au cabinet' },
    ],
  },

  documents: {
    occhiello: 'Ce qui sort',
    titolo: 'Des documents client, pas des captures d’écran',
    attacco:
      'Le tableau comparatif, la synthèse, la note de conseil : mis en page à vos couleurs et prêts à partir. Vous relisez, vous signez.',
    formati: ['PDF', 'DOCX', 'XLSX', 'PPTX'],
    righe: [
      { termine: 'À vos couleurs', dettaglio: 'Votre logo, vos polices, vos mentions : le document est le vôtre' },
      { termine: 'Depuis vos modèles', dettaglio: 'Vous déposez le modèle du cabinet, Velia le remplit' },
      { termine: 'Avec les sources', dettaglio: 'Chaque valeur reste rattachée au document dont elle vient' },
    ],
  },

  agents: {
    occhiello: 'Agents et écosystème',
    titolo: 'Elle travaille aussi quand vous ne la regardez pas',
    attacco:
      'Certaines choses ne valent pas la peine d’être refaites à la main : vérifier si une nouvelle version est parue, relire chaque lundi ce qui est entré au cabinet. Vous les décrivez une fois et Velia les fait seule.',
    righe: [
      { termine: 'Quand vous voulez', dettaglio: 'Une tâche décrite une fois, répétée chaque jour, chaque semaine ou chaque mois' },
      { termine: 'Là où vous êtes', dettaglio: 'Vos documents accessibles depuis les outils d’IA que vous utilisez déjà' },
      { termine: 'Avec les mêmes règles', dettaglio: 'La méthode du cabinet et la citation de la source valent aussi ici' },
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
  'constat',
  'differenza',
  'ecran',
  'strumenti',
  'bibliotheque',
  'methode',
  'memoire',
  'documents',
  'agents',
  'securite',
  'pourQui',
  'demarrer',
  'chiusura',
] as const;

export type NomeDiapositiva = (typeof diapositive)[number];
