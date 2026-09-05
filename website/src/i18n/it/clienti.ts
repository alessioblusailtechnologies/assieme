/**
 * Il prodotto è sul mercato e in forte crescita: la pagina lo racconta senza
 * inventare numeri di adozione che non pubblichiamo. Le tre voci sono
 * dimostrazioni su documenti reali — la prima è il test case di riferimento
 * indicato nei requisiti (§5.3).
 */

import type { Destinazione } from '~/i18n/rotte';
import type { Chiusura, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Come si usa',
  description:
    'Tre dimostrazioni su documenti reali: confronto fra set informativo e preventivo nel ramo auto, tabelle di analisi multi-prodotto e agenti pianificati.',
};

const testata: Testata = {
  eyebrow: 'Come si usa',
  title: 'Tre dimostrazioni, su documenti veri',
  lead: 'Velia lavora ogni giorno in agenzie vere, su documenti veri, e ogni settimana se ne aggiungono di nuove. Invece di raccontartelo, preferiamo far vedere che cosa fa.',
};

const briciola = 'Come si usa';

const numeri: { title: string; lead: string } = {
  title: 'I numeri della piattaforma',
  lead: "Non promesse commerciali ma scelte di progetto: è così che è fatta la piattaforma. Ogni riga la puoi verificare in mezz'ora di demo.",
};

const dimostrazioni: {
  title: string;
  targhetta: string;
  azione: string;
  link: Destinazione;
  voci: {
    id: string;
    img: string;
    eyebrow: string;
    title: string;
    body: string;
    note: string;
  }[];
} = {
  title: 'Le dimostrazioni',
  targhetta: 'Dimostrazione',
  azione: 'Chiedi questa demo',
  link: { rotta: 'demo' },
  voci: [
    {
      id: 'confronto-auto',
      img: '/media/demo-confronto.jpg',
      eyebrow: 'Ramo auto',
      title: 'Un preventivo concorrente smontato in dieci minuti',
      body: "Il cliente arriva con un preventivo di un'altra compagnia. Lo carichi, e Velia lo mette accanto alle condizioni della polizza in corso, che sono già in archivio. Nove differenze che contano su cinquantaquattro garanzie, e per ognuna l'articolo da cui viene.",
      note: 'È il caso con cui le agenzie ci mettono alla prova più spesso.',
    },
    {
      id: 'tabella-analisi',
      img: '/media/demo-tabella.jpg',
      eyebrow: 'Tabelle',
      title: 'Dieci prodotti a confronto in una tabella sola',
      body: 'Quando i documenti sono troppi per leggerli uno a uno, diventano una tabella: i prodotti in riga, i criteri in colonna. Dove il dato nel documento non c\'è, la casella dice "non presente" invece di indovinare.',
      note: 'La tabella si interroga a voce e si esporta in foglio di calcolo.',
    },
    {
      id: 'agente-edizioni',
      img: '/media/demo-agenti.jpg',
      eyebrow: 'Agenti',
      title: 'Le nuove edizioni segnalate senza andarle a cercare',
      body: "«Avvisami quando esce una nuova edizione dei prodotti che colloco.» Lo scrivi una volta, scegli ogni quanto, e da lì in avanti te lo ritrovi fatto.",
      note: 'Vale lo stesso metodo della tua agenzia, e la fonte è citata comunque.',
    },
  ],
};

const adozione: {
  title: string;
  paragrafi: string[];
  azione: { label: string; link: Destinazione };
} = {
  title: "Un'adozione in forte crescita",
  paragrafi: [
    "Velia è sul mercato e l'adozione cresce in fretta. Chi entra adesso trova una piattaforma che migliora di settimana in settimana e un team che ascolta: le funzionalità migliori nascono dalle richieste di chi la usa ogni giorno.",
  ],
  azione: { label: 'Entra anche tu', link: { rotta: 'demo' } },
};

const chiusura: Chiusura = {
  title: 'Vuoi vederlo su un tuo preventivo?',
  cta: 'Richiedi una demo',
  link: { rotta: 'demo' },
};

const clienti = {
  meta,
  testata,
  briciola,
  numeri,
  dimostrazioni,
  adozione,
  chiusura,
};

export default clienti;
