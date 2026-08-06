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
  /**
   * Come è nato: dedotto dal sistema (RF-G-01) o dettato da una persona.
   * La registrazione esplicita non ha più un'interfaccia (RF-G-07 rimosso su
   * indicazione del committente), ma la distinzione resta nel contratto: i
   * ricordi dettati in passato — o da flussi futuri del backend — hanno
   * un'autorevolezza che un'inferenza non ha, e l'interfaccia la mostra.
   */
  origine: 'appreso' | 'esplicito';
  /** Da quale conversazione o esecuzione è emerso, per poterlo verificare. */
  origineConversazioneId?: Id;
  creatoIl: IsoDateTime;
  aggiornatoIl: IsoDateTime;
  /** Un ricordo si può sospendere senza cancellarlo. */
  attivo: boolean;
}

/**
 * Corpo del PATCH: ogni campo è indipendente. Modificare il testo di un
 * ricordo appreso non ne cambia l'origine — resta «appreso», perché la
 * distinzione racconta come è nato, non com'è oggi.
 */
export type ModificheRicordo = Partial<
  Pick<Ricordo, 'testo' | 'ambito' | 'categoria' | 'attivo'>
>;
