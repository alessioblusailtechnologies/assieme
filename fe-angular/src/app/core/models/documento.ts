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
  /**
   * Dove il documento comincia nel PDF condiviso dell'edizione: le compagnie
   * pubblicano il set informativo in un file unico, e aprire il DIP deve
   * portare al DIP, non alla copertina. Stessa numerazione delle citazioni.
   */
  paginaInizio?: number;
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
  /** Presente solo quando `stato === 'errore'`, e spiega cosa fare. */
  erroreElaborazione?: string;
  caricatoDa: Id;
  caricatoIl: IsoDateTime;
  dimensioneByte: number;
  /**
   * RF-B-04. Etichette e non cartelle: un documento sta in una cartella sola,
   * ma il lavoro reale è per cliente **e** per ramo — due assi ortogonali che
   * le cartelle non sanno rappresentare.
   */
  etichette: string[];
  /** Classificazione assistita (RF-B-03), sempre correggibile dall'utente. */
  compagnia?: Compagnia;
  ramo?: Ramo;
  riferimentoCliente?: string;
  /**
   * RF-B-03: finché è vero la classificazione è una **proposta** del sistema,
   * e l'interfaccia deve mostrarla come tale.
   *
   * In ambito assicurativo una compagnia sbagliata su un documento è un
   * problema vero: un campo precompilato che sembra confermato è peggio di un
   * campo vuoto. Diventa falso appena l'utente tocca i metadati — averli
   * guardati e corretti è la conferma.
   */
  classificazioneDaConfermare?: boolean;
  /**
   * RF-B-09: il documento è stato promosso a **documento di riferimento**
   * (RF-D-14), quindi è contesto permanente e l'AI lo consulta senza che
   * l'utente debba referenziarlo.
   *
   * Il documento resta nell'Archivio Privato: la promozione non lo sposta,
   * gli aggiunge un ruolo. Governo e sospensione stanno nelle Istruzioni,
   * dove il documento compare accanto alle regole scritte.
   */
  documentoDiRiferimento: boolean;
  /** RF-B-07: condiviso col tenant o riservato a chi l'ha caricato. */
  visibilita: 'tenant' | 'personale';
}

export type Documento = DocumentoPubblico | DocumentoPrivato;

/** Etichetta con quanti documenti la portano, per il completamento. */
export interface Etichetta {
  nome: string;
  documenti: number;
}

/** RF-B-08: limiti di spazio del piano commerciale. */
export interface SpazioTenant {
  usatoByte: number;
  limiteByte: number;
  /** Oltre questa misura il singolo file viene rifiutato. */
  limiteFileByte: number;
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
  pagina?: number;
  perPagina?: number;
}

/** Filtri dell'Archivio Privato: stati ed etichette al posto delle edizioni. */
export interface FiltriDocumentiPrivati {
  q?: string;
  tipologia?: TipologiaDocumento;
  stato?: StatoElaborazione;
  etichetta?: string;
  soloRiferimenti?: boolean;
  pagina?: number;
  perPagina?: number;
}
