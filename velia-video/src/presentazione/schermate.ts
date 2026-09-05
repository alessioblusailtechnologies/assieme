/**
 * I contenuti delle schermate dell'applicativo, in francese.
 *
 * Ogni voce è quello che si vede in una schermata vera: la conversazione, la
 * tabella, i nomi dei documenti, le regole del cabinet. Come nel resto del
 * francese, nessun nome di compagnia: i documenti si chiamano
 * `conditions_generales.pdf` e `devis_concurrent.pdf`, i clienti Martin e
 * Durand, il cabinet è Ferrand.
 */

export type Cella = { v: string; tono?: 'pos' | 'neg' };

/** Il segnaposto della barra di composizione, uguale in tutta l'app. */
export const composer =
  'Posez une question sur les documents — « @ » pour les référencer';

export const schermate = {
  /** Confronto fra la polizza in corso e un preventivo. */
  comparaison: {
    percorso: 'Dossiers / Renouvellement auto · client Martin',
    azioni: ['Exporter'],
    domanda: 'Compare le devis concurrent avec le contrat auto en cours du client Martin.',
    allegati: ['devis_concurrent.pdf', 'conditions_generales.pdf'],
    intro: 'J’ai comparé les 54 garanties du dossier. Voici les écarts qui comptent :',
    colonne: ['Garantie', 'Contrat en cours', 'Devis concurrent'],
    righe: [
      { label: 'Plafond RC', celle: [{ v: '6 450 000 €' }, { v: '25 000 000 €', tono: 'pos' }] },
      { label: 'Franchise dommages', celle: [{ v: '500 €' }, { v: '750 €' }] },
      { label: 'Franchise vandalisme', celle: [{ v: '10 %' }, { v: '15 %', tono: 'neg' }] },
      { label: 'Protection du conducteur', celle: [{ v: 'Incluse' }, { v: 'Non prévue' }] },
      { label: 'Vol et incendie', celle: [{ v: 'Valeur à neuf' }, { v: 'Valeur vénale', tono: 'neg' }] },
    ] as { label: string; celle: Cella[] }[],
    sintesi:
      'Neuf écarts sur 54 garanties. Voulez-vous que je prépare la note de conseil ?',
    composer: 'Posez une question sur les documents — « @ » pour les référencer',
  },

  /** La citazione: la risposta e il passaggio aperto accanto. */
  citation: {
    percorso: 'Dossiers / Renouvellement auto · client Martin',
    azioni: ['Ouvrir la source'],
    domanda: 'Sur quelle base l’assureur peut-il exercer un recours ?',
    risposta:
      'Le recours est prévu en cas de fausse déclaration intentionnelle sur les caractéristiques du risque, et en cas de conduite sous l’empire d’un état alcoolique.',
    etichettaFonti: 'Sources',
    fonti: ['conditions_generales.pdf · art. 12 p. 34'],
    documento: {
      nome: 'conditions_generales.pdf',
      pagina: 'Page 34 · Article 12',
      titolo: 'Article 12 — Recours de l’assureur',
      righe: [
        { t: 'L’assureur est fondé à exercer un recours contre le souscripteur', evidenzia: false },
        { t: 'en cas de fausse déclaration intentionnelle portant sur les', evidenzia: true },
        { t: 'caractéristiques du risque, ainsi qu’en cas de conduite sous', evidenzia: true },
        { t: 'l’empire d’un état alcoolique caractérisé.', evidenzia: true },
        { t: 'Le recours s’exerce dans la limite des sommes versées au tiers', evidenzia: false },
        { t: 'lésé, majorées des frais de procédure engagés.', evidenzia: false },
      ],
    },
  },

  /** La regola dettata a voce che diventa memoria. */
  memoire: {
    percorso: 'Dossiers / Renouvellement auto · client Martin',
    domanda:
      'Non : la protection du conducteur, nous la couvrons toujours par un contrat séparé. Ce n’est pas une lacune.',
    risposta: 'Compris : pour votre cabinet, je ne la signalerai plus comme lacune.',
    salvataggio: 'Enregistré en mémoire',
    voce: {
      titolo: 'Protection du conducteur couverte à part',
      dettaglio:
        'Ne pas signaler comme lacune : le cabinet la couvre toujours par un contrat dédié.',
      meta: 'Règle du cabinet · appliquée à tous les dossiers · 5 septembre 2026',
    },
  },

  /** La stessa regola, ritrovata su un altro cliente. */
  rappel: {
    percorso: 'Dossiers / Renouvellement auto · client Durand',
    domanda: 'Compare le nouveau devis avec le contrat auto en cours du client Durand.',
    allegati: ['devis_durand.pdf', 'contrat_durand.pdf'],
    risposta:
      'Le devis ne couvre pas la protection du conducteur. Je ne la signale pas comme lacune : votre cabinet la couvre toujours par un contrat séparé.',
    etichettaMemoria: 'Mémoire',
    provenienza: 'Protection du conducteur couverte à part par un contrat dédié',
    etichettaFonti: 'Sources',
    fonti: ['devis_durand.pdf · sect. 2 p. 3'],
  },

  /** Le istruzioni: i criteri del cabinet scritti in francese. */
  instructions: {
    percorso: 'Cabinet / Instructions',
    azioni: ['Nouvelle instruction'],
    pannello: 'Instructions du cabinet',
    azionePannello: 'Actives · 7',
    voci: [
      {
        titolo: 'Protection du conducteur',
        testo: 'Couverte à part par un contrat dédié : ne jamais la signaler comme lacune.',
        stato: 'Toutes branches',
      },
      {
        titolo: 'Plafond RC sous 8 M€',
        testo: 'Le signaler et proposer systématiquement une extension.',
        stato: 'Auto',
      },
      {
        titolo: 'Clients avec flotte',
        testo: 'La comparaison se fait par véhicule, jamais au global.',
        stato: 'Auto · Flottes',
      },
      {
        titolo: 'Reprise du passé',
        testo: 'En base réclamation, toujours vérifier la reprise avant de conclure.',
        stato: 'RC Pro',
      },
    ],
    anteprima: {
      titolo: 'Ce que Velia en fait',
      testo:
        'Écrites en français, une ligne chacune. Elles valent tout de suite, pour toute l’équipe, dans chaque conversation — et chaque fois qu’une règle s’applique, Velia le déclare.',
    },
  },

  /** L'archivio del cabinet: cartelle libere e documenti. */
  archive: {
    percorso: 'Documents du cabinet',
    azioni: ['Déposer'],
    cartelle: [
      { nome: 'Clients', conta: '312', aperta: true },
      { nome: 'Martin', conta: '9', livello: 1, aperta: true },
      { nome: 'Auto', conta: '4', livello: 2, attiva: true },
      { nome: 'RC Pro', conta: '3', livello: 2 },
      { nome: 'Durand', conta: '6', livello: 1 },
      { nome: 'Conventions', conta: '24' },
      { nome: 'Modèles du cabinet', conta: '11' },
    ],
    colonne: ['Document', 'Type', 'Ajouté', 'État'],
    documenti: [
      { nome: 'conditions_generales.pdf', tipo: 'Conditions générales', data: '3 sept.', stato: 'Indexé' },
      { nome: 'devis_concurrent.pdf', tipo: 'Devis', data: '5 sept.', stato: 'Indexé' },
      { nome: 'ipid_auto.pdf', tipo: 'IPID', data: '3 sept.', stato: 'Indexé' },
      { nome: 'avenant_2026.docx', tipo: 'Avenant', data: '5 sept.', stato: 'Indexé' },
    ],
    nota: 'Arrivé par e-mail · classé automatiquement',
  },

  /** Le tabelle di analisi su molti prodotti. */
  tableaux: {
    percorso: 'Tableaux d’analyse / RC Professionnelle',
    azioni: ['Colonnes', 'Exporter'],
    colonne: ['Produit', 'Plafond', 'Reprise du passé', 'Subséquente'],
    righe: [
      { label: 'Produit A', celle: [{ v: '2 000 000 €' }, { v: 'Illimitée', tono: 'pos' }, { v: '5 ans' }] },
      { label: 'Produit B', celle: [{ v: '1 500 000 €' }, { v: '5 ans' }, { v: '5 ans' }] },
      { label: 'Produit C', celle: [{ v: '2 000 000 €' }, { v: '3 ans', tono: 'neg' }, { v: '10 ans', tono: 'pos' }] },
      { label: 'Produit D', celle: [{ v: '1 000 000 €', tono: 'neg' }, { v: 'Illimitée', tono: 'pos' }, { v: 'Non prévu', tono: 'neg' }] },
      { label: 'Produit E', celle: [{ v: '3 000 000 €', tono: 'pos' }, { v: '5 ans' }, { v: '5 ans' }] },
      { label: 'Produit F', celle: [{ v: '2 000 000 €' }, { v: 'Non prévu', tono: 'neg' }, { v: '5 ans' }] },
      { label: 'Produit G', celle: [{ v: '1 500 000 €' }, { v: '5 ans' }, { v: 'Non prévu', tono: 'neg' }] },
    ] as { label: string; celle: Cella[] }[],
    nota: 'Là où la donnée n’est pas dans le document, la case indique « non prévu » au lieu de deviner.',
    etichettaFonti: 'Chaque case renvoie à sa source',
  },

  /** La creazione di un agente. */
  agents: {
    percorso: 'Agents / Nouvel agent',
    azioni: ['Activer'],
    pannello: 'Ce que doit faire l’agent',
    consegna:
      'Chaque lundi, vérifie si une nouvelle version des conditions générales des produits que je place est parue. Si oui, dis-moi ce qui a changé, garantie par garantie, avec la source.',
    campi: [
      { etichetta: 'Fréquence', valore: 'Chaque lundi, 8 h 00' },
      { etichetta: 'Portée', valore: 'Produits placés par le cabinet · 34 documents' },
      { etichetta: 'Résultat', valore: 'Note dans la conversation + e-mail' },
      { etichetta: 'Règles', valore: 'Méthode du cabinet appliquée · sources citées' },
    ],
    attivi: 'Agents actifs',
    elenco: [
      { nome: 'Nouvelles versions', quando: 'Chaque lundi', stato: 'Actif' },
      { nome: 'Devis entrants', quando: 'À réception', stato: 'Actif' },
      { nome: 'Revue du portefeuille', quando: 'Chaque mois', stato: 'En pause' },
    ],
  },

  /** Il documento generato, col marchio del cabinet. */
  documents: {
    percorso: 'Dossiers / Renouvellement auto · client Martin',
    azioni: ['Télécharger'],
    pannello: 'Document généré',
    formati: ['PDF', 'DOCX', 'XLSX', 'PPTX'],
    foglio: {
      cabinet: 'Cabinet Ferrand',
      titolo: 'Analyse comparative — Renouvellement auto',
      cliente: 'Client Martin · 5 septembre 2026',
      sezioni: [
        'Contrat en cours et devis concurrent, garantie par garantie',
        'Neuf écarts qui comptent, avec la source de chaque valeur',
        'Protection du conducteur : couverte à part, non signalée comme lacune',
      ],
      piede: 'Document établi par le cabinet · sources citées en annexe',
    },
  },
};
