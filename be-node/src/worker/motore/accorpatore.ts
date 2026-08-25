/**
 * I delta di testo del modello arrivano a raffica (parole, sillabe) e ognuno,
 * scritto com'è, è un giro verso Postgres (evento + NOTIFY): quando il
 * database ritarda si accumulano e poi escono a blocchi — lo stream «a
 * scatti». Qui si accorpano per una manciata di millisecondi e si scrivono
 * come un evento solo: meno righe, chunk regolari, stesso replay.
 *
 * Le scritture restano in ordine (una catena), e chi emette un evento di
 * altro tipo deve prima svuotare: il testo precede sempre ciò che lo segue.
 */
export class AccorpatoreTesto {
  private buffer = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private catena: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly invia: (delta: string) => Promise<unknown>,
    private readonly intervalloMs = 80,
    private readonly maxCaratteri = 600,
  ) {}

  /** Accoda un delta; parte da solo entro `intervalloMs`, o subito oltre `maxCaratteri`. */
  aggiungi(delta: string): Promise<void> {
    this.buffer += delta;
    if (this.buffer.length >= this.maxCaratteri) return this.svuota();
    if (this.timer === undefined) {
      this.timer = setTimeout(() => {
        void this.svuota();
      }, this.intervalloMs);
    }
    return Promise.resolve();
  }

  /** Scrive subito ciò che c'è, e aspetta che sia scritto. */
  async svuota(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.buffer) {
      const testo = this.buffer;
      this.buffer = '';
      this.catena = this.catena.then(() => this.invia(testo));
    }
    await this.catena;
  }
}
