/**
 * I testi della composizione MemoriaViva, per lingua.
 *
 * La scena è la stessa: un confronto in chat, una regola dettata a voce, e la
 * stessa regola ricordata su un altro cliente. Cambiano la lingua e i
 * riferimenti di mercato.
 *
 * In francese non compaiono nomi di compagnie: nel video, come nella
 * riproduzione statica del sito, sarebbero marchi altrui dentro una scena mai
 * avvenuta. Le colonne diventano «contrat en cours» e «devis concurrent», e i
 * clienti si chiamano Martin e Durand.
 */

export type LinguaVideo = 'it' | 'fr';

export type Tono = 'pos' | 'neg' | undefined;

export type TestiMemoria = {
  user1: string;
  riferimenti: string[];
  attesa: string;
  intro: string;
  sintesi: string;
  citazioni: { titolo: string; pos: string }[];
  user2: string;
  velia2: string;
  salva: string;
  placeholder: string;
  user3: string;
  riferimenti3: string[];
  velia3: string;
  citazioni3: { titolo: string; pos: string }[];
  provenienza3: string;
  /** L'intestazione dell'applicativo. */
  saluto: string;
  agenzia: string;
  utente: string;
  ruolo: string;
  /** Le intestazioni della tabella di confronto. */
  colonne: [string, string, string];
  fonti: string;
  /** La tabella: `icona` è la chiave del glifo, `nome` l'etichetta a schermo. */
  tabella: { label: string; a: string; b: string; tono?: Tono }[];
  nav: { gruppo: string; voci: { icona: string; nome: string; attiva?: boolean }[] }[];
};

const it: TestiMemoria = {
  user1: 'Confronta il preventivo Unipol con la polizza auto del cliente Rossi.',
  riferimenti: ['preventivo_unipol.pdf', 'polizza_autopiu_cga.pdf'],
  attesa: 'Sto leggendo i documenti…',
  intro: 'Ho confrontato le 54 garanzie del fascicolo. Ecco il quadro, garanzia per garanzia:',
  sintesi:
    '9 differenze rilevanti su 54 garanzie. Il preventivo non copre gli infortuni del conducente, che la polizza attuale include: la segnalo come carenza?',
  citazioni: [
    { titolo: 'CGA Active Veicoli AUTOPIÙ', pos: 'ART. 12 · P. 34' },
    { titolo: 'Preventivo Unipol', pos: 'SEZ. 3 · P. 2' },
  ],
  user2:
    'No: gli infortuni del conducente li copriamo sempre con una polizza dedicata. Non è una carenza.',
  velia2: 'Capito: per la tua agenzia non la segnalerò più come carenza.',
  salva: 'Sto salvando in memoria…',
  placeholder: 'Fai una domanda sui documenti — «@» per referenziarli',
  /* Secondo atto: un altro cliente, la stessa regola — stavolta ricordata. */
  user3: 'Confronta il preventivo Generali con la polizza auto del cliente Bianchi.',
  riferimenti3: ['preventivo_generali.pdf', 'polizza_bianchi_cga.pdf'],
  velia3:
    'Il preventivo non copre gli infortuni del conducente. Non la segnalo come carenza: la tua agenzia li copre sempre con una polizza dedicata.',
  citazioni3: [{ titolo: 'Preventivo Generali', pos: 'SEZ. 2 · P. 3' }],
  provenienza3: 'Infortuni del conducente coperti a parte con polizza dedicata',

  saluto: 'Ciao, sono Velia.',
  agenzia: 'Agenzia Ferrero',
  utente: 'm.ferrero',
  ruolo: 'Titolare',
  colonne: ['Garanzia', 'Polizza attuale', 'Preventivo'],
  fonti: 'Fonti',

  tabella: [
    { label: 'Massimale RCA', a: '€ 6.450.000', b: '€ 25.000.000', tono: 'pos' },
    { label: 'Franchigia kasko', a: '€ 500', b: '€ 750' },
    { label: 'Scoperto atti vandalici', a: '10%', b: '15%', tono: 'neg' },
    { label: 'Infortuni del conducente', a: 'Inclusa', b: 'Non prevista', tono: 'neg' },
    { label: 'Cristalli', a: '€ 1.000', b: '€ 800', tono: 'neg' },
    { label: 'Eventi naturali', a: 'Inclusa', b: 'Inclusa' },
    { label: 'Furto e incendio', a: 'Valore a nuovo', b: 'Valore commerciale', tono: 'neg' },
    { label: 'Assistenza stradale', a: 'Base', b: 'Estesa', tono: 'pos' },
    { label: 'Tutela legale', a: '€ 10.000', b: '€ 15.000', tono: 'pos' },
    { label: 'Rinuncia alla rivalsa', a: 'Inclusa', b: 'Non prevista', tono: 'neg' },
    { label: 'Veicolo sostitutivo', a: 'Non previsto', b: 'Incluso', tono: 'pos' },
    { label: 'Bonus protetto', a: 'Incluso', b: 'Incluso' },
  ],

  /* La navigazione vera (layout/navigazione.ts). */
  nav: [
    {
      gruppo: 'Lavoro',
      voci: [
        { icona: 'chat', nome: 'Chat', attiva: true },
        { icona: 'tabelle', nome: 'Tabelle di analisi' },
      ],
    },
    {
      gruppo: 'Archivi',
      voci: [
        { icona: 'archivio', nome: 'Archivio pubblico' },
        { icona: 'archivio', nome: 'Archivio privato' },
      ],
    },
    { gruppo: 'Automazione', voci: [{ icona: 'agenti', nome: 'Agenti' }] },
    {
      gruppo: 'Agenzia',
      voci: [
        { icona: 'memoria', nome: 'Memoria' },
        { icona: 'impostazioni', nome: 'Impostazioni' },
      ],
    },
  ],
};

