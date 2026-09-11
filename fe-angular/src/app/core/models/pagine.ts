import { IsoDateTime } from './comune';

/**
 * Il link di un documento generato, da mandare al cliente (11/09/2026, fase
 * 2 di `PIANO-LINK-E-FORMATI.md`): chi ce l'ha vede il documento, dal
 * telefono, finché non scade o l'agenzia non lo revoca.
 *
 * Specchio di `be-node/src/contratto/pagine.ts`.
 */
export interface LinkDocumento {
  url: string;
  /** null = nessuna scadenza. */
  scadeIl: IsoDateTime | null;
  creatoIl: IsoDateTime;
}

/** Le durate che si scelgono dal documento; null = nessuna scadenza. */
export const DURATE_LINK: { giorni: number | null; etichetta: string }[] = [
  { giorni: 7, etichetta: '7 giorni' },
  { giorni: 30, etichetta: '30 giorni' },
  { giorni: 90, etichetta: '90 giorni' },
  { giorni: null, etichetta: 'Nessuna scadenza' },
];
