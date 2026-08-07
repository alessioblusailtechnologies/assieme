import { Citazione } from './citazione';
import { Archivio } from './documento';
import { Id, IsoDateTime } from './comune';

/**
 * Agenti (Modulo E): task AI definiti una volta ed eseguibili su richiesta o
 * su pianificazione. È ciò che estende VELIA da strumento interrogativo a
 * strumento operativo.
 */

export interface Agente {
  id: Id;
  nome: string;
  descrizione: string;
  /** Il task in linguaggio naturale (RF-E-02). */
  istruzioni: string;
  fonti: FonteAgente[];
  formatoOutput: FormatoOutputAgente;
  /** RF-E-13: se valorizzato, ogni esecuzione produce anche il documento su template. */
  templateOutputId?: Id;
  /** RF-E-05: gli input variabili che l'esecuzione manuale può fornire. */
  parametri: ParametroAgente[];
  pianificazione?: Pianificazione;
  /**
   * RF-E-01: un agente disattivato resta definito e consultabile, ma non
   * esegue — né a mano né su pianificazione. È il modo reversibile di
   * spegnerlo; l'eliminazione è per gli agenti che non servono più.
   */
  attivo: boolean;
  creatoDa: Id;
  aggiornatoIl: IsoDateTime;
}

/**
 * L'esito consultabile di ogni esecuzione (RF-E-02): una risposta discorsiva
 * o un'estrazione tabellare — in entrambi i casi testo con citazioni. Il
 * `documento` in più lo produce il template (RF-E-13), e infatti sceglierlo
 * come formato richiede un `templateOutputId`.
 */
export type FormatoOutputAgente = 'testo' | 'tabella' | 'documento';

/**
 * La riga dell'elenco: quanto basta a capire lo stato della flotta senza
 * trascinarsi dietro istruzioni e storico. `ultimaEsecuzione` risponde alla
 * domanda con cui si apre la sezione — «è andata, l'ultima volta?».
 */
export interface AgenteRiepilogo {
  id: Id;
  nome: string;
  descrizione: string;
  attivo: boolean;
  formatoOutput: FormatoOutputAgente;
  pianificazione?: Pianificazione;
  numeroFonti: number;
  ultimaEsecuzione?: EsecuzioneRiepilogo;
}

/**
 * Fonte documentale, **idratata** dal server: `etichetta` è già pronta per
 * l'interfaccia, come il contesto della conversazione (Fase 3). Nei corpi di
 * richiesta viaggia la forma nuda, `NuovaFonteAgente`.
 *
 * RF-E-02 ammette sia singoli documenti sia intere porzioni di archivio. La
 * differenza è sostanziale: un agente puntato su "tutti i documenti del ramo
 * auto" lavora su un insieme che cambia da solo nel tempo — che è esattamente
 * il punto dell'agente di monitoraggio delle nuove edizioni (RF-E-10).
 */
export type FonteAgente = NuovaFonteAgente & { etichetta: string };

export type NuovaFonteAgente =
  | { tipo: 'documento'; documentoId: Id; archivio: Archivio }
  | { tipo: 'selezione'; archivio: Archivio; ramoId?: Id; compagniaId?: Id; soloPreferiti?: boolean }
  | { tipo: 'documenti-riferimento' };

/**
 * Input variabile dell'esecuzione manuale (RF-E-05), es. il documento su cui
 * operare quella volta. I valori viaggiano in `AvvioEsecuzione.parametri`,
 * per chiave; per il tipo `documento` il valore è l'id del documento.
 */
export interface ParametroAgente {
  chiave: string;
  etichetta: string;
  tipo: 'testo' | 'documento';
  obbligatorio: boolean;
  /** Aiuto sotto il campo, es. «la targa del veicolo». */
  suggerimento?: string;
}

export interface Pianificazione {
  frequenza: FrequenzaPianificazione;
  /** Orario locale `HH:mm`. */
  orario: string;
  /** 1 = lunedì. Solo per la frequenza settimanale. */
  giornoSettimana?: number;
  /** 1–28. Solo per la frequenza mensile. */
  giornoMese?: number;
  /** RF-E-04: sospendibile e riattivabile senza perdere la definizione. */
  sospesa: boolean;
}

export type FrequenzaPianificazione = 'giornaliera' | 'settimanale' | 'mensile';

