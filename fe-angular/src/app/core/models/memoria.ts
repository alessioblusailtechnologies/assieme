import { Id, IsoDateTime } from './comune';

/**
 * Memoria persistente (Modulo G).
 *
 * RF-G-03 chiede che sia trasparente e controllabile: consultabile,
 * modificabile e cancellabile ricordo per ricordo. Non è una richiesta
 * accessoria — una memoria opaca su dati di clienti finali genera diffidenza
 * invece di fiducia, e RF-G-05 le pone limiti espliciti di contenuto e
 * retention.
 */

export interface Ricordo {
  id: Id;
  testo: string;
  /**
   * RF-G-02: memoria di tenant (condivisa in agenzia) o personale del
   * singolo utente. La distinzione va mostrata: un ricordo che vale per
   * tutta l'agenzia ha conseguenze diverse da una preferenza individuale.
   */
  ambito: 'tenant' | 'personale';
  categoria: 'prassi' | 'cliente' | 'preferenza' | 'decisione' | 'altro';
  /*
   * Nessun campo `origine`: senza registrazione esplicita (RF-G-07 rimosso
   * su indicazione del committente) ogni ricordo è appreso dal lavoro, e un
   * discriminante con un valore solo è rumore di contratto.
   */
  /** Da quale conversazione o esecuzione è emerso, per poterlo verificare. */
  origineConversazioneId?: Id;
  creatoIl: IsoDateTime;
  aggiornatoIl: IsoDateTime;
  /** Un ricordo si può sospendere senza cancellarlo. */
  attivo: boolean;
}

/** Corpo del PATCH: ogni campo è indipendente. */
export type ModificheRicordo = Partial<
  Pick<Ricordo, 'testo' | 'ambito' | 'categoria' | 'attivo'>
>;