const fr: TestiMemoria = {
  user1: 'Compare le devis concurrent avec le contrat auto en cours du client Martin.',
  riferimenti: ['devis_concurrent.pdf', 'conditions_generales.pdf'],
  attesa: 'Je lis les documents…',
  intro: 'J’ai comparé les 54 garanties du dossier. Voici le tableau, garantie par garantie :',
  sintesi:
    '9 écarts qui comptent sur 54 garanties. Le devis ne couvre pas la protection du conducteur, que le contrat en cours inclut : je la signale comme lacune ?',
  citazioni: [
    { titolo: 'Conditions générales', pos: 'ART. 12 · P. 34' },
    { titolo: 'Devis concurrent', pos: 'SECT. 3 · P. 2' },
  ],
  user2:
    'Non : la protection du conducteur, nous la couvrons toujours par un contrat séparé. Ce n’est pas une lacune.',
  velia2: 'Compris : pour votre cabinet, je ne la signalerai plus comme lacune.',
  salva: 'J’enregistre en mémoire…',
  placeholder: 'Posez une question sur les documents — « @ » pour les référencer',
  /* Secondo atto: un altro cliente, la stessa regola, stavolta ricordata. */
  user3: 'Compare le nouveau devis avec le contrat auto en cours du client Durand.',
  riferimenti3: ['devis_durand.pdf', 'contrat_durand.pdf'],
  velia3:
    'Le devis ne couvre pas la protection du conducteur. Je ne la signale pas comme lacune : votre cabinet la couvre toujours par un contrat séparé.',
  citazioni3: [{ titolo: 'Devis Durand', pos: 'SECT. 2 · P. 3' }],
  provenienza3: 'Protection du conducteur couverte à part par un contrat dédié',

  saluto: 'Bonjour, je suis Velia.',
  agenzia: 'Cabinet Ferrand',
  utente: 'm.ferrand',
  ruolo: 'Gérant',
  colonne: ['Garantie', 'Contrat en cours', 'Devis'],
  fonti: 'Sources',

  tabella: [
    { label: 'Plafond RC', a: '6 450 000 €', b: '25 000 000 €', tono: 'pos' },
    { label: 'Franchise dommages', a: '500 €', b: '750 €' },
    { label: 'Franchise vandalisme', a: '10 %', b: '15 %', tono: 'neg' },
    { label: 'Protection du conducteur', a: 'Incluse', b: 'Non prévue', tono: 'neg' },
    { label: 'Bris de glace', a: '1 000 €', b: '800 €', tono: 'neg' },
    { label: 'Événements naturels', a: 'Incluse', b: 'Incluse' },
    { label: 'Vol et incendie', a: 'Valeur à neuf', b: 'Valeur vénale', tono: 'neg' },
    { label: 'Assistance', a: 'Base', b: 'Étendue', tono: 'pos' },
    { label: 'Protection juridique', a: '10 000 €', b: '15 000 €', tono: 'pos' },
    { label: 'Renonciation à recours', a: 'Incluse', b: 'Non prévue', tono: 'neg' },
    { label: 'Véhicule de remplacement', a: 'Non prévu', b: 'Inclus', tono: 'pos' },
    { label: 'Bonus protégé', a: 'Inclus', b: 'Inclus' },
  ],

  nav: [
    {
      gruppo: 'Travail',
      voci: [
        { icona: 'chat', nome: 'Conversation', attiva: true },
        { icona: 'tabelle', nome: 'Tableaux d’analyse' },
      ],
    },
    {
      gruppo: 'Documents',
      voci: [
        { icona: 'archivio', nome: 'Bibliothèque de marché' },
        { icona: 'archivio', nome: 'Documents du cabinet' },
      ],
    },
    { gruppo: 'Automatisation', voci: [{ icona: 'agenti', nome: 'Agents' }] },
    {
      gruppo: 'Cabinet',
      voci: [
        { icona: 'memoria', nome: 'Mémoire' },
        { icona: 'impostazioni', nome: 'Réglages' },
      ],
    },
  ],
};

export const testiMemoria: Record<LinguaVideo, TestiMemoria> = { it, fr };
