import type { Chiusura, MetaPagina, Riga, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Azienda',
  description:
    'Velia è un prodotto di Blusail Technologies. Come lavoriamo, perché lo costruiamo insieme alle agenzie e quali posizioni sono aperte.',
};

/** `{azienda}` è sostituito con la ragione sociale: non si traduce. */
const testata: Testata = {
  eyebrow: 'Azienda',
  title: 'Un prodotto costruito dentro le agenzie, non attorno',
  lead: "Velia è sviluppato da {azienda}. Nasce da un'osservazione fatta stando in agenzia, e viene messo a punto insieme a chi ci lavora tutti i giorni.",
};

const briciola = 'Azienda';

const storia: { title: string; paragrafi: string[] } = {
  title: 'Da dove viene Velia',
  paragrafi: [
    'Velia nasce dentro le agenzie, guardando come si lavora davvero. Il valore di un intermediario sta nel giudizio e nella relazione con il cliente, eppure le giornate se ne vanno a cercare, rileggere e ricopiare informazioni che esistono già.',
    "E nasce da una convinzione: in questo settore l'intelligenza artificiale serve solo se rispetta il mestiere. Ogni agenzia ha un modo proprio di valutare, costruito in anni di lavoro; uno strumento serio deve impararlo, non sostituirlo con criteri decisi in fabbrica.",
    "Velia mette insieme le due cose. Il mercato c'è già il primo giorno; il modo di valutarlo lo scrivi tu. Il resto (decidere, consigliare, firmare) resta dove è sempre stato.",
  ],
};

const criteri: { title: string; voci: Riga[] } = {
  title: 'Quattro criteri con cui decidiamo',
  voci: [
    {
      term: 'La fonte',
      detail:
        "Nessuna risposta senza il passaggio che la sostiene. Se Velia non può citare, dice che non sa: è meno impressionante in demo e molto più utile il martedì mattina.",
    },
    {
      term: "L'ultima parola",
      detail:
        "Lo strumento prepara; l'intermediario decide e firma. In un settore vigilato non esiste automazione che possa assumersi una responsabilità professionale, e progettare come se esistesse è disonesto.",
    },
    {
      term: 'La prassi',
      detail:
        "Non esiste un criterio di valutazione universale delle garanzie. Ogni agenzia ha il suo, ed è quello il valore che ha costruito: il software deve adattarsi a lei, non il contrario.",
    },
    {
      term: 'Il mestiere',
      detail:
        "Costruiamo con chi sta in agenzia, non attorno a un'idea di agenzia. Ogni funzione nasce da un documento vero che qualcuno doveva leggere entro sera.",
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
  id: 'lavora-con-noi',
  title: 'Lavora con noi',
  lead: 'Siamo una squadra piccola, con un modo di lavorare ibrido e una preferenza netta per chi sa spiegare le cose in modo semplice.',
  candidati: 'Candidati',
  notaPrima: 'Non trovi il tuo ruolo? Scrivi comunque a ',
  notaDopo: ': leggiamo tutto.',
  posizioni: [
    {
      title: 'Prodotto · Dominio assicurativo',
      detail:
        'Chi arriva da agenzia o brokeraggio e vuole trasformare quel mestiere in prodotto. Esperienza tecnica non richiesta.',
    },
    {
      title: 'Customer success · Onboarding agenzie',
      detail:
        'Affiancamento alle agenzie che entrano: mettere per iscritto il loro metodo e portarle ai primi confronti in autonomia.',
    },
  ],
};

const chiusura: Chiusura = {
  title: 'Vuoi capire se fa al caso tuo?',
  cta: 'Richiedi una demo',
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
