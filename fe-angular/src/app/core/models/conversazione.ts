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
/**
 * Come si carica un allegato dal composer: nell'archivio con la lettura
 * completa, o rapido e legato alla conversazione (RF-C-02).
 */
export type ModoAllegato = 'archivio' | 'rapido';

/** Dov'è arrivata la lettura di un documento. */
export type StatoDocumento = 'in-coda' | 'in-elaborazione' | 'pronto' | 'errore';

/** Lo stato della lettura di un allegato di conversazione. */
export interface StatoAllegato {
  stato: StatoDocumento;
  erroreElaborazione?: string;
}

/**
 * Il set informativo di cui un documento pubblico fa parte: il prodotto in
 * una sua edizione (12/09/2026) - specchio di
 * `be-node/src/contratto/conversazioni.ts`.
 *
 * Il contesto resta fatto di documenti, ma chi lo guarda vede prodotti: i
 * documenti che portano la stessa `chiave` sono un chip solo nel composer e
 * una riga sola nel pannello, e si tolgono insieme.
 */
export interface SetDiRiferimento {
  /** La stessa chiave dell'elenco per set: compagnia + prodotto + edizione. */
  chiave: string;
  prodotto: string;
  compagnia: string;
  /** Es. «ed. 04/2026». */
  edizione: string;
  /** Falso su un'edizione superata: il chip lo dice (RF-A-04). */
  corrente: boolean;
}

export interface RiferimentoDocumento {
  id: Id;
  titolo: string;
  archivio: Archivio | 'conversazione';
  /** Il set di cui fa parte, sui documenti dell'Archivio Pubblico. */
  set?: SetDiRiferimento;
  /**
   * Dov'è arrivata la lettura, così com'era quando il contesto è stato
   * idratato. Serve a chi ricarica la pagina mentre un allegato è ancora in
   * lavorazione: il chip riprende a girare invece di fingere che sia pronto.
   */
  stato?: StatoDocumento;
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
  /**
   * C'è una risposta in volo per questa conversazione: il motore sta ancora
   * lavorando, anche se questa finestra non era in ascolto. Lo storico
   * accende il suo indicatore e la chat si riaggancia al flusso.
   */
  rispostaInCorso?: boolean;
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
  /**
   * I documenti generati su template durante la risposta, su richiesta
   * dell'utente («esporta con Proposta breve»): da scaricare sotto il testo.
   */
  documenti?: DocumentoGenerato[];
  /**
   * Il riordino dell'Archivio Privato che l'assistente ha proposto in questa
   * risposta: sotto il testo compare una scheda con Approva e Annulla, e
   * finché nessuno decide non è successo niente.
   */
  proposta?: PropostaArchivio;
  /**
   * Come ci è arrivato: i passi del motore in ordine cronologico. Restano
   * col messaggio, quindi ci sono anche riaprendo la conversazione domani.
   */
  passi?: Passo[];
  /** Vero mentre lo streaming è in corso: il testo cresce, i pulsanti aspettano. */
  inCorso?: boolean;
}

/**
 * Un passo di lavoro del motore, nell'ordine in cui è avvenuto.
 *
 * Le citazioni dicono da dove viene ogni frase della risposta; i passi
 * dicono dove il motore ha guardato prima di sceglierle, comprese le strade
 * che non hanno portato a niente. È la differenza fra credere a una
 * risposta e poterla ricostruire.
 */
export interface Passo {
  /** La frase da mostrare, già in italiano: «Leggo «Nuova 4R»». */
  etichetta: string;
  /**
   * Lo strumento che l'ha prodotta (`Read`, `Grep`, `Glob`, `mcp__velia__…`):
   * decide l'icona. Assente sui passi che il motore racconta a parole sue.
   */
  strumento?: string;
  /** Quando è cominciato. */
  istante: IsoDateTime;
  /**
   * Quanto è durato: lo chiude il passo successivo, o la fine della
   * risposta. Manca sul passo ancora in corso e se la risposta si è
   * interrotta prima.
   */
  durataMs?: number;
}

/**
 * Un riordino **proposto**, mai eseguito.
 *
 * L'assistente legge l'archivio e non lo tocca: quando serve creare una
 * cartella o spostarci dentro un documento, lo chiede. La scheda dice per
 * intero che cosa succederebbe, e la scrittura parte solo dal clic
 * dell'utente. Uno stato diverso da `proposta` è una decisione già presa:
 * la scheda resta a raccontarla, senza più pulsanti.
 */
export interface PropostaArchivio {
  id: Id;
  operazioni: OperazioneArchivio[];
  stato: 'proposta' | 'applicata' | 'annullata';
  /** Perché, in una riga: quello che l'assistente dichiara di voler fare. */
  motivo?: string;
}

