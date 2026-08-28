import { Id, IsoDateTime } from './comune';

/**
 * Ruoli.
 *
 * L'analisi dei requisiti rimanda il modello di ruoli e permessi alle
 * revisioni successive (§ "Prossime revisioni"), ma il front-end deve
 * decidere che cosa mostrare a chi già dalla prima schermata. Assunzione
 * minima, da rivedere quando il modello definitivo arriva:
 *
 * - `operatore` — RF-1.4: agente, subagente, impiegato, broker. Consulta gli
 *   archivi e usa la chat.
 * - `amministratore` — ha tutto ciò che ha l'operatore, più la gestione di
 *   utenti, istruzioni — regole e documenti di riferimento (RF-D-01,
 *   RF-D-15) — e template (RF-D-13).
 *
 * L'inclusione è voluta: `amministratore` ⊃ `operatore`. Un permesso non si
 * chiede mai come "sei amministratore?" ma tramite `puo()` in
 * `SessioneStore`, così che l'arrivo di un terzo ruolo non costringa a
 * ripassare ogni template.
 */
export type Ruolo = 'operatore' | 'amministratore';

/** Permessi verificabili. Cresceranno: l'elenco è il perimetro delle decisioni. */
export type Permesso =
  | 'archivio-privato.carica'
  | 'archivio-privato.elimina'
  | 'istruzioni.gestisci'
  | 'riferimenti.gestisci'
  | 'template.gestisci'
  | 'utenti.gestisci'
  | 'modello-ai.configura'
  | 'mcp.credenziali'
  | 'agenti.crea';

export interface Utente {
  id: Id;
  nome: string;
  cognome: string;
  email: string;
  ruolo: Ruolo;
  tenantId: Id;
  ultimoAccesso?: IsoDateTime;
  /**
   * Ciclo di vita nella gestione utenti (RF-D-01). Facoltativo perché la
   * sessione non ne ha bisogno: chi è dentro è per forza attivo.
   * `sospeso` e non eliminato: un utente che se ne va lascia conversazioni,
   * tabelle e regole firmate col suo nome.
   */
  stato?: 'attivo' | 'invitato' | 'sospeso';
}

/** Corpo dell'invito di un nuovo utente (RF-D-01). */
export type NuovoUtente = Pick<Utente, 'nome' | 'cognome' | 'email' | 'ruolo'>;

/** Unità organizzativa cliente: agenzia, broker, intermediario. */
export interface Tenant {
  id: Id;
  nome: string;
  /** Usato nei template di output e nell'intestazione (RF-D-12). */
  logoUrl?: string;
  piano: 'base' | 'professionale' | 'agenzia';
}

/**
 * Le fasce orarie del saluto della home: l'ora la decide il browser, il
 * server fornisce le frasi per ciascuna. Specchio di
 * `be-node/src/contratto/sessione.ts`.
 */
export type FasciaSaluto = 'notte' | 'alba' | 'mattina' | 'pranzo' | 'pomeriggio' | 'sera';

/**
 * Il lotto di saluti generato dal modello, uguale per tutti: le frasi
 * portano il segnaposto `{nome}`. Una fascia vuota lascia le frasi fisse.
 */
export interface LottoSaluti {
  generatoIl: IsoDateTime;
  frasi: Record<FasciaSaluto, string[]>;
}

/** Quel che serve sapere all'avvio dell'applicazione. */
export interface Sessione {
  utente: Utente;
  tenant: Tenant;
  permessi: Permesso[];
  /** Assente finché nessun lotto è stato generato. */
  saluti?: LottoSaluti;
}

/** Corpo di `POST /api/sessione/accesso`. */
export interface Credenziali {
  email: string;
  password: string;
}

/**
 * Risposta dell'accesso (e, senza `sessione`, dell'aggiornamento token).
 * Specchio di `be-node/src/contratto/sessione.ts`: il backend è la fonte
 * di questo contratto.
 */
export interface EsitoAccesso {
  tokenAccesso: string;
  tokenAggiornamento: string;
  scadeInSecondi: number;
  sessione: Sessione;
}
