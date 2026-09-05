/**
 * Niente automazioni su rinnovi, retention, sinistri o scadenzari: sono
 * esplicitamente fuori dal perimetro della prima release (§5.5).
 */

import type { Blocco, Chiusura, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Soluzioni AI per agenzie, broker, intermediari e compagnie',
  description:
    "Velia adatta la sua intelligenza artificiale al mestiere assicurativo: risposte immediate per l'agenzia, confronti su larga scala per il broker, autonomia per gli intermediari e visibilità sulla rete per le compagnie.",
};

const testata: Testata = {
  eyebrow: 'Soluzioni',
  title: 'Lo stesso strumento, quattro mestieri diversi',
  lead: "Un'agenzia monomandataria, un broker con quaranta compagnie in portafoglio e una direzione tecnica non chiedono le stesse cose. Velia si adatta al mestiere, non il contrario.",
};

const briciola = 'Soluzioni';

const agenzie: Blocco = {
  id: 'agenzie',
  eyebrow: 'Agenzie',
  title: 'Rispondi al cliente mentre è ancora lì davanti',
  rows: [
    { term: 'Subito', detail: 'I prodotti che collochi sono già dentro: si comincia dalla prima domanda' },
    { term: 'A fianco', detail: 'Il preventivo che il cliente porta da un concorrente, smontato accanto alle tue condizioni' },
    { term: 'A modo tuo', detail: "Le convenzioni e i testi dell'agenzia diventano il modo in cui Velia ragiona" },
  ],
  paragrafi: [
    'In agenzia il tempo non se ne va sulle decisioni difficili: se ne va a ritrovare, ricontrollare e ricopiare. Velia si prende quella parte, e a te lascia il cliente.',
  ],
};

const broker: Blocco = {
  id: 'broker',
  eyebrow: 'Broker',
  title: "L'intero mercato in un confronto solo",
  rows: [
    { term: 'Scala', detail: 'Decine di prodotti in una tabella sola, dove gli altri si fermano a cinque' },
    { term: 'Criteri', detail: 'Massimali, franchigie, scoperti ed esclusioni, o le colonne che scrivi tu' },
    { term: 'Consegna', detail: "Lo stesso lavoro esce come documento con il marchio dell'agenzia" },
  ],
  paragrafi: [
    "Il valore del broker sta nel leggere quello che una tabella comparativa non mostra: una retroattività ridotta, un'esclusione aggiunta in coda, uno scoperto che cambia natura al danno.",
    'Velia fa il lavoro meccanico su una scala che a mano non affronteresti. Quello che conta lo decidi comunque tu, ma partendo da un tavolo già apparecchiato.',
  ],
};

const intermediari: Blocco = {
  id: 'intermediari',
  eyebrow: 'Intermediari',
  title: 'Struttura da studio grande, senza il reparto tecnico',
  rows: [
    { term: 'Avvio', detail: 'Nessun progetto di migrazione: si comincia il primo giorno' },
    { term: 'Autonomia', detail: 'Si configura scrivendo in italiano, non programmando' },
    { term: 'Continuità', detail: 'Quello che lo studio ha imparato resta, anche quando cambia chi ci lavora' },
  ],
  paragrafi: [
    'Chi lavora in due o tre persone ha gli stessi obblighi e gli stessi clienti esigenti di una rete strutturata, senza la stessa macchina dietro. Quello che nelle grandi strutture è un manuale operativo, qui sono poche regole scritte una volta e applicate sempre.',
  ],
};

const compagnie: Blocco = {
  id: 'compagnie',
  eyebrow: 'Compagnie',
  title: 'I tuoi prodotti, visti con gli occhi della rete',
  rows: [
    { term: 'Rete', detail: 'Uno strumento comune per chi colloca i tuoi prodotti' },
    { term: 'Edizioni', detail: "La rete lavora sempre sull'edizione corretta, non su quella scaricata due anni fa" },
    { term: 'Segnale', detail: 'Le clausole che generano più domande emergono prima del contenzioso' },
  ],
  paragrafi: [
    "Una compagnia scrive i testi; la rete li interpreta. Fra le due cose c'è uno scarto che di solito si scopre in fase di liquidazione.",
  ],
};

const chiusura: Chiusura = {
  title: 'Non sei sicuro di quale configurazione ti serva?',
  cta: 'Parliamone in una demo',
  link: { rotta: 'demo' },
};

const soluzioni = {
  meta,
  testata,
  briciola,
  agenzie,
  broker,
  intermediari,
  compagnie,
  chiusura,
};

export default soluzioni;
