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
  condivisa: boolean;
  documentiIds: Id[];
  colonne: ColonnaTabella[];
  righe: RigaTabella[];
  /** La generazione è progressiva: la tabella si popola sotto gli occhi. */
  stato: 'in-generazione' | 'completa' | 'errore';
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
  /** Etichetta di riga già pronta: compagnia + prodotto, o titolo del privato. */
  etichetta: string;
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
 */
export type CellaTabella = { stato: 'in-attesa' } | ({ stato: 'pronta' } & ValoreEstratto);

/** Corpo della richiesta di creazione. */
export interface NuovaTabella {
  titolo: string;
  documentiIds: Id[];
  colonne: Omit<ColonnaTabella, 'id'>[];
}
