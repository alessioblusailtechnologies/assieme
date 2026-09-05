/**
 * Contenuti della homepage.
 *
 * Registro: professionale e asciutto. Si nomina il lavoro dell'agenzia, non
 * il funzionamento del software. Il gergo di dominio — set informativo, DIP,
 * capitolato — resta, perché è la lingua di chi legge; il gergo tecnico —
 * tenant, referenziazione, MCP, knowledge base — no.
 *
 * Le capacità sono presentate come prodotti con un nome e una riga, non come
 * moduli con l'elenco delle funzioni.
 *
 * Sostanza allineata a «VELIA — Analisi dei Requisiti» v0.10 (19/08/2026).
 *
 * ⚠️ Da sostituire prima della pubblicazione: i loghi cliente nei due nastri.
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
  /* Con i loghi spenti la fascia porta tre prove concrete del prodotto:
     affermazioni vere oggi, senza promettere clienti che non ci sono. */
  prove: string[];
} = {
  title: ["L'AI che impara", 'come lavora la tua agenzia.', 'E non lo dimentica.'],
  lead: "Velia è l'intelligenza artificiale per chi distribuisce assicurazioni, agenzie, broker e intermediari: il mestiere lo conosce già, deve solo imparare come lo fai tu.",
  cta: 'Richiedi una demo',
  link: { rotta: 'demo' },
  loghiEtichetta: 'Compagnie con prodotti in archivio',
  proveEtichetta: 'Perché Velia',
  proveCta: 'Guarda Velia al lavoro',
  proveLink: { rotta: 'clienti' },
  logoSegnaposto: 'logo',
  /** `{n}` è il numero dello slot. */
  logoCliente: 'Logo cliente {n}',
  prove: [
    'Ogni risposta con la fonte citata',
    'Zero documenti da caricare per iniziare',
    'I tuoi dati restano tuoi',
  ],
};

export const statement: { titolo: string; strong: string; muted: string } = {
  /* Il posizionamento è lungo due frasi: come h2 sarebbe un titolo di 250
     caratteri. Il titolo vero resta breve e nascosto. */
  titolo: "Che cos'è Velia",
  strong: 'Le AI generiche ripartono da zero a ogni conversazione. Velia no.',
  muted:
    "Lavora sui documenti che hai già in archivio, ragiona con i criteri della tua agenzia e lascia sempre a te l'ultima parola.",
};

/**
 * I media della home: il nome del filmato e le descrizioni per chi non lo
 * vede. Il filmato è girato per lingua, perché dentro c'è un'interfaccia
 * piena di testo: un prodotto che parla italiano su una pagina francese
 * disfa da solo il lavoro di adattamento.
 */
export const media: { filmato: string; video: string; grafo: string; ritratto: string } = {
  filmato: 'memoria-viva',
  video:
    "Velia all'opera: il confronto fra polizza e preventivo in chat diventa un ricordo nella memoria dell'agenzia",
  grafo:
    "Rappresentazione della memoria viva dell'agenzia: centinaia di nodi (documenti, regole e casistica risolta) raggruppati in cluster e collegati fra loro.",
  ritratto:
    'Al lavoro sui documenti, a fine giornata, nella luce dello schermo',
};

/* -------------------------------------------------------------------------
 * Riproduzione dell'interfaccia — caso pilota del ramo auto (§5.3)
 *
 * La riga «Infortuni del conducente» non è un dettaglio: un comparatore a
 * criteri fissi la segnalerebbe come carenza grave, mentre l'agenzia che
 * abbina sempre una polizza dedicata non vuole vederla segnalata.
 * ---------------------------------------------------------------------- */

/** `tone` colora la cella: peggiorativa, migliorativa o neutra. */
export type Cell = { value: string; tone?: 'neg' | 'pos' };

