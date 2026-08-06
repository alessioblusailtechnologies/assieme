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
 * Sostanza allineata a «ASSIEME — Analisi dei Requisiti» v0.8 (03/08/2026).
 *
 * ⚠️ Da sostituire prima della pubblicazione: `testimonial` (il prodotto ha
 * un'unica agenzia pilota) e i loghi cliente nei due nastri.
 */

export const hero = {
  title: ['La consulenza,', "fatta a regola d'arte"],
  lead: 'Le agenzie, i broker e gli intermediari più esigenti usano Assieme per leggere i documenti, confrontare le condizioni e rispondere ai clienti con la fonte sempre citata.',
} as const;

export const statement = {
  strong:
    "Assieme è l'intelligenza artificiale pensata per la distribuzione assicurativa.",
  muted:
    "Lavora sui documenti che hai già, ragiona con i criteri della tua agenzia e lascia a te l'ultima parola.",
} as const;

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
  breadcrumb: 'Fascicolo / Rinnovo auto — cliente Rossi',
  title: 'Ramo auto — la polizza in corso e il preventivo a confronto',
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
    '9 differenze rilevanti su 54 garanzie. Gli infortuni del conducente non risultano carenza: la tua agenzia li copre a parte.',
  citations: ['autopiu_cda.pdf · art. 12 p. 34', 'preventivo_unipol.pdf · sez. 3 p. 2'],
};

/* -------------------------------------------------------------------------
 * Memoria viva — il differenziale, raccontato come vantaggio e non come
 * architettura: le regole che detti, quello che impara, i documenti di
 * riferimento sempre a portata.
 *
 * Il contrasto con la cartella condivisa non è retorico: è esattamente da
 * lì che i documenti arrivano oggi, ed è il paragone che il lettore fa da sé.
 * ---------------------------------------------------------------------- */

export const memory = {
  eyebrow: 'Memoria viva',
  title: 'Un archivio che risponde invece di aspettare',
  body: 'Le cartelle condivise conservano. Non collegano, non ricordano, non rispondono. Qui ogni documento letto entra a far parte di qualcosa che cresce: le regole che gli detti, le scelte che ti vede fare, la casistica che avete già risolto.',
  rows: [
    {
      term: 'Le tue regole',
      detail:
        'Scrivi in italiano come valuta la tua agenzia. Vale da subito, per tutti i colleghi',
    },
    {
      term: 'Quello che impara',
      detail:
        'Prassi, pratiche ricorrenti e preferenze: non devi ripeterle a ogni conversazione',
    },
    {
      term: 'Sempre tuo',
      detail:
        'Consulti, correggi e cancelli quello che ha imparato. Le tue regole vengono prima',
    },
  ],
} as const;

/* -------------------------------------------------------------------------
 * Ticker — sette voci, quante ne prevede l'animazione.
 *
 * Nomi del lavoro, non del software. Solo attività del perimetro di prima
 * release: rinnovi, sinistri e scadenze sono fuori (§5.5).
 * ---------------------------------------------------------------------- */

export const useCases = [
  'Confronto polizze',
  'Analisi delle garanzie',
  'Lettura dei capitolati',
  'Verifica dei preventivi',
  'Ricerca fra le condizioni',
  'Archivio documentale',
  'Proposte per il cliente',
] as const;

/* -------------------------------------------------------------------------
 * Testimonianza — ⚠️ segnaposto: una sola agenzia pilota, nessuna
 * citazione ancora autorizzata.
 * ---------------------------------------------------------------------- */

export const testimonial = {
  quote:
    "«Gli altri strumenti ci segnalavano come carenza una garanzia che noi copriamo da sempre a parte. Ad Assieme l'abbiamo spiegato una volta, in italiano, e da allora ragiona come ragioniamo noi.»",
  name: 'Nome Cognome',
  role: 'Titolare',
  company: 'Agenzia pilota',
  href: '/clienti',
} as const;

/* -------------------------------------------------------------------------
 * Dimostrazioni — non storie cliente: il prodotto non è ancora in adozione
 * ---------------------------------------------------------------------- */

export const stories = [
  {
    title: 'Un preventivo concorrente smontato in dieci minuti',
    href: '/clienti#confronto-auto',
  },
  {
    title: 'Dieci prodotti a confronto in una tabella sola',
    href: '/clienti#tabella-analisi',
  },
  {
    title: 'Le nuove edizioni segnalate senza andarle a cercare',
    href: '/clienti#agente-edizioni',
  },
] as const;

/* -------------------------------------------------------------------------
 * Numeri — non adozione (il prodotto è pre-lancio) ma scelte di progetto.
 * ---------------------------------------------------------------------- */

export const statsIntro = ['Meno tempo sui documenti,', 'più tempo sui clienti'];

export const stats = [
  { label: 'Documenti da caricare per cominciare', value: '0' },
  { label: 'Risposte con la fonte citata', value: '100%' },
  { label: 'Formati per i documenti al cliente', value: '4' },
  { label: 'Documenti a confronto, contro i 5 degli altri', value: 'Decine' },
  { label: 'Compagnie già in archivio', value: 'In crescita' },
] as const;

/* -------------------------------------------------------------------------
 * Sicurezza — sulla home basta una promessa breve; il dettaglio sta su
 * /sicurezza.
 * ---------------------------------------------------------------------- */

export const security = {
  title: ['Accuratezza e riservatezza,', 'prima di ogni altra cosa'],
  body: "Assieme cita sempre da dove viene una risposta e dice quando non lo sa. I tuoi documenti restano tuoi: non escono dall'agenzia, non finiscono in mano ad altri clienti, non addestrano nulla.",
  badges: [
    { mark: 'Fonte', name: 'Ogni risposta citata', href: '/sicurezza#citazione' },
    { mark: 'Non so', name: 'Mai una risposta inventata', href: '/sicurezza#non-copertura' },
    { mark: 'Solo tuoi', name: 'Documenti riservati', href: '/sicurezza#isolamento' },
    { mark: 'GDPR', name: 'Trattamento conforme', href: '/sicurezza#gdpr' },
    { mark: 'Tracce', name: 'Fonti sempre tracciate', href: '/sicurezza#tracciabilita' },
    { mark: 'Memoria', name: 'Che controlli tu', href: '/sicurezza#memoria' },
  ],
} as const;
