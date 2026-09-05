import type { Chiusura, MetaPagina, Riga, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Risorse',
  description:
    'Guide sulla lettura dei set informativi, glossario dei termini che tornano ogni giorno nei documenti assicurativi e canali di assistenza.',
};

const testata: Testata = {
  eyebrow: 'Risorse',
  title: 'Materiali di lavoro, non brochure',
  lead: "Quello che pubblichiamo nasce dalle domande che ci arrivano dalle agenzie. Se una guida non ti fa risparmiare tempo il giorno stesso, non l'abbiamo scritta bene.",
};

const briciola = 'Risorse';

const guide: { id: string; title: string; lead: string; linkLabel: string } = {
  id: 'guide',
  title: 'Guide',
  lead: "Pagine che valgono per anni, non per una settimana: il metodo di lavoro, la lettura dei documenti, l'AI in agenzia. Si leggono fra un appuntamento e l'altro.",
  linkLabel: 'Leggi la guida',
};

/* Glossario del mestiere, non del software: sono le parole che ricorrono
   nelle domande dei clienti e nei documenti che si leggono ogni giorno.
   Le uniche due voci di prodotto sono quelle che il sito usa davvero. */
const glossario: { id: string; title: string; lead: string; voci: Riga[] } = {
  id: 'glossario',
  title: 'Glossario',
  lead: 'Le parole che tornano ogni giorno nei documenti e nelle domande dei clienti, comprese quelle che vengono scambiate per sinonimi e non lo sono.',
  voci: [
    {
      term: 'Set informativo',
      detail:
        "I documenti che ogni compagnia deve pubblicare per legge su ciascun prodotto: DIP, DIP Aggiuntivo, Condizioni di Assicurazione e glossario. È il pacchetto che il cliente ha diritto di ricevere prima di firmare.",
    },
    {
      term: 'DIP e DIP Aggiuntivo',
      detail:
        "Il Documento Informativo Precontrattuale in due versioni. Il primo è sintetico e uguale per tutti; il secondo è dove stanno davvero esclusioni, limitazioni e condizioni operative, ed è quello che quasi nessuno legge fino in fondo.",
    },
    {
      term: 'Franchigia e scoperto',
      detail:
        "Due modi diversi di lasciare una parte del danno a carico dell'assicurato: la franchigia è un importo fisso, lo scoperto una percentuale. Vengono usati come sinonimi di continuo, e non lo sono.",
    },
    {
      term: 'Massimale',
      detail:
        "Il tetto oltre il quale la compagnia non paga. Può essere unico per sinistro, per anno o distinto per singola garanzia: due polizze con lo stesso numero in copertina possono comportarsi in modo molto diverso.",
    },
    {
      term: 'Retroattività',
      detail:
        "Nelle coperture claims made, quanto indietro nel tempo la polizza copre fatti avvenuti prima della firma. Illimitata o limitata a pochi anni: è una delle differenze che pesano di più e si vedono di meno.",
    },
    {
      term: 'Claims made',
      detail:
        "La copertura opera in base alla data in cui arriva la richiesta di risarcimento, non a quella del fatto. È il regime che rende decisiva la retroattività, e il motivo per cui cambiare compagnia va valutato con attenzione.",
    },
    {
      term: 'Esclusioni',
      detail:
        "Ciò che la polizza non copre. Stanno in fondo, spesso in un articolo unico, e sono il punto in cui due prodotti apparentemente identici smettono di esserlo.",
    },
    {
      term: 'Adeguatezza',
      detail:
        "La verifica che il contratto proposto risponda alle esigenze del cliente, con l'obbligo per l'intermediario di motivarla e di poterla ricostruire anche a distanza di anni.",
    },
    {
      term: 'Archivio pubblico',
      detail:
        "L'archivio delle condizioni delle compagnie che trovi già dentro Velia al primo accesso. Non devi caricarlo tu: c'è.",
    },
    {
      term: 'Memoria viva',
      detail:
        "Come chiamiamo l'insieme di quello che rende Velia diverso per ogni studio: le regole che gli detti, quello che impara lavorando con te e la casistica che avete già risolto. A differenza di una cartella condivisa, cresce e risponde.",
    },
  ],
};

const assistenza: { id: string; title: string; body: string; stato: string } = {
  id: 'assistenza',
  title: 'Assistenza',
  body: 'Siamo una squadra piccola e concentrata sulla qualità: poche cose, seguite bene, fino in fondo. Scriviamo e rispondiamo in italiano, entro il giorno lavorativo successivo.',
  stato: 'Stato del servizio',
};

const chiusura: Chiusura = {
  title: 'Preferisci vederlo dal vivo?',
  cta: 'Richiedi una demo',
  link: { rotta: 'demo' },
};

const risorse = {
  meta,
  testata,
  briciola,
  guide,
  glossario,
  assistenza,
  chiusura,
};

export default risorse;
