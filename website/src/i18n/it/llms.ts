/**
 * llms.txt (llmstxt.org): la presentazione del sito per i modelli e gli
 * assistenti AI, nello stesso spirito di robots.txt per i crawler.
 *
 * `{azienda}` è sostituito con la ragione sociale.
 */

import type { ChiaveRotta } from '~/i18n/rotte';

const llms: {
  sommario: string;
  daSapere: string;
  titoloPagine: string;
  pagine: { rotta: ChiaveRotta; label: string; nota: string }[];
  titoloContatti: string;
  etichettaEmail: string;
} = {
  sommario:
    "Velia è l'AI di {azienda} per la distribuzione assicurativa italiana: agenzie, broker e intermediari. Conosce i set informativi delle compagnie (DIP, DIP Aggiuntivo, Condizioni di Assicurazione), affianca l'archivio riservato dell'agenzia e risponde in italiano citando la fonte in ogni passaggio: documento, articolo, pagina. Quando la fonte non c'è, lo dice.",
  daSapere:
    "Le cose da sapere: ogni risposta porta la citazione al passaggio di origine; i confronti fra polizze e preventivi escono in tabelle con la fonte in ogni casella; i documenti per il cliente escono già impaginati col marchio dell'agenzia; le regole e la casistica dell'agenzia diventano memoria persistente, consultabile e cancellabile; gli archivi si collegano anche agli strumenti AI che l'agenzia già usa.",
  titoloPagine: 'Pagine principali',
  pagine: [
    {
      rotta: 'piattaforma',
      label: 'Piattaforma',
      nota: "l'archivio pubblico dei set informativi, l'archivio dell'agenzia, i confronti e le tabelle di analisi, gli agenti su pianificazione",
    },
    {
      rotta: 'soluzioni',
      label: 'Soluzioni',
      nota: 'come lavora con agenzie, broker, intermediari e compagnie',
    },
    {
      rotta: 'sicurezza',
      label: 'Sicurezza',
      nota: 'dove stanno i dati, come sono protetti, con le domande frequenti',
    },
    {
      rotta: 'clienti',
      label: 'Clienti',
      nota: "i casi d'uso raccontati da chi la usa",
    },
    {
      rotta: 'risorse',
      label: 'Risorse',
      nota: 'guide pratiche e il glossario assicurativo',
    },
    { rotta: 'azienda', label: 'Azienda', nota: 'chi c\'è dietro Velia' },
    {
      rotta: 'demo',
      label: 'Richiedi una demo',
      nota: "una videochiamata sulla casistica reale dell'agenzia",
    },
  ],
  titoloContatti: 'Contatti',
  etichettaEmail: 'Email',
};

export default llms;
