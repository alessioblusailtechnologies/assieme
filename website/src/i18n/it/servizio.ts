/**
 * Le pagine di servizio: il ringraziamento dopo l'invio del modulo e la 404.
 * Nessuna delle due è indicizzata, ma tradotte lo devono essere lo stesso:
 * ci si arriva navigando, non cercando.
 */

import type { Destinazione } from '~/i18n/rotte';
import type { MetaPagina, Testata } from '~/i18n/tipi';

const grazie: {
  meta: MetaPagina;
  testata: Testata;
  notaPrima: string;
  notaDopo: string;
} = {
  meta: {
    title: 'Richiesta ricevuta',
    description:
      'La tua richiesta di demo è arrivata: ti rispondiamo entro il giorno lavorativo successivo.',
  },
  testata: {
    eyebrow: 'Demo',
    title: 'Richiesta ricevuta, ci sentiamo a breve',
    lead: "Ti rispondiamo entro il giorno lavorativo successivo per fissare la videochiamata. Se hai un capitolato da farci vedere, tienilo a portata di mano: è il modo più rapido per capire se Velia ti serve.",
    cta: { label: 'Torna alla piattaforma', link: { rotta: 'piattaforma' } },
  },
  notaPrima: 'Non ricevi nostre notizie entro un giorno lavorativo? Scrivici direttamente a ',
  notaDopo: '.',
};

const nonTrovata: {
  meta: MetaPagina;
  eyebrow: string;
  title: string;
  lead: string;
  navEtichetta: string;
  home: string;
  cta: { label: string; link: Destinazione };
} = {
  meta: {
    title: 'Pagina non trovata',
    description:
      'La pagina che cercavi non esiste o è stata spostata. Torna alla home di Velia oppure raggiungi la piattaforma, le soluzioni e la sicurezza.',
  },
  eyebrow: 'Errore 404',
  title: 'Questa pagina non risulta in archivio',
  lead: "Il collegamento potrebbe essere vecchio, oppure l'indirizzo contiene un refuso. Da qui puoi ripartire.",
  navEtichetta: 'Sezioni del sito',
  home: 'Home',
  cta: { label: 'Richiedi una demo', link: { rotta: 'demo' } },
};

const servizio = { grazie, nonTrovata };

export default servizio;