export const productShot: {
  breadcrumb: string;
  title: string;
  columns: string[];
  rows: { label: string; a: Cell; b: Cell }[];
  summary: string;
  citations: string[];
} = {
  breadcrumb: 'Fascicolo / Rinnovo auto · cliente Rossi',
  title: 'Ramo auto: la polizza in corso e il preventivo a confronto',
  columns: ['Garanzia', 'Active Veicoli AUTOPIÙ', 'Preventivo Unipol'],
  rows: [
    {
      label: 'Massimale RCA',
      a: { value: '€ 6.450.000' },
      b: { value: '€ 25.000.000', tone: 'pos' },
    },
    {
      label: 'Franchigia kasko',
      a: { value: '€ 500' },
      b: { value: '€ 750' },
    },
    {
      label: 'Scoperto atti vandalici',
      a: { value: '10%' },
      b: { value: '15%', tone: 'neg' },
    },
    {
      label: 'Infortuni del conducente',
      a: { value: 'Inclusa' },
      b: { value: 'Non prevista' },
    },
  ],
  summary:
    "9 differenze rilevanti su 54 garanzie. Gli infortuni del conducente non risultano carenza: gliel'hai spiegato una volta, la tua agenzia li copre a parte.",
  citations: ['autopiu_cda.pdf · art. 12 p. 34', 'preventivo_unipol.pdf · sez. 3 p. 2'],
};

/** La cornice attorno alla riproduzione dell'interfaccia. */
export const shot: {
  titolo: string;
  didascalia: string;
  tabellaDidascalia: string;
  schede: string[];
  richiesta: string;
  invia: string;
  sintesi: string;
} = {
  titolo: "Velia all'opera: il confronto fra due proposte",
  didascalia:
    "Esempio di confronto generato da Velia: ogni valore rimanda all'articolo e alla pagina del documento da cui è stato estratto.",
  tabellaDidascalia:
    'Confronto ramo auto: polizza Active Veicoli AUTOPIÙ e preventivo Unipol garanzia per garanzia, con fonte citata per ogni valore.',
  schede: ['Confronto', 'Esporta'],
  richiesta: 'Chiedi a Velia…',
  invia: 'Invia',
  sintesi: 'Sintesi',
};

/** Il filmato di prodotto, alternativa alla riproduzione statica. */
export const reel: {
  titolo: string;
  descrizione: string;
  didascalia: string;
  pausa: string;
} = {
  titolo: "Velia all'opera: dal documento al confronto",
  descrizione:
    'Velia legge due capitolati assicurativi, ne estrae le garanzie e ne mette a confronto le condizioni.',
  didascalia:
    "Due capitolati a confronto: garanzie allineate, differenze in evidenza e ogni valore riconducibile all'articolo di origine.",
  pausa: 'Pausa',
};

/* -------------------------------------------------------------------------
 * Memoria viva — il differenziale, raccontato come vantaggio e non come
 * architettura: le regole che detti, quello che impara, i documenti di
 * riferimento sempre a portata.
 *
 * Il contrasto con la cartella condivisa non è retorico: è esattamente da
 * lì che i documenti arrivano oggi, ed è il paragone che il lettore fa da sé.
 * ---------------------------------------------------------------------- */

export const memory: {
  eyebrow: string;
  title: string;
  body: string;
  rows: Riga[];
  cta: string;
  link: Destinazione;
} = {
  eyebrow: 'Memoria viva',
  title: 'Ecco cosa significa non dimenticare',
  cta: 'Come funziona la memoria viva',
  link: { rotta: 'piattaforma', ancora: 'memoria' },
  body: 'Le cartelle condivise conservano e basta: non collegano, non ricordano, non rispondono. In Velia ogni documento letto entra in qualcosa che cresce, fatto delle regole che le detti, delle scelte che ti vede fare, dei casi che avete già risolto insieme. Il lunedì sa quello che le hai spiegato il venerdì.',
  rows: [
    {
      term: 'Le tue regole',
      detail:
        'Scrivi in italiano come valuta la tua agenzia. Vale da subito, per tutti i colleghi.',
    },
    {
      term: 'Quello che impara',
      detail: 'Prassi, eccezioni e preferenze: spiegate una volta, mai più ripetute.',
    },
    {
      term: 'Sempre tuo',
      detail:
        "Consulti, correggi, cancelli. Quello che Velia impara resta dell'agenzia.",
    },
  ],
};

