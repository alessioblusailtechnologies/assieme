import { Directive, input } from '@angular/core';

/** Da che parte del bersaglio compare il fumetto. */
export type PosizioneSuggerimento = 'sopra' | 'sotto';

/**
 * Suggerimento al passaggio (tooltip).
 *
 * Interamente in CSS (`styles/_ui.scss`): la direttiva posa il testo in
 * `data-suggerimento` e il fumetto compare su hover e su fuoco da tastiera.
 * Con testo vuoto l'attributo non c'è e il fumetto nemmeno: chi lo usa non
 * deve gestire il caso "niente da dire".
 *
 * Di norma sale sopra il bersaglio. Vicino al bordo alto di un'area che
 * scorre (la testata di una scheda, l'intestazione appiccicosa di una
 * tabella) salire vuol dire finire tagliati dal contenitore: lì si chiede
 * `sotto`.
 */
@Directive({
  selector: '[uiSuggerimento]',
  host: {
    '[attr.data-suggerimento]': 'testo() || null',
    '[attr.data-suggerimento-posizione]': 'posizione() === "sotto" ? "sotto" : null',
  },
})
export class Suggerimento {
  readonly testo = input<string>('', { alias: 'uiSuggerimento' });
  readonly posizione = input<PosizioneSuggerimento>('sopra', { alias: 'uiSuggerimentoPosizione' });
}
