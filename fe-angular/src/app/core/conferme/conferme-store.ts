import { Injectable, signal } from '@angular/core';

/** Che cosa si sta per fare, detto a chi deve confermarlo. */
export interface RichiestaConferma {
  /** Il titolo della finestra: «Eliminare «Proposta breve»?». */
  titolo: string;
  /** Che cosa succede davvero, in una riga: l'irreversibile va scritto. */
  dettaglio?: string;
  /** Il verbo sul pulsante che conferma. Il default è quello che si usa qui. */
  conferma?: string;
  /** Il verbo sul pulsante che annulla. */
  annulla?: string;
  /**
   * Il tono dell'azione. `pericolo` è tutto ciò che cancella: il pulsante
   * diventa rosso e il fuoco parte dall'annulla, che è la scelta prudente.
   */
  tono?: 'pericolo' | 'neutro';
}

/** La domanda in attesa di risposta, con chi la scioglie. */
interface ConfermaInAttesa extends RichiestaConferma {
  id: number;
  rispondi: (scelta: boolean) => void;
}

/**
 * Le conferme dell'applicazione.
 *
 * Chi sta per cancellare qualcosa chiama `chiedi` e aspetta un `true`: la
 * finestra la mostra `ui-conferma`, montata una volta sola nella radice.
 * Prima di oggi (12/09/2026) ogni schermata se la cavava da sé armando il
 * proprio pulsante - un primo clic lo faceva diventare rosso, il secondo
 * eliminava. Nessuno capiva che il primo clic non avesse fatto niente, e un
 * pulsante che cambia significato sotto il dito è il modo peggiore di
 * chiedere il permesso.
 *
 * Una domanda per volta: due finestre sovrapposte non si leggono, e una
 * seconda richiesta scioglie la prima con un «no» - che è la risposta
 * giusta per una domanda che nessuno ha letto.
 */
@Injectable({ providedIn: 'root' })
export class ConfermeStore {
  private progressivo = 0;

  /** La domanda a schermo, se ce n'è una. */
  readonly inCorso = signal<ConfermaInAttesa | undefined>(undefined);

  /** Chiede conferma: risolve `true` solo se l'utente conferma davvero. */
  chiedi(richiesta: RichiestaConferma): Promise<boolean> {
    /* Una domanda rimasta aperta si chiude con un no: chi la stava leggendo
       ora ha un'altra finestra davanti, e nessuno risponde a ciò che non
       vede più. */
    this.inCorso()?.rispondi(false);

    return new Promise<boolean>((risolvi) => {
      const id = ++this.progressivo;
      this.inCorso.set({
        ...richiesta,
        id,
        rispondi: (scelta) => {
          /* Solo la domanda ancora a schermo può rispondere: una sciolta
             dalla successiva non deve cancellarla mentre si apre. */
          if (this.inCorso()?.id !== id) return;
          this.inCorso.set(undefined);
          risolvi(scelta);
        },
      });
    });
  }

  /** La risposta, dalla finestra: conferma o annulla. */
  rispondi(scelta: boolean): void {
    this.inCorso()?.rispondi(scelta);
  }
}
