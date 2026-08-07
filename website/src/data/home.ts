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
 * Sostanza allineata a «VELIA — Analisi dei Requisiti» v0.8 (03/08/2026).
 *
 * ⚠️ Da sostituire prima della pubblicazione: i loghi cliente nei due nastri.
 */

export const hero = {
  title: ["L'AI che impara", 'come lavora la tua agenzia.', 'E non lo dimentica.'],
  lead: "Velia è l'intelligenza artificiale per la distribuzione assicurativa: legge i set informativi, confronta le garanzie con la fonte citata — e ricorda le tue regole, da una conversazione all'altra.",
} as const;

export const statement = {
  strong: 'Le AI generiche ripartono da zero a ogni conversazione. Velia no.',
  muted:
    "Lavora sui documenti che hai già in archivio, ragiona con i criteri della tua agenzia e lascia sempre a te l'ultima parola.",
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
    "9 differenze rilevanti su 54 garanzie. Gli infortuni del conducente non risultano carenza: gliel'hai spiegato una volta — la tua agenzia li copre a parte.",
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
  title: 'Ecco cosa significa non dimenticare',
  body: 'Le cartelle condivise conservano e basta: non collegano, non ricordano, non rispondono. In Velia ogni documento letto entra in qualcosa che cresce — le regole che le detti, le scelte che ti vede fare, i casi che avete già risolto insieme. Il lunedì sa quello che le hai spiegato il venerdì.',
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
  'Proposte pronte per il cliente',
] as const;

/* -------------------------------------------------------------------------
 * Dal campo — non più una citazione firmata: il prodotto ha una sola
 * agenzia pilota e nessuna frase autorizzata, quindi la storia è raccontata
 * in terza persona, senza virgolette né firma da inventare.
 * ---------------------------------------------------------------------- */

export const testimonial = {
  quote:
    "Un'agenzia pilota ci ha spiegato una volta sola, in italiano, che gli infortuni del conducente li copre sempre con una polizza a parte. Da allora Velia non li segnala più come carenza: ragiona come ragionano loro.",
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
    title: 'Dieci prodotti, una tabella, ogni casella con la sua fonte',
    href: '/clienti#tabella-analisi',
  },
  {
    title: 'Le nuove edizioni ti trovano loro — non il contrario',
    href: '/clienti#agente-edizioni',
  },
] as const;

/* -------------------------------------------------------------------------
 * Numeri — non adozione (il prodotto è pre-lancio) ma scelte di progetto.
 * ---------------------------------------------------------------------- */

export const statsIntro = ['Meno tempo sui documenti,', 'più tempo con i clienti'];

export const stats = [
  { label: 'Documenti da caricare per iniziare', value: 'Zero' },
  { label: 'Volte che devi ripetere una regola', value: 'Una' },
  { label: 'Risposte con la fonte citata', value: '100%' },
  { label: 'Documenti in un solo confronto — gli altri si fermano a 5', value: 'Decine' },
  { label: 'Compagnie già in archivio', value: 'In crescita' },
] as const;

/* -------------------------------------------------------------------------
 * Sicurezza — sulla home basta una promessa breve; il dettaglio sta su
 * /sicurezza.
 * ---------------------------------------------------------------------- */

export const security = {
  title: ['Accuratezza e riservatezza,', 'prima di ogni altra cosa'],
  body: "Velia cita sempre da dove arriva una risposta — e quando non lo sa, lo dice. I tuoi documenti restano tuoi e quello che impara resta dell'agenzia: non esce, non finisce ad altri clienti, non addestra nessun modello.",
  /* La memoria apre la fila: è il cuore dell'angolo narrativo della pagina. */
  badges: [
    { mark: 'Memoria', name: 'Che controlli tu', href: '/sicurezza#memoria' },
    { mark: 'Fonte', name: 'Ogni risposta citata', href: '/sicurezza#citazione' },
    { mark: 'Non so', name: 'Mai una risposta inventata', href: '/sicurezza#non-copertura' },
    { mark: 'Solo tuoi', name: 'Documenti riservati', href: '/sicurezza#isolamento' },
    { mark: 'GDPR', name: 'Trattamento conforme', href: '/sicurezza#gdpr' },
    { mark: 'Tracce', name: 'Fonti sempre tracciate', href: '/sicurezza#tracciabilita' },
  ],
} as const;