/* -------------------------------------------------------------------------
 * Ticker — otto voci, quante ne prevede l'animazione.
 *
 * Nomi del lavoro, non del software. Solo attività del perimetro dei
 * requisiti: rinnovi, sinistri e scadenze sono fuori (§5.5); i canali
 * WhatsApp ed email sono dentro dalla v0.10 (Modulo H).
 * ---------------------------------------------------------------------- */

/** Le due righe dell'intestazione del ticker, separate da un a capo. */
export const useCasesIntro: string[] = [
  'Ogni giorno, le agenzie',
  'usano Velia per',
];

export const useCasesCta: { label: string; link: Destinazione } = {
  label: 'Esplora la piattaforma',
  link: { rotta: 'piattaforma' },
};

export const useCases: string[] = [
  'Confronto polizze',
  'Analisi delle garanzie',
  'Lettura dei capitolati',
  'Verifica dei preventivi',
  'Ricerca fra le condizioni',
  'Allegati da WhatsApp e email',
  'Archivio documentale',
  'Proposte pronte per il cliente',
];

/* -------------------------------------------------------------------------
 * Dal campo — non una citazione firmata: nessuna frase autorizzata da
 * pubblicare, quindi la storia è raccontata in terza persona, senza
 * virgolette né firma da inventare.
 * ---------------------------------------------------------------------- */

export const testimonial: {
  titolo: string;
  quote: string;
  cta: string;
  link: Destinazione;
} = {
  titolo: 'Dal campo',
  quote:
    "Un'agenzia ci ha spiegato una volta sola, in italiano, che gli infortuni del conducente li copre sempre con una polizza a parte. Da allora Velia non li segnala più come carenza: ragiona come ragionano loro.",
  cta: 'Guarda la dimostrazione',
  link: { rotta: 'clienti' },
};

/* -------------------------------------------------------------------------
 * Dimostrazioni — non storie cliente firmate: nessun caso pubblicabile con
 * nome e numeri, quindi si mostra il prodotto al lavoro.
 * ---------------------------------------------------------------------- */

export const storiesIntro: {
  title: string;
  cta: string;
  link: Destinazione;
  targhetta: string;
} = {
  title: 'Tre dimostrazioni. Documenti veri, risposte verificabili.',
  cta: 'Vedi tutte le dimostrazioni',
  link: { rotta: 'clienti' },
  targhetta: 'Dimostrazione',
};

export const stories: { title: string; link: Destinazione; img: string }[] = [
  {
    title: 'Un preventivo concorrente smontato in dieci minuti',
    link: { rotta: 'clienti', ancora: 'confronto-auto' },
    /** Schermata sfocata dell'applicativo: anticipa senza svelare. */
    img: '/media/demo-confronto.jpg',
  },
  {
    title: 'Dieci prodotti, una tabella, ogni casella con la sua fonte',
    link: { rotta: 'clienti', ancora: 'tabella-analisi' },
    img: '/media/demo-tabella.jpg',
  },
  {
    title: 'Le nuove edizioni ti trovano loro, non il contrario',
    link: { rotta: 'clienti', ancora: 'agente-edizioni' },
    img: '/media/demo-agenti.jpg',
  },
];

/* -------------------------------------------------------------------------
 * Numeri — non metriche di adozione (non ne pubblichiamo) ma scelte di
 * progetto, verificabili in demo.
 * ---------------------------------------------------------------------- */

export const statsIntro: string[] = [
  'Meno tempo sui documenti,',
  'più tempo con i clienti',
];

