import { Directive, input } from '@angular/core';

/**
 * Suggerimento al passaggio (tooltip).
 *
 * Interamente in CSS (`styles/_ui.scss`): la direttiva posa il testo in
 * `data-suggerimento` e il fumetto compare su hover e su fuoco da tastiera.
 * Con testo vuoto l'attributo non c'è e il fumetto nemmeno: chi lo usa non
 * deve gestire il caso "niente da dire".
 */
@Directive({
  selector: '[uiSuggerimento]',
  host: {
    '[attr.data-suggerimento]': 'testo() || null',
  },
})
export class Suggerimento {
  readonly testo = input<string>('', { alias: 'uiSuggerimento' });
}
