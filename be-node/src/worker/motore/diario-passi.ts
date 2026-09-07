import type { Passo } from '../../contratto/conversazioni.js';

/**
 * Il diario dei passi di una risposta: che cosa ha fatto il motore, in
 * ordine, con quanto ci ha messo.
 *
 * Gli stessi passi scorrono dal vivo sul flusso SSE perché l'utente non
 * resti due minuti davanti a uno spinner; qui si accumulano anche per
 * restare col messaggio. Le citazioni dicono da dove viene ogni frase, i
 * passi dicono dove il motore ha guardato prima di sceglierle — comprese le
 * strade che non hanno portato a niente, che sono quelle che spiegano una
 * risposta storta.
 *
 * La regola che vale la pena isolare è una: **la durata di un passo la
 * scrive il passo successivo**. Mentre un passo è in corso non si sa quanto
 * durerà, e inventare una stima sarebbe peggio che lasciare il campo vuoto.
 * L'ultimo lo chiude `chiudi()`, alla fine della risposta.
 */
export class DiarioPassi {
  private readonly passi: Passo[] = [];

  /** L'orologio si inietta: i test non aspettano davvero due secondi. */
  constructor(private readonly ora: () => number = Date.now) {}

  /**
   * Registra un passo che comincia adesso, chiudendo il precedente.
   * Restituisce l'istante scelto, che va anche sull'evento dal vivo: il
   * cronometro che si vede durante l'attesa e quello che resta nel messaggio
   * devono dire lo stesso numero.
   */
  apri(etichetta: string, strumento?: string): string {
    const adesso = this.ora();
    this.chiudiUltimo(adesso);
    const istante = new Date(adesso).toISOString();
    this.passi.push({ etichetta, ...(strumento && { strumento }), istante });
    return istante;
  }

  /** Chiude l'ultimo passo rimasto aperto: il motore non lavora più. */
  chiudi(): void {
    this.chiudiUltimo(this.ora());
  }

  /** Il diario, da salvare col messaggio. */
  elenco(): Passo[] {
    return this.passi;
  }

  private chiudiUltimo(fine: number): void {
    const ultimo = this.passi.at(-1);
    if (!ultimo || ultimo.durataMs !== undefined) return;
    /* Mai negativa: fra un orologio che torna indietro e una durata assurda
       nell'interfaccia, meglio uno zero onesto. */
    ultimo.durataMs = Math.max(0, fine - Date.parse(ultimo.istante));
  }
}
