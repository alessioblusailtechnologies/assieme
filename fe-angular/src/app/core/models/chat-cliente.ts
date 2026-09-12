import type { Id, IsoDateTime } from './comune';

/**
 * Le chat destinate ai clienti dell'agenzia (07/09/2026).
 *
 * L'agenzia ne crea una **per un suo cliente**, e il cono di lettura è il
 * cliente stesso: i suoi documenti, calcolati ogni volta, così una polizza
 * caricata domani entra da sola. A mano si scelgono solo gli scostamenti —
 * un documento in più, uno da non mostrare — e le istruzioni con cui
 * l'assistente deve rispondergli. Ne esce un link.
 *
 * Specchio di `be-node/src/contratto/chat-clienti.ts`.
 */

export type StatoChatCliente = 'attiva' | 'sospesa' | 'scaduta';

export interface ChatCliente {
  id: Id;
  titolo: string;
  /** Obbligatorio dal 12/09/2026: è il cliente a fare il cono. */
  clienteId: Id;
  clienteNome: string;
  /** Chi entra dal link: il nome che l'agenzia gli ha dato. */
  ospite: { id: Id; nome: string; cognome: string };
  stato: StatoChatCliente;
  scadeIl?: IsoDateTime;
  tettoDomande?: number;
  domandeFatte: number;
  /** Le istruzioni le vede l'agenzia, che le ha scritte: al cliente no. */
  istruzioni?: string;
  /* Gli scostamenti dal cono: i documenti del cliente non si elencano, perché
     cambiano da soli quando l'agenzia ne carica uno. */
  aggiunti: { id: Id; titolo: string }[];
  esclusi: { id: Id; titolo: string }[];
  creataIl: IsoDateTime;
  /**
   * Il link da mandare al cliente, pronto da copiare. Assente sulle chat
   * create prima del 07/09/2026, di cui il server conservava solo
   * l'impronta: per quelle si può soltanto rigenerarlo.
   */
  url?: string;
  /** Quanto è costata finora, in USD: si guarda nella scheda, non nell'elenco. */
  costoUsd: number;
}

/**
 * Il link, che si vede **una volta sola**.
 *
 * Del token il server conserva solo lo sha256: non c'è modo di rileggerlo, e
 * non è una scomodità da aggirare — è la ragione per cui chi ha accesso al
 * database non entra nelle chat dei clienti. Chi lo perde ne rigenera uno,
 * e il vecchio smette di funzionare all'istante.
 */
export interface LinkChatCliente {
  chatId: Id;
  url: string;
}

/** Che cosa vede chi apre il link: quanto basta a scrivere la testata. */
export interface SessioneOspite {
  chat: { id: Id; titolo: string };
  ospite: { id: Id; nome: string; cognome: string };
  agenzia: { id: Id; nome: string; logoUrl?: string };
}
