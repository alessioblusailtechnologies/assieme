/**
 * Impostazione: prima che cosa c'è, con un nome e una riga ciascuno; poi tre
 * approfondimenti solo sui differenziali veri. Non un modulo per paragrafo:
 * la mappa dei moduli serve a chi costruisce il prodotto, non a chi valuta
 * se comprarlo.
 */

import type { Blocco, Chiusura, Griglia, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'La piattaforma AI per il lavoro di agenzia',
  description:
    "Velia è l'intelligenza artificiale per agenzie, broker e intermediari assicurativi: interroga il mercato, confronta i prodotti, prepara proposte con il tuo marchio e automatizza il lavoro che si ripete, con la fonte sotto ogni risposta.",
};

const testata: Testata = {
  eyebrow: 'Piattaforma',
  title: "Tutta l'agenzia, una sola intelligenza",
  lead: 'Interroga il mercato, confronta i prodotti, prepara le proposte, sorveglia le novità. Velia mette il lavoro di giorni in una conversazione, con il metodo della tua agenzia e la fonte sotto ogni risposta.',
  cta: { label: 'Richiedi una demo', link: { rotta: 'demo' } },
};

const briciola = 'Piattaforma';

const griglia: Griglia = {
  title: 'Che cosa trovi dentro',
  lead: 'Dieci strumenti che si passano il lavoro fra loro e parlano la lingua del mestiere, non quella dei software.',
  cards: [
    {
      id: 'archivio-pubblico',
      title: 'Archivio pubblico',
      body: 'Il mercato assicurativo italiano è già dentro, ordinato e aggiornato. Il primo giorno fai domande, non caricamenti.',
    },
    {
      id: 'archivio-privato',
      title: 'Il tuo archivio',
      body: "Quello che entra in agenzia trova posto da solo. E da quel momento risponde, ogni volta che lo chiami in causa.",
    },
    {
      id: 'confronto',
      title: 'Confronto',
      body: 'Due prodotti, una domanda: che cosa cambia davvero. La risposta arriva in secondi, non in pomeriggi.',
    },
    {
      id: 'tabelle',
      title: 'Tabelle',
      body: 'Decine di prodotti letti in parallelo, i criteri che scegli tu, la fonte in ogni singola casella.',
    },
    {
      id: 'istruzioni',
      title: 'Metodo',
      body: "Velia valuta con i criteri della tua agenzia, non con criteri decisi in fabbrica.",
    },
    {
      id: 'documenti',
      title: 'Documenti',
      body: 'Quello che esce è già impaginato con il tuo marchio, pronto da mandare al cliente.',
    },
    {
      id: 'canali',
      title: 'Canali',
      body: 'Il preventivo che arriva su WhatsApp o per email entra in archivio da solo. E la proposta riparte da lì, quando decidi tu.',
    },
    {
      id: 'agenti',
      title: 'Agenti',
      body: 'Il lavoro che si ripete lo descrivi una volta, in italiano. Poi lo ritrovi fatto.',
    },
    {
      id: 'ecosistema',
      title: 'Ecosistema',
      body: 'Velia ti raggiunge negli strumenti che già usi ogni giorno, senza farti cambiare abitudini.',
    },
    {
      id: 'memoria',
      title: 'Ricorda',
      body: "Ogni settimana di lavoro la rende più precisa. E quello che impara resta dell'agenzia.",
    },
  ],
};

const archivio: Blocco = {
  eyebrow: 'Archivio pubblico',
  title: 'Non parti mai da zero',
  rows: [
    {
      term: 'Già pronto',
      detail: 'I prodotti delle principali compagnie italiane, caricati e mantenuti da noi',
    },
    {
      term: 'Ordinato',
      detail: 'Compagnie, rami, prodotti ed edizioni, con la versione in corso in evidenza',
    },
    {
      term: 'Aggiornato',
      detail: 'Ce ne occupiamo noi. Se manca qualcosa lo segnali con un clic',
    },
  ],
  paragrafi: [
    'Gli strumenti generici nascono vuoti: prima di darti una mano vanno riempiti, istruiti e mantenuti, agenzia per agenzia. Velia arriva piena: conosce i prodotti sul mercato, le loro edizioni e le loro condizioni, e li tiene aggiornati per te.',
    'Tu aggiungi solo quello che è tuo: il preventivo che il cliente ha portato stamattina, la polizza da rinnovare. E se è arrivato su WhatsApp o per email, entra da solo.',
  ],
  azione: {
    label: 'Chiedi quali compagnie sono già coperte',
    link: { rotta: 'demo' },
  },
};

const metodo: Blocco = {
  eyebrow: 'Metodo',
  title: 'Nessuno valuta una garanzia come la valuti tu',
  rows: [
    {
      term: 'Lo scrivi',
      detail: 'In italiano, come lo spiegheresti a un collega nuovo',
    },
    {
      term: 'Vale sempre',
      detail: "Per tutta l'agenzia, in ogni conversazione, senza doverlo ripetere",
    },
    {
      term: 'Resta onesto',
      detail: 'Cambia il giudizio, mai i fatti: la fonte va citata comunque',
    },
  ],
  paragrafi: [
    "Il caso è sempre lo stesso. Un comparatore segnala come carenza grave l'assenza della garanzia infortuni del conducente. Ma tu quella garanzia la copri da sempre con una polizza a parte: quella segnalazione, per te, è rumore.",
    'A Velia lo dici una volta. È la differenza fra uno strumento che applica i propri criteri e uno che applica i tuoi.',
  ],
};

const ecosistema: Blocco = {
  eyebrow: 'Ecosistema e agenti',
  title: 'Lavora anche quando non lo stai guardando',
  rows: [
    {
      term: 'Dove sei',
      detail: 'I tuoi archivi raggiungibili dagli strumenti AI che già usi ogni giorno',
    },
    {
      term: 'Quando vuoi',
      detail: 'Un compito descritto una volta, ripetuto ogni giorno, settimana o mese',
    },
    {
      term: 'Con le stesse regole',
      detail: "Il metodo dell'agenzia e la citazione della fonte valgono anche qui",
    },
  ],
  paragrafi: [
    'Alcune cose non vale la pena rifarle a mano: controllare se è uscita una nuova edizione, rileggere ogni lunedì quello che è entrato in archivio. Le descrivi una volta e Velia le fa da solo.',
    "E se lo strumento AI che usi tutti i giorni è un altro, non serve cambiarlo: i tuoi archivi li raggiungi anche da lì. Con un'avvertenza che preferiamo dire subito: fuori da Velia valgono le regole di quel programma, non le tue.",
  ],
};

const chiusura: Chiusura = {
  title: 'Vuoi vederla lavorare su un tuo preventivo?',
  cta: 'Richiedi una demo',
  link: { rotta: 'demo' },
};

const piattaforma = {
  meta,
  testata,
  briciola,
  griglia,
  archivio,
  metodo,
  ecosistema,
  chiusura,
};

export default piattaforma;
