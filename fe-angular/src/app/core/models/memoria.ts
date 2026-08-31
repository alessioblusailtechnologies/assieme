import { Archivio } from './documento';
import { Citazione } from './citazione';
import { Id, IsoDateTime } from './comune';

/**
 * Memoria persistente (Modulo G).
 *
 * RF-G-03 chiede che sia trasparente e controllabile: consultabile,
 * modificabile e cancellabile ricordo per ricordo. Non è una richiesta
 * accessoria — una memoria opaca su dati di clienti finali genera diffidenza
 * invece di fiducia, e RF-G-05 le pone limiti espliciti di contenuto e
 * retention.
 */

export interface Ricordo {
  id: Id;
  testo: string;
  /**
   * RF-G-02: memoria di tenant (condivisa in agenzia) o personale del
   * singolo utente. La distinzione va mostrata: un ricordo che vale per
   * tutta l'agenzia ha conseguenze diverse da una preferenza individuale.
   */
  ambito: 'tenant' | 'personale';
  categoria: 'prassi' | 'cliente' | 'preferenza' | 'decisione' | 'altro';
  /*
   * Nessun campo `origine`: senza registrazione esplicita (RF-G-07 rimosso
   * su indicazione del committente) ogni ricordo è appreso dal lavoro, e un
   * discriminante con un valore solo è rumore di contratto.
   */
  /** Da quale conversazione o esecuzione è emerso, per poterlo verificare. */
  origineConversazioneId?: Id;
  creatoIl: IsoDateTime;
  aggiornatoIl: IsoDateTime;
  /** Un ricordo si può sospendere senza cancellarlo. */
  attivo: boolean;
}

/** Corpo del PATCH: ogni campo è indipendente. */
export type ModificheRicordo = Partial<
  Pick<Ricordo, 'testo' | 'ambito' | 'categoria' | 'attivo'>
>;

// ---------------------------------------------------------------------------
// Il globo della memoria (GET /api/ricordi/grafo)
// ---------------------------------------------------------------------------

/**
 * Il grafo che il pannello memoria rende come globo. Due strati, entrambi
 * veri e navigabili: **l'archivio** (rami → compagnie → prodotti →
 * documenti, le edizioni correnti del pubblico — la trama fitta, i cluster)
 * e **il lavoro** (ricordi → conversazioni d'origine → passaggi citati →
 * documenti). Il ricordo non porta riferimenti documentali (il perimetro
 * dell'apprendimento li esclude apposta): il ponte è la conversazione.
 *
 * La visibilità la fa il server come per gli elenchi: l'archivio pubblico è
 * di tutti, conversazioni proprie o condivise, ricordi del tenant più i
 * propri — il globo di due colleghi può legittimamente differire.
 */

export type TipoNodoGrafo =
  | 'ricordo'
  | 'conversazione'
  | 'punto'
  | 'documento'
  | 'prodotto'
  | 'compagnia'
  | 'ramo';

export interface NodoGrafoMemoria {
  /** Chiave unica nel grafo, con prefisso di tipo: `ricordo:<id>`, `punto:<documentoId>@<pagina>`. */
  chiave: string;
  tipo: TipoNodoGrafo;
  etichetta: string;
  /** Quante volte il lavoro l'ha toccato: il raggio del nodo nel globo. */
  peso: number;
  /** L'id dell'entità da aprire (assente per i punti: lì parla `citazione`). */
  id?: Id;
  /** Solo documento: in quale archivio sta, per la scheda e per il PDF. */
  archivio?: Archivio | 'conversazione';
  /** Solo ricordo: come nell'elenco, per colore e stato. */
  categoria?: Ricordo['categoria'];
  ambito?: Ricordo['ambito'];
  attivo?: boolean;
  /** Solo ricordo: il testo intero — l'etichetta è accorciata per il disegno. */
  testo?: string;
  /** Solo punto: la citazione completa — estratto, posizione, documento. */
  citazione?: Citazione;
}

export interface LegameGrafoMemoria {
  /** Chiavi dei nodi collegati. */
  da: string;
  a: string;
  /** Quante volte il legame è stato percorso (1 = un tocco). */
  peso: number;
}

export interface GrafoMemoria {
  nodi: NodoGrafoMemoria[];
  legami: LegameGrafoMemoria[];
}
