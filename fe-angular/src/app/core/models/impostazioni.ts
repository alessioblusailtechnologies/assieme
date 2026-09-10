import { Id, IsoDateTime } from './comune';

/**
 * Impostazioni e personalizzazione (Modulo D).
 */

/**
 * Livello selezionabile (Avanzato, Boost).
 *
 * RF-D-02 impone che l'architettura astragga il provider, così da poter
 * aggiungere o sostituire modelli senza toccare i moduli funzionali — è il
 * presidio contro la dipendenza da fornitori terzi (Vincolo §5.4). Dal
 * 10/09/2026 l'agenzia sceglie un livello e il modello che lo serve resta
 * una decisione del backend: al front-end non arriva né il suo nome né
 * quello del provider.
 */
export interface ModelloAI {
  id: Id;
  nome: string;
  /** RF-D-03: informazioni sintetiche utili alla scelta. */
  descrizione: string;
  adeguatezzaDocumentale: 'alta' | 'media' | 'bassa';
  notaCosti?: string;
  disponibile: boolean;
}

/**
 * Regola scritta (RF-D-04).
 *
 * L'esempio dell'analisi vale più di una definizione: "non segnalare come
 * carenza l'assenza della garanzia infortuni del conducente, l'agenzia la
 * copre con polizza dedicata". Un'analisi a criteri fissi la segnalerebbe
 * come mancanza grave; è esattamente il limite di Navisio che VELIA supera.
 *
 * RF-D-08 pone il confine: le regole orientano il giudizio, **non alterano i
 * fatti documentali**. L'obbligo di citazione e la dichiarazione di
 * non-copertura restano attivi comunque.
 */
export interface RegolaIstruzione {
  id: Id;
  titolo: string;
  testo: string;
  /** RF-D-06: organizzabili per ambito e attivabili singolarmente. */
  ambito: AmbitoIstruzione;
  attiva: boolean;
  creataDa: Id;
  aggiornataIl: IsoDateTime;
}

/**
 * Documento di riferimento (RF-D-14).
 *
 * L'altra natura delle istruzioni. Stesso governo di una regola — ambito,
 * attivazione, cura dell'amministratore — ma una differenza sostanziale:
 * **può essere citato**. Una regola dice come giudicare, un documento dice
 * cosa c'è scritto, e la citazione è ciò su cui poggia la verificabilità del
 * sistema (RF-C-04, RNF-01).
 *
 * Può essere caricato qui o promosso da un documento dell'Archivio Privato
 * (RF-B-09), che in quel caso resta dov'è e acquisisce un ruolo in più.
 */
export interface DocumentoRiferimento {
  id: Id;
  titolo: string;
  /** Valorizzato quando nasce da un documento dell'Archivio Privato. */
  documentoPrivatoId?: Id;
  ambito: AmbitoIstruzione;
  attivo: boolean;
  numeroPagine?: number;
  /** RF-D-16: il peso conta, perché è contesto permanente a ogni query. */
  dimensioneByte: number;
  caricatoDa: Id;
  aggiornatoIl: IsoDateTime;
}

export type AmbitoIstruzione =
  | { tipo: 'generale' }
  | { tipo: 'ramo'; ramoId: Id }
  | { tipo: 'compagnia'; compagniaId: Id };

/** Corpo di creazione di una regola; l'id e la firma li mette il server. */
export type NuovaRegola = Pick<RegolaIstruzione, 'titolo' | 'testo' | 'ambito'>;

/** Corpo del PATCH di una regola: ogni campo è indipendente. */
export type ModificheRegola = Partial<Pick<RegolaIstruzione, 'titolo' | 'testo' | 'ambito' | 'attiva'>>;

/** Corpo del PATCH di un documento di riferimento: governo, non contenuto. */
export type ModificheRiferimento = Partial<Pick<DocumentoRiferimento, 'ambito' | 'attivo'>>;

/** RF-D-07: storico delle modifiche, per audit e diagnosi di risposte inattese. */
export interface VoceStoricoImpostazioni {
  id: Id;
  istante: IsoDateTime;
  utenteId: Id;
  utenteNome: string;
  azione: 'creazione' | 'modifica' | 'attivazione' | 'disattivazione' | 'eliminazione';
  oggetto: 'regola' | 'documento-riferimento' | 'modello' | 'template';
  descrizione: string;
}

/** I formati che il server sa generare (PPTX è rimandato, punto aperto §6.11). */
export type FormatoGenerazione = 'pdf' | 'docx' | 'xlsx';

/** L'«Esporta come» di una risposta: i formati generabili più il testo semplice, senza template. */
export type FormatoEsportaRisposta = FormatoGenerazione | 'txt';

/**
 * Template di output (RF-D-10…D-13).
 *
 * Un template è un documento dell'agenzia caricato dalle Impostazioni:
 * quanti se ne vogliono, anche più d'uno nello stesso formato, ognuno col
 * nome con cui lo si richiama (in chat, negli agenti). Per ogni formato ce
 * n'è al più uno predefinito; per i formati senza template i documenti
 * escono col layout di piattaforma e l'identità visiva.
 */
export interface TemplateOutput {
  id: Id;
  nome: string;
  formato: FormatoGenerazione | 'pptx';
  descrizione: string;
  anteprimaUrl?: string;
  /** RF-D-13: il predefinito del suo formato. */
  predefinito: boolean;
}

/** RF-F-02: credenziali per l'accesso via MCP, generabili e revocabili. */
export interface CredenzialeMcp {
  id: Id;
  nome: string;
  /** Mostrato per esteso una sola volta, alla creazione. */
  tokenMascherato: string;
  creataIl: IsoDateTime;
  ultimoUtilizzo?: IsoDateTime;
  revocata: boolean;
}

/**
 * La risposta alla generazione (RF-F-02): l'unica volta in cui il token
 * viaggia in chiaro. Il server non lo conserva né lo rimanda: chi non lo
 * copia adesso genera una credenziale nuova — è il comportamento standard
 * dei token API, e va detto nell'interfaccia, non scoperto.
 */
export interface CredenzialeGenerata extends CredenzialeMcp {
  token: string;
}

/** RF-F-04: una connessione MCP attiva, per lo stato in Impostazioni. */
export interface ConnessioneMcp {
  id: Id;
  /** Il client dichiarato, es. `Claude Desktop`. */
  client: string;
  credenzialeId: Id;
  connessaDal: IsoDateTime;
  ultimaAttivita: IsoDateTime;
}