export const stats: { label: string; value: string }[] = [
  { label: 'Documenti da caricare per iniziare', value: 'Zero' },
  { label: 'Volte che devi ripetere una regola', value: 'Una' },
  { label: 'Risposte con la fonte citata', value: '100%' },
  { label: 'Documenti in un solo confronto', value: 'Decine' },
  { label: 'Compagnie già in archivio', value: 'Più di 30' },
];

/* -------------------------------------------------------------------------
 * Sicurezza — sulla home basta una promessa breve; il dettaglio sta su
 * /sicurezza.
 * ---------------------------------------------------------------------- */

export const security: {
  title: string[];
  body: string;
  cta: string;
  link: Destinazione;
  dettagli: string;
  badges: { mark: string; name: string; link: Destinazione }[];
} = {
  title: ['Accuratezza e riservatezza,', 'prima di ogni altra cosa'],
  cta: 'Approfondisci la sicurezza',
  link: { rotta: 'sicurezza' },
  dettagli: 'Dettagli →',
  body: "Velia cita sempre da dove arriva una risposta e, quando non lo sa, lo dice. I tuoi documenti restano tuoi e quello che impara resta dell'agenzia: non esce, non finisce ad altri clienti, non addestra nessun modello.",
  /* La memoria apre la fila: è il cuore dell'angolo narrativo della pagina. */
  badges: [
    { mark: 'Memoria', name: 'Che controlli tu', link: { rotta: 'sicurezza', ancora: 'memoria' } },
    { mark: 'Fonte', name: 'Ogni risposta citata', link: { rotta: 'sicurezza', ancora: 'citazione' } },
    { mark: 'Non so', name: 'Mai una risposta inventata', link: { rotta: 'sicurezza', ancora: 'non-copertura' } },
    { mark: 'Solo tuoi', name: 'Documenti riservati', link: { rotta: 'sicurezza', ancora: 'isolamento' } },
    { mark: 'GDPR', name: 'Trattamento conforme', link: { rotta: 'sicurezza', ancora: 'gdpr' } },
    { mark: 'Tracce', name: 'Fonti sempre tracciate', link: { rotta: 'sicurezza', ancora: 'tracciabilita' } },
  ],
};

/* -------------------------------------------------------------------------
 * Testata SEO e dati strutturati della home.
 * ---------------------------------------------------------------------- */

export const meta = {
  title: 'Velia | AI per assicurazioni: agenzie, broker e intermediari',
  description:
    "Velia è l'intelligenza artificiale per le assicurazioni, dalla parte di agenzie e broker: impara le tue regole, confronta polizze e preventivi e cita la fonte, sempre. Richiedi una demo.",
  schemaDescription:
    'AI per agenzie assicurative, broker e intermediari che impara le regole dell’agenzia e non le dimentica: condizioni delle compagnie già in archivio, confronti e tabelle con la fonte sempre citata.',
  audience:
    'Agenzie assicurative, broker, intermediari e compagnie assicurative',
  paese: 'Italia',
  featureList: [
    'Condizioni delle compagnie già in archivio: DIP, DIP Aggiuntivo e Condizioni di Assicurazione',
    'Archivio dei documenti dell’agenzia, riservato e consultabile a fianco di quelli delle compagnie',
    'Confronto fra polizze e preventivi con la fonte citata su ogni valore',
    'Tabelle di analisi su decine di prodotti, con la fonte in ogni casella',
    'Valutazione secondo i criteri della singola agenzia, scritti in italiano',
    'Documenti per il cliente già impaginati in PDF, DOCX, XLSX e PPTX',
    'Agenti che ripetono il lavoro ricorrente su pianificazione',
    'Archivi raggiungibili anche dagli strumenti AI già in uso',
    'Memoria persistente di regole, prassi e casistica dell’agenzia: spiegate una volta, ricordate in ogni conversazione, consultabili e cancellabili',
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
