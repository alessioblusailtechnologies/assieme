import { Id, IsoDateTime } from './comune';

/**
 * Fase 10 — l'Archivio Privato a cartelle.
 *
 * L'albero è libero: l'utente crea, rinomina, sposta e annida come vuole, e
 * non gli si chiede di configurare nessuno schema. Quello che il sistema fa
 * è **osservare** com'è organizzato l'archivio e scriverlo (`Convenzione`),
 * per poi usarlo quando deve collocare un documento nuovo e quando deve
 * cercare.
 *
 * Le etichette non muoiono, cambiano mestiere: la cartella dice **dove sta**
 * un documento (una sola), l'etichetta **com'è** (da rinnovare, urgente),
 * e resta trasversale. È la risposta all'obiezione con cui la Fase 2 aveva
 * scelto le etichette: due assi ortogonali, due strumenti.
 */

/**
 * Che cosa sono i *figli* di una cartella, per come li ha visti
 * l'osservazione. È l'unico posto in cui l'AI può creare una cartella da
 * sola: dove il livello ammette istanze nuove (un cliente nuovo, un anno
 * nuovo). Assente = cartella libera, e lì non crea mai niente.
 */
export type RuoloFigli = 'clienti' | 'anni' | 'compagnie' | 'rami' | 'tipologie' | 'prodotti';

export interface Cartella {
  id: Id;
  nome: string;
  /** Il percorso leggibile dalla radice: quello che l'utente vede e pronuncia. */
  percorso: string;
  parentId?: Id;
  /**
   * La riga che dice cosa ci va dentro. La scrive l'osservazione guardando i
   * documenti, e diventa dell'utente appena lui la tocca. È anche ciò che
   * l'AI legge per collocare: un artefatto, due usi.
   */
  descrizione?: string;
  descrizioneDaUtente: boolean;
  ruoloFigli?: RuoloFigli;
  clienteId?: Id;
  /** Documenti in questa cartella, senza le sottocartelle. */
  documenti: number;
  /** Documenti nel sottoalbero: è il numero che si mostra sull'albero. */
  documentiTotali: number;
  figli: Cartella[];
}

export interface AlberoCartelle {
  radici: Cartella[];
  /**
   * I documenti che nessuno è riuscito a collocare. Non è un errore: sono
   * pronti, cercabili e citabili come tutti gli altri, e stanno lì finché
   * qualcuno non li mette a posto. È la schermata che rende accettabile
   * un'AI che ogni tanto sbaglia.
   */
  daSistemare: number;
}

/**
 * Il cliente come entità, non più come testo libero.
 *
 * Sapere che al livello 1 dell'albero ci sono i clienti non dice che
 * «ROSSI M.» è la cartella «Rossi Mario»: è questa anagrafica, con la
 * normalizzazione e gli alias, a renderlo possibile.
 */
export interface Cliente {
  id: Id;
  nome: string;
  tipo: 'persona' | 'azienda';
  codiceFiscale?: string;
  partitaIva?: string;
  /** Le forme con cui compare nei documenti: si imparano usando il sistema. */
  alias: string[];
  documenti: number;
  /** La sua cartella: l'aggancio è l'id, quindi rinominarla non rompe niente. */
  cartellaId?: Id;
}

/**
 * Come è organizzato questo archivio, **osservato e non configurato**.
 *
 * In Impostazioni non è un modulo da compilare ma una frase da confermare o
 * correggere. La correzione umana vince sempre; svuotarla restituisce la
 * parola all'osservazione.
 */
export interface Convenzione {
  /** Quello che il sistema ha capito guardando l'albero. */
  testo: string;
  testoUtente?: string;
  /** Quella che vale, ed è quella che va al modello. */
  effettiva: string;
  calcolataIl?: IsoDateTime;
  daRicalcolare: boolean;
}
