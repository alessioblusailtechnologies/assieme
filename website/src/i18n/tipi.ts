/**
 * Le forme ricorrenti dei dizionari.
 *
 * Servono a due cose. La prima: dove un contenuto porta un percorso, il
 * dizionario dichiara una `Destinazione` e non una stringa, così i percorsi
 * restano tutti nella tabella delle rotte. La seconda: annotare gli export
 * dei dizionari con questi tipi impedisce a TypeScript di inferire tipi
 * letterali, che renderebbero il contratto del francese uguale al testo
 * italiano invece che alla sua struttura.
 */

import type { Destinazione } from './rotte';

/** Titolo e descrizione della pagina, per `<title>` e meta description. */
export type MetaPagina = {
  title: string;
  description: string;
};

/** Una voce di navigazione, in testata, nel footer o in un elenco. */
export type VoceNav = {
  label: string;
  link: Destinazione;
};

/** Una colonna del piè di pagina. */
export type ColonnaFooter = {
  title: string;
  items: VoceNav[];
};

/** La testata di una pagina interna: occhiello, titolo, attacco, azione. */
export type Testata = {
  eyebrow: string;
  title: string;
  lead?: string;
  cta?: { label: string; link: Destinazione };
};

/** Una scheda di `CardGrid`. */
export type Scheda = {
  id?: string;
  eyebrow?: string;
  title: string;
  body: string;
  link?: Destinazione;
  linkLabel?: string;
};

/** Una riga termine/dettaglio di `FeatureBlock`. */
export type Riga = {
  term: string;
  detail: string;
};

/**
 * Un blocco di approfondimento: le righe più i paragrafi che oggi stanno
 * nello slot del componente. In un sito multilingua la prosa non può restare
 * nel markup, quindi arriva da qui come elenco di capoversi.
 */
export type Blocco = {
  id?: string;
  eyebrow: string;
  title: string;
  rows: Riga[];
  paragrafi: string[];
  /** Il bottone nello slot `actions`, quando il blocco ne ha uno. */
  azione?: { label: string; link: Destinazione };
};

/** La griglia di schede con la sua intestazione. */
export type Griglia = {
  id?: string;
  title: string;
  lead?: string;
  cards: Scheda[];
};

/** La chiusura scura in fondo alle pagine interne. */
export type Chiusura = {
  title: string;
  cta: string;
  link: Destinazione;
};

/** Una voce del percorso di navigazione. */
export type Briciola = {
  label: string;
  link: Destinazione;
};
