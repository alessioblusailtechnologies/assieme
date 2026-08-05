import { Directive } from '@angular/core';

/**
 * Campo di testo del design system: la classe sta in `styles/_ui.scss`.
 * Direttiva su elementi nativi — l'input resta un input, con i suoi eventi,
 * la sua accessibilità e il suo autocompletamento.
 */
@Directive({
  selector: 'input[uiCampo], textarea[uiCampo]',
  host: { class: 'ui-campo' },
})
export class Campo {}
