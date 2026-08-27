import { Citazione } from './citazione';
import { Archivio, TipologiaDocumento } from './documento';
import { Id, IsoDateTime, ValoreEstratto } from './comune';

/**
 * Tabelle di analisi (RF-C-11…C-15).
 *
 * Righe = documenti selezionati dai due archivi. Colonne = criteri di
 * estrazione. Ogni cella è un `ValoreEstratto`, quindi porta con sé la
 * citazione o la dichiarazione di assenza — non è possibile costruire una
 * cella che afferma qualcosa senza dire da dove viene (RF-C-12).
 */

export interface TabellaAnalisi {
  id: Id;
  titolo: string;
  creataIl: IsoDateTime;
  aggiornataIl: IsoDateTime;
  autoreId: Id;
  /**
   * RF-C-15: visibile agli altri utenti del tenant, in sola lettura. Chi
   * vuole proseguirci sopra la duplica; la copia è sua e nasce non condivisa.
   */
  condivisa: boolean;
  colonne: ColonnaTabella[];
  /** I documenti stanno qui, uno per riga: non esiste un elenco separato che possa divergere. */
  righe: RigaTabella[];
  /** La generazione è progressiva: la tabella si popola sotto gli occhi. */
  stato: 'in-generazione' | 'completa' | 'errore';
}

/**
 * La riga di elenco: quanto basta a scegliere quale tabella aprire, senza
 * trascinarsi dietro righe e celle — che su una tabella vera sono chili di
 * citazioni.
 */
export interface TabellaRiepilogo {
  id: Id;
  titolo: string;
  creataIl: IsoDateTime;
  aggiornataIl: IsoDateTime;
  autoreId: Id;
  condivisa: boolean;
  stato: TabellaAnalisi['stato'];
  numeroDocumenti: number;
  numeroColonne: number;
}

/**
 * Colonna: un criterio di estrazione.
 *
 * RF-C-11 prevede due origini — set predefiniti per ramo (garanzie,
 * massimali, franchigie, scoperti, esclusioni) e colonne personalizzate
 * espresse in linguaggio naturale. La distinzione conta per l'interfaccia:
 * una colonna personalizzata si può riscrivere, una predefinita no.
 */
export interface ColonnaTabella {
  id: Id;
  intestazione: string;
  origine: 'predefinita' | 'personalizzata';
  /** Per le personalizzate: il criterio così come l'utente l'ha scritto. */
  criterio?: string;
}

export interface RigaTabella {
  documentoId: Id;
  /** Da quale archivio viene: serve al collegamento verso la scheda. */
  archivio: Archivio;
  /** Etichetta di riga già pronta: compagnia + prodotto, o titolo del privato. */
  etichetta: string;
  /**
   * Che documento è (DIP, condizioni, preventivo…): l'etichetta da sola non
   * distingue tre documenti dello stesso prodotto. Facoltativa perché le
   * tabelle salvate prima non la portano.
   */
  tipologia?: TipologiaDocumento;
  /** Chiave = `ColonnaTabella.id`. */
  celle: Record<Id, CellaTabella>;
}

/**
 * Cella.
 *
 * `in-attesa` non è uno stato di errore ma il caso normale durante la
 * generazione: la griglia è già in pagina e le celle si riempiono una alla
 * volta. Progettarla senza questo stato significa dover rifare la schermata
 * quando ci si accorge che una tabella da 12 documenti × 8 colonne non
 * compare tutta insieme.
 *
 * La citazione è quella **completa**, con posizione ed estratto: da ogni
 * cella si apre il documento sul passaggio di origine, come dai messaggi
 * della chat (RF-C-12 insieme a RF-C-05).
 */
export type CellaTabella =
  | { stato: 'in-attesa' }
  | ({ stato: 'pronta' } & ValoreEstratto<string, Citazione>);

/**
 * Un criterio dei set predefiniti (RF-C-11): il server li propone in base ai
 * rami dei documenti scelti, e l'utente li spunta invece di riscriverli.
 */
export interface CriterioPredefinito {
  id: Id;
  intestazione: string;
  /** Cosa estrae, mostrato come aiuto alla scelta. */
  descrizione: string;
  /** Assente sui criteri validi per qualunque ramo. */
  ramoId?: Id;
}

/** Colonna così come la manda il client: l'id lo assegna il server. */
export type NuovaColonna = Omit<ColonnaTabella, 'id'>;

/** Corpo della richiesta di creazione. */
export interface NuovaTabella {
  /** Se manca, il server lo ricava dai documenti scelti. */
  titolo?: string;
  documentiIds: Id[];
  colonne: NuovaColonna[];
}

/** Corpo del PATCH: rinomina (RF-C-14) e condivisione nel tenant (RF-C-15). */
export interface ModificheTabella {
  titolo?: string;
  condivisa?: boolean;
}
