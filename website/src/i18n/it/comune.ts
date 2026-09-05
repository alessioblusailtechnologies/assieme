/**
 * Tutto ciò che compare su ogni pagina: testata, piè di pagina, barra
 * annunci, etichette di interfaccia.
 *
 * I percorsi non si scrivono qui: si dichiara la rotta, e l'ancora quando
 * serve, perché anche le ancore si traducono insieme al titolo di sezione
 * che nominano.
 */

import { STATUS_URL, site } from '~/config/site';
import type { ColonnaFooter, VoceNav } from '~/i18n/tipi';

const nav: VoceNav[] = [
  { label: 'Piattaforma', link: { rotta: 'piattaforma' } },
  { label: 'Soluzioni', link: { rotta: 'soluzioni' } },
  { label: 'Clienti', link: { rotta: 'clienti' } },
  { label: 'Sicurezza', link: { rotta: 'sicurezza' } },
  { label: 'Risorse', link: { rotta: 'risorse' } },
  { label: 'Azienda', link: { rotta: 'azienda' } },
];

const footer: ColonnaFooter[] = [
  {
    title: 'Piattaforma',
    items: [
      { label: 'Archivio pubblico', link: { rotta: 'piattaforma', ancora: 'archivio-pubblico' } },
      { label: 'Il tuo archivio', link: { rotta: 'piattaforma', ancora: 'archivio-privato' } },
      { label: 'Confronti e tabelle', link: { rotta: 'piattaforma', ancora: 'confronto' } },
      { label: 'Agenti', link: { rotta: 'piattaforma', ancora: 'agenti' } },
    ],
  },
  {
    title: 'Soluzioni',
    items: [
      { label: 'Agenzie', link: { rotta: 'soluzioni', ancora: 'agenzie' } },
      { label: 'Broker', link: { rotta: 'soluzioni', ancora: 'broker' } },
      { label: 'Intermediari', link: { rotta: 'soluzioni', ancora: 'intermediari' } },
      { label: 'Compagnie', link: { rotta: 'soluzioni', ancora: 'compagnie' } },
    ],
  },
  {
    title: 'Azienda',
    items: [
      { label: 'Chi siamo', link: { rotta: 'azienda' } },
      { label: 'Clienti', link: { rotta: 'clienti' } },
      { label: 'Sicurezza', link: { rotta: 'sicurezza' } },
      { label: 'Lavora con noi', link: { rotta: 'azienda', ancora: 'lavora-con-noi' } },
    ],
  },
  {
    title: 'Risorse',
    items: [
      { label: 'Guide', link: { rotta: 'risorse', ancora: 'guide' } },
      { label: 'Glossario', link: { rotta: 'risorse', ancora: 'glossario' } },
      { label: 'Assistenza', link: { rotta: 'risorse', ancora: 'assistenza' } },
      // La pagina di stato compare solo quando il sottodominio esiste:
      // un link che non risolve è un link rotto, per le persone e per gli audit.
      ...(STATUS_URL
        ? [{ label: 'Stato del servizio', link: { esterno: STATUS_URL } }]
        : []),
    ],
  },
  {
    title: 'Seguici',
    items: [
      { label: 'LinkedIn', link: { esterno: site.social.linkedin } },
      { label: 'Facebook', link: { esterno: site.social.facebook } },
      { label: 'Instagram', link: { esterno: site.social.instagram } },
    ],
  },
];

const legale: VoceNav[] = [
  { label: 'Privacy', link: { rotta: 'privacy' } },
  { label: 'Cookie', link: { rotta: 'cookie' } },
  { label: 'Note legali', link: { rotta: 'noteLegali' } },
];

const annunci: { label: string; text: string }[] = [
  {
    label: 'Novità',
    text: 'Tabelle di analisi: decine di prodotti a confronto, la fonte in ogni casella',
  },
  {
    label: 'Novità',
    text: 'I tuoi archivi ora parlano anche con gli strumenti AI che già usi',
  },
  {
    label: 'Novità',
    text: 'Documenti per il cliente già impaginati, col tuo marchio',
  },
];

const comune = {
  /** Il marchio in testata è anche il saluto: non si traduce come un nome. */
  saluto: 'Ciao, sono Velia.',
  tornaAllaHome: 'Velia, torna alla home',
  tagline: 'AI per la distribuzione assicurativa',

  nav,
  navEtichetta: 'Navigazione principale',
  navEtichettaCompatta: 'Navigazione principale, versione compatta',
  apriMenu: 'Apri il menu',
  accedi: 'Accedi',
  demo: 'Richiedi una demo',
  vaiAlContenuto: 'Vai al contenuto principale',

  footer,
  legale,
  dirittiRiservati: 'Tutti i diritti riservati',
  nuovaScheda: ' (si apre in una nuova scheda)',

  annunci,
  annunciEtichetta: 'Novità dal prodotto',

  briciole: {
    home: 'Home',
    etichetta: 'Percorso di navigazione',
  },

  selettoreLingua: 'Lingua del sito',

  chiusuraPredefinita: {
    title: 'Spiegale come lavori. Una volta sola.',
    cta: 'Richiedi una demo',
  },
};

export default comune;