export type StatoEsecuzione = 'in-coda' | 'in-corso' | 'completata' | 'fallita';

export type ModalitaEsecuzione = 'manuale' | 'pianificata';

export interface EsecuzioneAgente {
  id: Id;
  agenteId: Id;
  avviataIl: IsoDateTime;
  conclusaIl?: IsoDateTime;
  modalita: ModalitaEsecuzione;
  stato: StatoEsecuzione;
  /** RF-E-05: i valori forniti all'avvio, per chiave del parametro. */
  parametri?: Record<string, string>;
  /**
   * RF-E-11: quanti tentativi ha richiesto. Vale 1 nel caso normale; di più
   * quando la politica di retry è intervenuta — un fallimento con 3 tentativi
   * è un fallimento persistente, e l'interfaccia lo dice.
   */
  tentativi: number;
  /** Contenuto consultabile in piattaforma (RF-E-07), markdown minimo. */
  output?: string;
  /** RF-E-08: le esecuzioni rispettano gli stessi vincoli di citazione della chat. */
  citazioni: Citazione[];
  /** RF-E-13: documento generato sul template, scaricabile dallo storico. */
  documentoGeneratoUrl?: string;
  /** Log sintetico (RF-E-06): passi svolti, non traccia di debug. */
  log: RigaLog[];
  errore?: string;
}

/** La riga dello storico (RF-E-06): l'esito pieno si apre da lì. */
export interface EsecuzioneRiepilogo {
  id: Id;
  agenteId: Id;
  avviataIl: IsoDateTime;
  conclusaIl?: IsoDateTime;
  modalita: ModalitaEsecuzione;
  stato: StatoEsecuzione;
  tentativi: number;
  documentoGeneratoUrl?: string;
  errore?: string;
}

export interface RigaLog {
  istante: IsoDateTime;
  livello: 'info' | 'avviso' | 'errore';
  messaggio: string;
}

/**
 * Agente predefinito della libreria (RF-E-10): una definizione completa da
 * cui partire. «Attivarlo» significa aprirne una copia nel modulo di
 * creazione e personalizzarla — l'agente che ne nasce è del tenant, e della
 * libreria non sa più nulla.
 */
export interface AgentePredefinito {
  id: Id;
  nome: string;
  descrizione: string;
  istruzioni: string;
  fonti: FonteAgente[];
  formatoOutput: FormatoOutputAgente;
  parametri: ParametroAgente[];
  /** Senza `sospesa`: è un suggerimento, non uno stato. */
  pianificazioneSuggerita?: Omit<Pianificazione, 'sospesa'>;
}

/**
 * RF-E-09: i limiti del piano commerciale, con i consumi correnti. Il server
 * li applica comunque (409 sull'attivazione oltre soglia, 429 sulle
 * esecuzioni concorrenti); il front-end li mostra prima, perché un limite
 * scoperto al momento dell'errore è un limite comunicato male.
 */
export interface LimitiAgenti {
  agentiAttiviMax: number;
  agentiAttivi: number;
  esecuzioniConcorrentiMax: number;
  esecuzioniInCorso: number;
  /** La pianificazione più fitta ammessa dal piano. */
  frequenzaMinima: FrequenzaPianificazione;
}

/** Corpo di creazione (RF-E-01/02); id e firma li mette il server. */
export interface NuovoAgente {
  nome: string;
  descrizione: string;
  istruzioni: string;
  fonti: NuovaFonteAgente[];
  formatoOutput: FormatoOutputAgente;
  templateOutputId?: Id;
  parametri?: ParametroAgente[];
  pianificazione?: Pianificazione;
}

/** Corpo del PATCH: ogni campo è indipendente; `null` toglie ciò che c'era. */
export interface ModificheAgente {
  nome?: string;
  descrizione?: string;
  istruzioni?: string;
  fonti?: NuovaFonteAgente[];
  formatoOutput?: FormatoOutputAgente;
  templateOutputId?: Id | null;
  parametri?: ParametroAgente[];
  pianificazione?: Pianificazione | null;
  attivo?: boolean;
}

/** Corpo dell'esecuzione manuale (RF-E-03, RF-E-05). */
export interface AvvioEsecuzione {
  parametri?: Record<string, string>;
}