export type OperazioneArchivio =
  | {
      azione: 'crea-cartella';
      nome: string;
      /** Il percorso della cartella che la conterrà; assente = in cima all'archivio. */
      dentro?: string;
    }
  | {
      azione: 'sposta-documento';
      documentoId: Id;
      titolo: string;
      /** Il percorso di destinazione, anche se è una cartella di questa stessa proposta. */
      verso: string;
    };

/**
 * L'esito dell'approvazione. `mancate` non è un errore: elenca quello che nel
 * frattempo non si poteva più fare (una cartella eliminata da un collega).
 */
export interface EsitoProposta {
  proposta: PropostaArchivio;
  fatte: number;
  mancate: string[];
}

/** Un documento generato dal motore in chat: `url` è la rotta che lo serve. */
export interface DocumentoGenerato {
  id: Id;
  nome: string;
  /**
   * L'estensione del file. «Esporta come» fa PDF, Word ed Excel; «Genera da
   * modello» dall'11/09/2026 qualsiasi formato tranne gli eseguibili (pagine
   * web, immagini, PowerPoint, CSV, ZIP…).
   */
  formato: string;
  /** Il modello usato; assente col layout di VELIA. */
  modello?: string;
  url: string;
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
   * del testo e si ripete: l'ultimo ricevuto è quello in corso, e tutti
   * insieme sono la cronologia che resta poi in `Messaggio.passi`.
   *
   * `strumento` e `istante` sono additivi (07/09/2026): portano dal vivo
   * gli stessi valori che finiscono nel messaggio salvato, così la
   * cronologia in streaming e quella ricaricata coincidono.
   */
  | { tipo: 'attivita'; etichetta: string; strumento?: string; istante?: IsoDateTime }
  | { tipo: 'testo'; delta: string }
  | { tipo: 'citazione'; citazione: Citazione }
  | { tipo: 'provenienza'; provenienza: Provenienza }
  | { tipo: 'non-supportato' }
  /**
   * RF-G-01: la memoria impara durante la conversazione. Arriva dopo le
   * fonti e prima del `fine`, solo se qualcosa è stato imparato: la bolla
   * lo mostra e lo collega al pannello Memoria, dove si governa.
   */
  | { tipo: 'memoria'; ricordi: RicordoAppreso[] }
  /** Un documento generato durante la risposta: si mostra subito, da scaricare. */
  | { tipo: 'documento'; documento: DocumentoGenerato }
  /** Un riordino dell'archivio proposto durante la risposta: la scheda con Approva e Annulla. */
  | { tipo: 'proposta'; proposta: PropostaArchivio }
  | { tipo: 'fine' }
  | { tipo: 'errore'; messaggio: string };

/** Un ricordo appena appreso, nella forma minima che la bolla mostra. */
export interface RicordoAppreso {
  id: Id;
  testo: string;
  categoria: 'prassi' | 'cliente' | 'preferenza' | 'decisione' | 'altro';
  ambito: 'tenant' | 'personale';
}

/**
 * «Genera da modello» (11/09/2026): il messaggio chiede un documento, non
 * una risposta. Il motore documentale lavora in sandbox sul modello scelto
 * e consegna il file come `documento` della risposta, nel formato del
 * modello salvo `formato`. `messaggioId` è la risposta da impaginare.
 */
export interface EsportazioneElaborata {
  modelloId?: Id;
  /** L'estensione: qualsiasi formato tranne gli eseguibili. */
  formato?: string;
  messaggioId?: Id;
  istruzioni?: string;
}

/** Corpo della richiesta di invio messaggio. */
export interface NuovoMessaggio {
  testo: string;
  documentiReferenziati: Id[];
  esportazione?: EsportazioneElaborata;
  /** Il livello scelto nel composer, solo per questo messaggio; assente = quello dell'agenzia. */
  livello?: Id;
}

/**
 * «Invia email» sotto una risposta: `me` è l'indirizzo dell'utente
 * registrato, altrimenti un indirizzo scritto a mano. L'esito dice a chi è
 * partita; `simulata` solo negli ambienti senza provider (mai in produzione).
 */
export type DestinatarioEmail = 'me' | string;

export interface EsitoEmailRisposta {
  a: string;
  simulata: boolean;
}

/** «Scrivi il prompt» nel composer: l'abbozzo riscritto come richiesta completa. */
export interface RispostaPrompt {
  prompt: string;
}

/** La dettatura nel composer: l'audio registrato torna come testo. */
export interface RispostaTrascrizione {
  testo: string;
}
