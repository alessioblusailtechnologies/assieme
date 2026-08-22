import { Citazione } from './citazione';
import { Archivio } from './documento';
import { Id, IsoDateTime, Provenienza } from './comune';

/**
 * Chat conversazionale (Modulo C).
 */

/**
 * Riferimento compatto a un documento nel contesto di una conversazione.
 *
 * Idratato dall'API — id, titolo e archivio, non il documento intero: la
 * barra del contesto deve mostrare *cosa* c'è dentro senza una chiamata per
 * documento, e non le serve altro.
 *
 * `conversazione` è il terzo posto da cui un documento può venire: un file
 * **allegato** dal composer, che vive con la conversazione e non entra negli
 * archivi (RF-C-02). Il tipo sta qui e non in `Archivio`, perché negli
 * archivi — selettori, tabelle, fonti degli agenti — un allegato non
 * comparirà mai.
 */
export interface RiferimentoDocumento {
  id: Id;
  titolo: string;
  archivio: Archivio | 'conversazione';
}

export interface Conversazione {
  id: Id;
  titolo: string;
  creataIl: IsoDateTime;
  aggiornataIl: IsoDateTime;
  /**
   * RF-C-03: i documenti referenziati restano nel contesto e sono
   * richiamabili nei messaggi successivi senza riselezionarli, finché
   * l'utente non li rimuove. È un attributo della conversazione, non del
   * singolo messaggio.
   */
  documentiInContesto: RiferimentoDocumento[];
  /** RF-C-15: condivisa in sola lettura con gli altri utenti del tenant. */
  condivisa: boolean;
  autoreId: Id;
}

export type AutoreMessaggio = 'utente' | 'assistente';

export interface Messaggio {
  id: Id;
  conversazioneId: Id;
  autore: AutoreMessaggio;
  testo: string;
  inviatoIl: IsoDateTime;
  /** Documenti referenziati esplicitamente in *questo* messaggio (RF-C-02). */
  documentiReferenziati: Id[];
  /** RF-C-04: obbligatorie sulle risposte fondate sui documenti. */
  citazioni: Citazione[];
  /** RF-D-05, RF-B-10, RF-G-03: che cosa ha influenzato la risposta oltre ai documenti. */
  provenienze: Provenienza[];
  /**
   * RF-C-08: la risposta non è supportata dai documenti disponibili e il
   * sistema lo dichiara invece di produrre contenuto non verificabile.
   * Non è un errore — è una risposta legittima, e va mostrata come tale.
   */
  nonSupportato?: boolean;
  /** Vero mentre lo streaming è in corso: il testo cresce, i pulsanti aspettano. */
  inCorso?: boolean;
}

/**
 * Eventi dello stream SSE della risposta.
 *
 * Il contratto dello streaming va fissato ora, non quando arriverà il
 * backend: è la parte del front-end più difficile da cambiare dopo, perché
 * ci si appoggia la resa progressiva del testo, delle citazioni e degli
 * indicatori di provenienza.
 */
export type EventoStream =
  /**
   * `messaggioUtenteId` è l'id con cui il server ha registrato il messaggio
   * appena inviato: il client lo usa per riconciliare la propria copia
   * ottimistica, così un ricaricamento a stream aperto non la duplica.
   */
  | { tipo: 'inizio'; messaggioId: Id; messaggioUtenteId: Id }
  /**
   * Un passo di lavoro del motore («Cerco "cristalli" in condizioni.md»,
   * «Leggo dip.md»): l'utente vede il lavoro, non uno spinner. Arriva prima
   * del testo e può ripetersi; l'ultimo ricevuto è quello da mostrare.
   */
  | { tipo: 'attivita'; etichetta: string }
  | { tipo: 'testo'; delta: string }
  | { tipo: 'citazione'; citazione: Citazione }
  | { tipo: 'provenienza'; provenienza: Provenienza }
  | { tipo: 'non-supportato' }
  | { tipo: 'fine' }
  | { tipo: 'errore'; messaggio: string };

/** Corpo della richiesta di invio messaggio. */
export interface NuovoMessaggio {
  testo: string;
  documentiReferenziati: Id[];
}
