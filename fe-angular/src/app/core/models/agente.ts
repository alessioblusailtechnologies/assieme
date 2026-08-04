import { Citazione } from './citazione';
import { Id, IsoDateTime } from './comune';

/**
 * Agenti (Modulo E): task AI definiti una volta ed eseguibili su richiesta o
 * su pianificazione. È ciò che estende ASSIEME da strumento interrogativo a
 * strumento operativo.
 */

export interface Agente {
  id: Id;
  nome: string;
  descrizione: string;
  /** Il task in linguaggio naturale (RF-E-02). */
  istruzioni: string;
  fonti: FonteAgente[];
  formatoOutput: 'testo' | 'tabella' | 'documento';
  /** RF-E-13: se valorizzato, ogni esecuzione produce anche il documento su template. */
  templateOutputId?: Id;
  pianificazione?: Pianificazione;
  attivo: boolean;
  creatoDa: Id;
  ultimaEsecuzione?: IsoDateTime;
}

/**
 * Fonte documentale.
 *
 * RF-E-02 ammette sia singoli documenti sia intere porzioni di archivio. La
 * differenza è sostanziale: un agente puntato su "tutti i DIP del ramo auto"
 * lavora su un insieme che cambia da solo nel tempo — che è esattamente il
 * punto dell'agente di monitoraggio delle nuove edizioni (RF-E-10).
 */
export type FonteAgente =
  | { tipo: 'documento'; documentoId: Id }
  | { tipo: 'selezione'; archivio: 'pubblico' | 'privato'; ramoId?: Id; compagniaId?: Id }
  | { tipo: 'knowledge-base' };

export interface Pianificazione {
  frequenza: 'giornaliera' | 'settimanale' | 'mensile';
  /** Orario locale `HH:mm`. */
  orario: string;
  /** 1 = lunedì. Solo per la frequenza settimanale. */
  giornoSettimana?: number;
  /** 1–28. Solo per la frequenza mensile. */
  giornoMese?: number;
  sospesa: boolean;
}

export type StatoEsecuzione = 'in-coda' | 'in-corso' | 'completata' | 'fallita';

export interface EsecuzioneAgente {
  id: Id;
  agenteId: Id;
  avviataIl: IsoDateTime;
  conclusaIl?: IsoDateTime;
  modalita: 'manuale' | 'pianificata';
  stato: StatoEsecuzione;
  /** Contenuto consultabile in piattaforma (RF-E-07). */
  output?: string;
  /** RF-E-08: le esecuzioni rispettano gli stessi vincoli di citazione della chat. */
  citazioni: Citazione[];
  /** RF-E-13: documento generato sul template, scaricabile dallo storico. */
  documentoGeneratoUrl?: string;
  /** Log sintetico (RF-E-06): passi svolti, non traccia di debug. */
  log: RigaLog[];
  errore?: string;
}

export interface RigaLog {
  istante: IsoDateTime;
  livello: 'info' | 'avviso' | 'errore';
  messaggio: string;
}
