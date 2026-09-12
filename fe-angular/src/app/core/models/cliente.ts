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
