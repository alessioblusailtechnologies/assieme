import { MARCATORE_CITAZIONI } from './regole.js';
import { limiteInoltro } from './validazione.js';

export type PassoTesto =
  | { tipo: 'attivita'; etichetta: string }
  | { tipo: 'testo'; delta: string };

/** Sotto questa lunghezza un testo fra due tool è narrazione, non risposta. */
export const SOGLIA_TESTO_FINALE = 300;

/**
 * Il testo dell'assistente mentre arriva, turno per turno — la parte del
 * motore che decide cosa vede l'utente e quando. Pura: riceve i delta e le
 * chiusure di turno, emette passi; così si prova senza SDK.
 *
 * Regole:
 * - il testo di un turno che finisce con `tool_use` è narrazione («Cerco
 *   nelle condizioni…») e diventa un'attività — a meno che non superi la
 *   soglia, allora è già la risposta e si inoltra man mano;
 * - il testo dell'ultimo turno è la risposta: si inoltra man mano oltre la
 *   soglia e tutto a fine turno, **mai oltre l'inizio del blocco finale**,
 *   trattenendo la coda che potrebbe esserne l'inizio;
 * - `testoVisibile` è ciò che l'utente ha visto (e che si persiste),
 *   `testoCompleto` aggiunge il blocco finale non inoltrato (lo legge il
 *   validatore).
 */
export class FlussoTesto {
  private visibile = '';
  private buffer = '';
  private inviato = 0;
  private inStreaming = false;
  private coda = '';
  private fontiAnnunciate = false;

  constructor(
    private readonly emetti: (p: PassoTesto) => Promise<void>,
    private readonly soglia = SOGLIA_TESTO_FINALE,
  ) {}

  get testoVisibile(): string {
    return this.visibile;
  }

  /** Visibile + blocco finale trattenuto (se c'è): il testo da validare. */
  get testoCompleto(): string {
    return this.visibile + this.coda;
  }

  inizioTurno(): void {
    this.buffer = '';
    this.inviato = 0;
    this.inStreaming = false;
    this.coda = '';
    this.fontiAnnunciate = false;
  }

  async delta(testo: string): Promise<void> {
    this.buffer += testo;
    /* Il marcatore dice due cose: questo è l'ultimo turno (si inoltra tutto
       il visibile, anche sotto soglia) e da qui in poi il modello scrive il
       blocco delle citazioni, che l'utente non vede — senza un'attività
       sembrerebbe tutto fermo. L'annuncio va DOPO l'ultimo testo: un testo
       successivo lo spegnerebbe. */
    if (!this.fontiAnnunciate && this.buffer.includes(MARCATORE_CITAZIONI)) {
      this.fontiAnnunciate = true;
      this.inStreaming = true;
      await this.inoltra(limiteInoltro(this.buffer));
      await this.emetti({ tipo: 'attivita', etichetta: 'Raccolgo le fonti della risposta' });
      return;
    }
    if (this.inStreaming || this.buffer.length >= this.soglia) {
      this.inStreaming = true;
      await this.inoltra(limiteInoltro(this.buffer));
    }
  }

  /** Il turno è finito: `tool_use` = ne segue un altro, altrimenti è l'ultimo. */
  async fineTurno(stopReason: string | null | undefined): Promise<void> {
    const limite = limiteInoltro(this.buffer);
    if (stopReason === 'tool_use') {
      if (!this.inStreaming) {
        const narrazione = this.buffer.slice(0, limite).trim();
        if (narrazione) await this.emetti({ tipo: 'attivita', etichetta: accorcia(narrazione, 140) });
        return;
      }
      /* Era già risposta e ne seguirà altra dopo il tool: si chiude il
         pezzo e si separa dal prossimo, sotto gli occhi dell'utente. */
      await this.inoltra(limite);
      if (this.inviato > 0) {
        this.visibile += '\n\n';
        await this.emetti({ tipo: 'testo', delta: '\n\n' });
      }
      return;
    }
    await this.inoltra(limite);
    this.coda = this.buffer.slice(limite);
  }

  private async inoltra(finoA: number): Promise<void> {
    if (finoA <= this.inviato) return;
    const delta = this.buffer.slice(this.inviato, finoA);
    this.inviato = finoA;
    this.visibile += delta;
    await this.emetti({ tipo: 'testo', delta });
  }
}

export function accorcia(testo: string, n: number): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito.length <= n ? pulito : `${pulito.slice(0, n - 1).trimEnd()}…`;
}
