/**
 * Tipi trasversali del dominio.
 *
 * Questo file e i suoi vicini **sono il contratto verso il backend**: ogni
 * modifica qui è una modifica di specifica, non un dettaglio di
 * implementazione del front-end.
 */

export type Id = string;

/** Data e ora in ISO 8601 con fuso, es. `2026-08-04T10:30:00+02:00`. */
export type IsoDateTime = string;

/** Data senza orario in ISO 8601, es. `2026-08-04`. */
export type IsoDate = string;

/**
 * Risposta paginata. Uniforme per tutti gli elenchi: chi scrive il ventesimo
 * elenco non deve chiedersi come si chiama il campo del totale.
 */
export interface Paginato<T> {
  elementi: T[];
  totale: number;
  pagina: number;
  perPagina: number;
}

/**
 * Un valore estratto da un documento — o la dichiarazione esplicita che non
 * c'è.
 *
 * **È il tipo più importante del contratto.** RF-C-08 e RF-C-12 impongono che
 * il sistema dichiari quando un'informazione non è supportata dai documenti,
 * invece di produrre contenuto non verificabile. Nel dominio assicurativo
 * un'informazione errata su una garanzia ha impatto diretto sul lavoro
 * dell'intermediario: "non presente" è un'informazione preziosa quanto un
 * valore, non un caso d'errore.
 *
 * Modellarlo come unione discriminata rende impossibile leggere un valore
 * senza aver prima gestito l'assenza — il compilatore non lascia scampo, e
 * nessuno può dimenticarsene per distrazione in una schermata su venti.
 *
 * Il secondo parametro dice quanto pesa la citazione: `CitazioneBreve` dove
 * il riferimento si legge e basta (elenchi, esiti degli agenti), `Citazione`
 * completa dove dal valore si deve aprire il documento sul passaggio — è il
 * caso delle celle della tabella di analisi (RF-C-12 insieme a RF-C-05).
 */
export type ValoreEstratto<T = string, C = CitazioneBreve> =
  | { esito: 'presente'; valore: T; citazioni: C[] }
  | { esito: 'non-presente'; nota?: string }
  | { esito: 'non-determinabile'; motivo: string };

/**
 * Riferimento compatto a una citazione, usato dove la citazione completa
 * sarebbe sovrabbondante (celle di tabella, elenchi). La forma estesa vive in
 * `citazione.ts`.
 */
export interface CitazioneBreve {
  documentoId: Id;
  /** Etichetta già pronta per l'interfaccia, es. `DIP Agg. — art. 12, p. 8`. */
  riferimento: string;
}

/**
 * Da dove viene ciò che l'AI ha detto, oltre ai documenti citati.
 *
 * Tre requisiti distinti chiedono di renderlo riconoscibile all'utente:
 * RF-D-05 (risposta influenzata da una regola del tenant), RF-D-15 (risposta
 * che attinge a un documento di riferimento), RF-G-03 (risposta fondata su un
 * ricordo). Formano il DNA d'Agenzia: se l'utente non li vede all'opera, la
 * personalizzazione resta invisibile e il differenziale del prodotto non si
 * percepisce.
 *
 * I tre non sono intercambiabili, ed è il motivo per cui restano segnali
 * distinti: una **regola** cambia il giudizio, un **documento di
 * riferimento** fornisce una fonte citabile, un **ricordo** è un'inferenza
 * fallibile che cede il passo alle regole (RF-G-04).
 */
export interface Provenienza {
  tipo: 'regola' | 'documento-riferimento' | 'memoria';
  /** Id della regola, del documento di riferimento o del ricordo. */
  origineId: Id;
  /** Testo breve da mostrare, es. `valutato secondo la regola "Infortuni conducente"`. */
  etichetta: string;
}

/** Errore applicativo normalizzato, così com'è esposto dall'API. */
export interface ErroreApi {
  codice: string;
  messaggio: string;
  /** Presente sui 429: quando ritentare. */
  ritentaTraSecondi?: number;
  dettagli?: Record<string, string>;
}
