import { Id, IsoDateTime } from './comune';

/**
 * Il cliente (`PIANO-CLIENTI.md`, 12/09/2026).
 *
 * Nato in Fase 10 come supporto della collocazione automatica — sapere che
 * «ROSSI M.» è «Rossi Mario» — diventa l'entità portante dell'Archivio
 * Privato: la cartella non c'è più, e il documento non sta da qualche
 * parte, è **di qualcuno**.
 *
 * Le etichette restano, e cambiano mestiere una seconda volta: dicono
 * com'è un documento (da rinnovare, urgente) o com'è un cliente (in
 * rinnovo, da richiamare). Due assi, due strumenti.
 */
export interface Cliente {
  id: Id;
  nome: string;
  tipo: 'persona' | 'azienda';
  codiceFiscale?: string;
  partitaIva?: string;
  /** Le forme con cui compare nei documenti: si imparano usando il sistema. */
  alias: string[];
  email?: string;
  telefono?: string;
  indirizzo?: string;
  /** Solo la data, senza ora: un compleanno non ha un fuso orario. */
  natoIl?: string;
  note?: string;
  etichette: string[];
  stato: 'attivo' | 'archiviato';
  documenti: number;
  creatoIl: IsoDateTime;
}

/**
 * La scheda: il cliente più ciò che di lui non si vede altrove.
 *
 * I suoi documenti non stanno qui — si chiedono all'archivio con
 * `clienteId`, che sa già cercare e paginare — ma di che cosa si è parlato,
 * quali canali sono aperti e che cosa sta per scadere sì.
 */
export interface SchedaCliente extends Cliente {
  conversazioni: { id: Id; titolo: string; aggiornataIl: IsoDateTime }[];
  chat: { totale: number; attive: number };
  scadenze: { documentoId: Id; titolo: string; numeroPolizza?: string; scadenza: string }[];
}
