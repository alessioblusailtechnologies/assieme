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
}

/** Unità organizzativa cliente: agenzia, broker, intermediario. */
export interface Tenant {
  id: Id;
  nome: string;
  /** Usato nei template di output e nell'intestazione (RF-D-12). */
  logoUrl?: string;
  piano: 'base' | 'professionale' | 'agenzia';
}

/** Quel che serve sapere all'avvio dell'applicazione. */
export interface Sessione {
  utente: Utente;
  tenant: Tenant;
  permessi: Permesso[];
}
