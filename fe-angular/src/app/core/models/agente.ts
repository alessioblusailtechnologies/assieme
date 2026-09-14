import { Citazione } from './citazione';
import { Id, IsoDateTime } from './comune';
import type { BozzaEmail, DestinatarioBozza, DocumentoGenerato, RiferimentoDocumento } from './conversazione';

/**
 * Agenti (Modulo E): task AI definiti una volta ed eseguibili su richiesta o
 * su pianificazione. È ciò che estende VELIA da strumento interrogativo a
 * strumento operativo.
 *
 * Dal 14/09/2026 un agente si definisce come una domanda in chat: un nome,
 * quando corre, e una **richiesta** scritta con la stessa barra, coi
 * riferimenti al loro posto. Da quella richiesta Velia scrive il **piano**,
 * che si legge e si conferma prima che l'agente possa partire.
 */

export type StatoPiano = 'non-letto' | 'da-confermare' | 'confermato';

export type TipoRiferimentoRichiesta = 'documento' | 'prodotto' | 'cliente';

/** Un riferimento della richiesta, risolto oggi dal server: il chip, col suo titolo. */
export type RiferimentoRichiesta =
  | { tipo: 'documento'; chiave: Id; titolo: string; archivio: 'pubblico' | 'privato' }
  | { tipo: 'prodotto'; chiave: string; titolo: string; documenti: RiferimentoDocumento[] }
  | { tipo: 'cliente'; chiave: Id; titolo: string };

export interface Agente {
  id: Id;
  nome: string;
  /** Il testo coi riferimenti come marcatori `@[tipo:chiave]`, com'è stato scritto. */
  richiesta: string;
  /** I riferimenti risolti; quelli che non esistono più mancano, e il chip lo dice. */
  riferimenti: RiferimentoRichiesta[];
  piano?: PianoAgente;
  pianoStato: StatoPiano;
  /** Perché il piano manca o non è aggiornato: la lettura non è riuscita. */
  pianoErrore?: string;
  pianoConfermatoIl?: IsoDateTime;
  /** Perché il piano non si può confermare così com'è. */
  bloccoConferma?: string;
  pianificazione?: Pianificazione;
  /**
   * RF-E-01: un agente disattivato resta definito e consultabile, ma non
   * esegue, né a mano né su pianificazione.
   */
  attivo: boolean;
  creatoDa: Id;
  aggiornatoIl: IsoDateTime;
}

/**
 * Il piano: come Velia ha capito la richiesta. È il patto che si conferma:
 * che cosa legge, che cosa prepara, a chi scrive.
 */
export interface PianoAgente {
  obiettivo: string;
  passi: PassoPiano[];
  letture: LetturaPiano[];
  file: FilePiano[];
  email: EmailPiano[];
  /** Ciò che la richiesta lascia aperto: domande, non blocchi. */
  dubbi: string[];
}

export interface PassoPiano {
  tipo: 'leggi' | 'cerca' | 'confronta' | 'genera-file' | 'invia-email' | 'altro';
  titolo: string;
  dettaglio?: string;
}

export interface LetturaPiano {
  tipo: 'documento' | 'prodotto' | 'cliente' | 'archivio';
  etichetta: string;
  riferimento?: { tipo: TipoRiferimentoRichiesta; chiave: string };
}

export interface FilePiano {
  formato: string;
  descrizione: string;
}

/** Un'email del piano: il destinatario è fissato, e l'agente scrive solo a lui. */
export interface EmailPiano {
  destinatario: DestinatarioBozza | DestinatarioNonRisolto;
  oggetto?: string;
  contenuto: string;
  allegati: string[];
}

export interface DestinatarioNonRisolto {
  tipo: 'non-risolto';
  richiesto: string;
  motivo: string;
}

/**
 * La riga dell'elenco: quanto basta a capire lo stato della flotta.
 * `ultimaEsecuzione` risponde alla domanda con cui si apre la sezione,
 * «è andata, l'ultima volta?».
 */
export interface AgenteRiepilogo {
  id: Id;
  nome: string;
  /** L'obiettivo del piano, quando c'è. */
  obiettivo?: string;
  attivo: boolean;
  pianoStato: StatoPiano;
  pianificazione?: Pianificazione;
  ultimaEsecuzione?: EsecuzioneRiepilogo;
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
  /**
   * RF-E-11: quanti tentativi ha richiesto. Vale 1 nel caso normale; di più
   * quando la politica di retry è intervenuta.
   */
  tentativi: number;
  /** Contenuto consultabile in piattaforma (RF-E-07), markdown minimo. */
  output?: string;
  /** RF-E-08: le esecuzioni rispettano gli stessi vincoli di citazione della chat. */
  citazioni: Citazione[];
  /** Log sintetico (RF-E-06): passi svolti, non traccia di debug. */
  log: RigaLog[];
  errore?: string;
  /** La conversazione dell'esecuzione (14/09/2026): «Continua in chat» apre questa. */
  conversazioneId?: Id;
  /** I file prodotti, da scaricare dalla conversazione dell'esecuzione. */
  documenti: DocumentoGenerato[];
  /** Le email partite, verso i destinatari del piano confermato. */
  email: BozzaEmail[];
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
  errore?: string;
  conversazioneId?: Id;
}

export interface RigaLog {
  istante: IsoDateTime;
  livello: 'info' | 'avviso' | 'errore';
  messaggio: string;
}

/**
 * Agente predefinito della libreria (RF-E-10): una richiesta da cui partire.
 * «Parti da questo» apre la creazione già scritta; l'agente che ne nasce è
 * del tenant, e della libreria non sa più nulla.
 */
export interface AgentePredefinito {
  id: Id;
  nome: string;
  descrizione: string;
  richiesta: string;
  /** Senza `sospesa`: è un suggerimento, non uno stato. */
  pianificazioneSuggerita?: Omit<Pianificazione, 'sospesa'>;
}

/**
 * RF-E-09: i limiti del piano commerciale, con i consumi correnti. Il server
 * li applica comunque; il front-end li mostra prima.
 */
export interface LimitiAgenti {
  agentiAttiviMax: number;
  agentiAttivi: number;
  esecuzioniConcorrentiMax: number;
  esecuzioniInCorso: number;
  /** La pianificazione più fitta ammessa dal piano. */
  frequenzaMinima: FrequenzaPianificazione;
}

/** Corpo di creazione: il piano lo scrive il server. */
export interface NuovoAgente {
  nome: string;
  richiesta: string;
  pianificazione?: Pianificazione;
}

/** Corpo del PATCH: ogni campo è indipendente; `null` toglie la pianificazione. */
export interface ModificheAgente {
  nome?: string;
  richiesta?: string;
  pianificazione?: Pianificazione | null;
  attivo?: boolean;
}
