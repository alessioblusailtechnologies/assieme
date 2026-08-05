import { Directive, input } from '@angular/core';

export type VarianteBottone = 'primario' | 'secondario' | 'testo' | 'pericolo';

/**
 * Bottone del design system.
 *
 * Direttiva su elementi nativi, non un componente: un'azione può essere un
 * `<button>` o un `<a>` — la differenza è semantica e deve restare visibile
 * nel template. Lo stile vive in `styles/_ui.scss`, in un punto solo.
 *
 * Il primario è **scuro e pieno, uno per schermata**: il gesto principale si
 * riconosce prima di leggerlo. Tutto il resto è secondario o testo.
 */
@Directive({
  selector: 'button[uiBottone], a[uiBottone]',
  host: {
    class: 'ui-bottone',
    '[class.is-primario]': 'variante() === "primario"',
    '[class.is-secondario]': 'variante() === "secondario"',
    '[class.is-testo]': 'variante() === "testo"',
    '[class.is-pericolo]': 'variante() === "pericolo"',
    '[class.is-piccolo]': 'dimensione() === "piccolo"',
  },
})
export class Bottone {
  readonly variante = input<VarianteBottone>('secondario');
  readonly dimensione = input<'normale' | 'piccolo'>('normale');
}
