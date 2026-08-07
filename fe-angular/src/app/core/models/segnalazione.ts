import { Id, IsoDateTime } from './comune';

/**
 * Segnalazioni sull'Archivio Pubblico (RF-A-08).
 *
 * L'archivio lo mantiene Velia, ma chi lo usa tutti i giorni è il primo ad
 * accorgersi quando qualcosa non torna: un set che manca, un'edizione
 * superata, un errore. La segnalazione è il canale verso il gestore della
 * piattaforma — una riga, non un ticket con stati e assegnatari.
 */

export type TipoSegnalazione = 'mancante' | 'obsoleto' | 'errato';

export interface NuovaSegnalazione {
  tipo: TipoSegnalazione;
  messaggio: string;
  /** Assente per «manca un documento»: non c'è la riga da indicare. */
  documentoId?: Id;
}

/** La risposta del backend: la segnalazione registrata. */
export interface Segnalazione extends NuovaSegnalazione {
  id: Id;
  creataIl: IsoDateTime;
}
