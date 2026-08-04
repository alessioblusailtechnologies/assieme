import { Prodotto } from '@core/models';

/**
 * Righe della griglia dell'archivio.
 *
 * AG Grid Community non ha il master/detail — è funzionalità Enterprise —
 * ma ha le **righe a tutta larghezza**, che bastano: l'elenco è una lista
 * piatta in cui, subito dopo un prodotto aperto, compare una riga che ne
 * mostra i documenti.
 *
 * L'unione discriminata su `tipo` è ciò che permette a `isFullWidthRow` di
 * riconoscere le due forme senza indovinare dalla presenza di un campo.
 */
export type RigaArchivio =
  | { tipo: 'prodotto'; prodotto: Prodotto }
  | { tipo: 'documenti'; prodotto: Prodotto };

/**
 * Identità stabile della riga.
 *
 * Serve a `getRowId`: senza, aprire un prodotto farebbe ricreare tutte le
 * righe invece delle sole cambiate, con lo sfarfallio che ne consegue.
 */
export function idRiga(riga: RigaArchivio): string {
  return riga.tipo === 'prodotto' ? riga.prodotto.id : `doc:${riga.prodotto.id}`;
}
