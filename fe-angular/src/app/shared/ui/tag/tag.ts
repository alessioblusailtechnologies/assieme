import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Le varianti dicono il significato, non il colore: `accento` per
 * l'appartenenza che va notata («in uso», «sei tu»), le tre di severità per
 * la classificazione che porta un giudizio. Se domani un colore cambia, si
 * cambia qui, non nei template.
 */
export type VarianteTag = 'neutro' | 'accento' | 'positivo' | 'attenzione' | 'negativo';

/**
 * Tag: la chip di classificazione del design system — tipologie di
 * documento, categorie della memoria, appartenenze. Stessa lingua
 * dell'etichetta di stato (`ui-etichetta-stato`): pillola su fondo neutro,
 * mono maiuscolo; qui senza icona, perché una tipologia si nomina e basta.
 * Il fondo non porta mai la severità — quando serve, la portano il testo
 * e la variante.
 */
@Component({
  selector: 'ui-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    '[class]': '"is-" + variante()',
  },
  /* Gli stili stanno su `:host`, non su una classe interna: con
     l'incapsulamento emulato un selettore di classe non raggiunge mai
     l'elemento ospite, e il tag resterebbe testo nudo. */
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      padding: 2px 10px;
      border-radius: var(--radius-pieno);
      background: var(--c-page);
      color: var(--c-text-3);
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      white-space: nowrap;
    }

    :host(.is-accento) {
      color: var(--c-accent);
    }

    :host(.is-positivo) {
      color: var(--c-stato-pronto);
    }

    :host(.is-attenzione) {
      color: var(--c-stato-corso);
    }

    :host(.is-negativo) {
      color: var(--c-stato-errore);
    }
  `,
})
export class Tag {
  readonly variante = input<VarianteTag>('neutro');
}
