import { MARCATORE_CITAZIONI } from './regole.js';
import { limiteInoltro } from './validazione.js';

export type PassoTesto =
  | { tipo: 'attivita'; etichetta: string }
  | { tipo: 'testo'; delta: string };

/** Sotto questa lunghezza un testo fra due tool è narrazione, non risposta. */
export const SOGLIA_TESTO_FINALE = 300;

/**
 * Nei testi di Velia il trattino lungo non si usa: come separatore si scrive
 * il trattino semplice. La regola sta anche nei prompt, ma non basta: il
 * 09/09/2026, sulla stessa domanda, l'hanno disattesa quattro modelli su
 * quattro (Opus, GLM, Gemini, e il prompt di sistema che li istruisce ne è
 * pieno a sua volta). Una regola di forma che dipende dal fornitore del
 * mese non è una regola, quindi la fa rispettare il codice.
 *
 * Sostituzione uno a uno, senza toccare gli spazi attorno: così vale anche
 * sui delta dello streaming, che tagliano la frase dove capita, e non
 * sposta gli indici di chi sta ancora affettando il buffer.
 *
 * Non tocca il blocco delle citazioni: lì gli `estratto` sono testo
 * letterale dei documenti, e riscriverne la punteggiatura vorrebbe dire non
 * ritrovarli più nel file.
 */
export function senzaTrattiniLunghi(testo: string): string {
  return testo.replace(/[—–]/g, '-');
}

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

/**
 * I marcatori con cui certi modelli scrivono il ragionamento dentro al
 * testo, invece che in un blocco di pensiero a parte: Mistral su HostYourAI
 * manda `[THINK]…[/THINK]`, altri modelli aperti `<think>…</think>`.
 */
const MARCATORI_PENSIERO = [
  { apre: '[think]', chiude: '[/think]' },
  { apre: '<think>', chiude: '</think>' },
] as const;

const APERTURE = MARCATORI_PENSIERO.map((m) => m.apre);
const CHIUSURE = MARCATORI_PENSIERO.map((m) => m.chiude);

/**
 * Toglie il ragionamento dal flusso prima che diventi risposta (RF-D-03).
 * Un gateway terzo non sempre separa il pensiero dal testo: se passasse,
 * l'utente leggerebbe il modello che parla a sé stesso, e il validatore
 * cercherebbe le citazioni lì dentro.
 *
 * Lavora sui delta, che tagliano i marcatori a metà: quel che potrebbe
 * essere l'inizio di un marcatore si trattiene fino al delta dopo. Pura, e
 * accesa solo per i fornitori terzi: da Anthropic il pensiero arriva già a
 * parte, e `<think>` sarebbe solo testo di un utente che ne parla.
 */
export class FiltroPensieri {
  /** Il marcatore di chiusura atteso, quando si è dentro un pensiero. */
  private chiusura: string | undefined;
  private coda = '';

  /** Il testo da mostrare, dal delta appena arrivato. */
  filtra(delta: string): string {
    this.coda += delta;
    let fuori = '';
    for (;;) {
      if (this.chiusura) {
        const i = indiceMarcatore(this.coda, [this.chiusura]);
        if (!i) {
          this.coda = codaAmbigua(this.coda, [this.chiusura]);
          return fuori;
        }
        this.coda = this.coda.slice(i.fine);
        this.chiusura = undefined;
        continue;
      }
      const marcatore = indiceMarcatore(this.coda, [...APERTURE, ...CHIUSURE]);
      if (!marcatore) {
        const tenuta = codaAmbigua(this.coda, [...APERTURE, ...CHIUSURE]);
        fuori += this.coda.slice(0, this.coda.length - tenuta.length);
        this.coda = tenuta;
        return fuori;
      }
      fuori += this.coda.slice(0, marcatore.inizio);
      this.coda = this.coda.slice(marcatore.fine);
      /* Una chiusura senza apertura è la coda di un pensiero cominciato dove
         non l'abbiamo visto (un altro blocco del messaggio): si butta anche
         quella, o l'utente si ritrova un `[/THINK]` in testa alla risposta. */
      this.chiusura = MARCATORI_PENSIERO.find((m) => m.apre === marcatore.marcatore)?.chiude;
    }
  }

  /** Fine turno: esce quel che si tratteneva; un pensiero mai chiuso si butta. */
  svuota(): string {
    const resto = this.chiusura ? '' : this.coda;
    this.coda = '';
    this.chiusura = undefined;
    return resto;
  }
}

/** Il primo marcatore nel testo (confronto senza maiuscole). */
function indiceMarcatore(
  testo: string,
  marcatori: readonly string[],
): { inizio: number; fine: number; marcatore: string } | undefined {
  const basso = testo.toLowerCase();
  let trovato: { inizio: number; fine: number; marcatore: string } | undefined;
  for (const m of marcatori) {
    const i = basso.indexOf(m);
    if (i !== -1 && (!trovato || i < trovato.inizio)) trovato = { inizio: i, fine: i + m.length, marcatore: m };
  }
  return trovato;
}

/** La coda che potrebbe essere l'inizio di un marcatore tagliato dal delta. */
function codaAmbigua(testo: string, marcatori: readonly string[]): string {
  const massimo = Math.max(...marcatori.map((m) => m.length)) - 1;
  for (let k = Math.min(massimo, testo.length); k > 0; k -= 1) {
    const coda = testo.slice(-k).toLowerCase();
    if (marcatori.some((m) => m.startsWith(coda))) return testo.slice(-k);
  }
  return '';
}

export function accorcia(testo: string, n: number): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito.length <= n ? pulito : `${pulito.slice(0, n - 1).trimEnd()}…`;
}
