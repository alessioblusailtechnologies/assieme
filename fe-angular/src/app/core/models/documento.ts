import { Id, IsoDate, IsoDateTime } from './comune';

/**
 * Documenti dei due archivi.
 *
 * Pubblico e privato hanno metadati diversi ma vivono fianco a fianco: nel
 * selettore `@` della chat (RF-C-02) e nelle righe di una tabella di analisi
 * (RF-C-11) compaiono mescolati. Da qui l'unione discriminata su `archivio`:
 * una sola lista, due forme, nessun campo opzionale che significa "dipende".
 */

export type Archivio = 'pubblico' | 'privato';

/** Ai sensi del Regolamento IVASS 41/2018 e prassi di mercato. */
export type TipologiaDocumento =
  | 'dip'
  | 'dip-aggiuntivo'
  | 'condizioni-assicurazione'
  | 'glossario'
  | 'preventivo'
  | 'polizza'
  | 'appendice'
  | 'convenzione'
  | 'nota-tecnica'
  | 'altro';

export interface Compagnia {
  id: Id;
  nome: string;
  /** RF-A-07: freschezza dei contenuti, per compagnia. */
  ultimoAggiornamento?: IsoDate;
}

/** Ramo / area di bisogno (RF-A-02). */
export interface Ramo {
  id: Id;
  nome: string;
  /** Slug per le rotte, es. `rc-auto`. */
  codice: string;
}

/**
 * Stato di elaborazione (RF-B-05).
 *
 * Deve essere visibile all'utente: un documento caricato ma non ancora
 * indicizzato non è referenziabile in chat, e scoprirlo mentre si scrive un
 * messaggio è il modo peggiore di apprenderlo.
 */
export type StatoElaborazione = 'in-coda' | 'in-elaborazione' | 'pronto' | 'errore';

interface DocumentoBase {
  id: Id;
  titolo: string;
  tipologia: TipologiaDocumento;
  numeroPagine?: number;
  /** URL da cui il visualizzatore carica il PDF. */
  fileUrl: string;
}

/**
 * Documento dell'Archivio Pubblico: precaricato, uguale per tutti i tenant e
 * in sola lettura (RF-A-05).
 */
export interface DocumentoPubblico extends DocumentoBase {
  archivio: 'pubblico';
  compagnia: Compagnia;
  ramo: Ramo;
  prodotto: string;
  edizione: Edizione;
  /** RF-A-09: accesso rapido ai documenti di uso frequente. */
  preferito: boolean;
}

/**
 * Edizione di un set informativo (RF-A-04): a parità di prodotto ne
 * coesistono più d'una, e sapere quale si sta leggendo è metà del lavoro
 * dell'intermediario.
 */
export interface Edizione {
  id: Id;
  etichetta: string; // es. "ed. 04/2026"
  validaDal: IsoDate;
  validaAl?: IsoDate;
  /** L'edizione in vigore, evidenziata come predefinita. */
  corrente: boolean;
}

/**
 * Documento dell'Archivio Privato: caricato dal tenant, isolato dagli altri
 * tenant in ogni circostanza (RF-B-01).
 */
export interface DocumentoPrivato extends DocumentoBase {
  archivio: 'privato';
  stato: StatoElaborazione;
  /** Presente solo quando `stato === 'errore'`. */
  erroreElaborazione?: string;
  caricatoDa: Id;
  caricatoIl: IsoDateTime;
  cartellaId?: Id;
  etichette: string[];
  /** Classificazione assistita (RF-B-03), sempre correggibile dall'utente. */
  compagnia?: Compagnia;
  ramo?: Ramo;
  riferimentoCliente?: string;
  /**
   * RF-B-09: se vero il documento è contesto permanente, consultato
   * automaticamente in ogni conversazione ed esecuzione del tenant senza che
   * l'utente debba referenziarlo.
   */
  inKnowledgeBase: boolean;
  /** RF-B-10: un contenuto in knowledge base può essere sospeso senza toglierlo. */
  kbAttivo?: boolean;
  /** RF-B-07: condiviso col tenant o riservato a chi l'ha caricato. */
  visibilita: 'tenant' | 'personale';
}

export type Documento = DocumentoPubblico | DocumentoPrivato;

/** Cartella dell'Archivio Privato (RF-B-04). */
export interface Cartella {
  id: Id;
  nome: string;
  genitoreId?: Id;
  numeroDocumenti: number;
}

/** Filtri di navigazione e ricerca (RF-A-03). */
export interface FiltriDocumenti {
  archivio?: Archivio;
  compagniaId?: Id;
  ramoId?: Id;
  tipologia?: TipologiaDocumento;
  /** Ricerca su titolo e metadati. */
  q?: string;
  soloCorrenti?: boolean;
  soloPreferiti?: boolean;
  cartellaId?: Id;
  pagina?: number;
  perPagina?: number;
}
