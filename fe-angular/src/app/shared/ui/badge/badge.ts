import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Varianti del badge, per **significato** e non per colore.
 *
 * Se domani "edizione corrente" deve smettere di essere verde si cambia il
 * CSS qui, non trenta template. Ed è il motivo per cui non esiste una
 * variante `verde`.
 */
export type VarianteBadge =
  | 'neutro'
  | 'accento'
  | 'corrente' // edizione in vigore (RF-A-04)
  | 'storico' // edizione superata, ancora consultabile
  | 'attesa' // in coda / in elaborazione (RF-B-05)
  | 'positivo'
  | 'negativo';

/**
 * Etichetta di stato compatta.
 *
 * In mono maiuscolo come tutte le etichette di metadato del design: chi
 * scorre un elenco distingue a colpo d'occhio ciò che è dato dal documento
 * da ciò che è detto dal sistema.
 */
@Component({
  selector: 'ui-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
  host: {
    '[class]': '"is-" + variante()',
  },
  /* Gli stili stanno su `:host`, non su una classe interna: con
     l'incapsulamento emulato un selettore di classe non raggiunge mai
     l'elemento ospite, e il badge resterebbe testo nudo. */
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      padding: 2px 6px;
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      white-space: nowrap;
      border: 1px solid transparent;
    }

    :host(.is-neutro) {
      background: var(--c-page-alt);
      color: var(--c-text-3);
    }

    :host(.is-accento) {
      background: var(--c-surface);
      border-color: var(--c-line);
      color: var(--c-text-2);
    }

    :host(.is-corrente) {
      background: var(--c-pos-soft);
      color: var(--c-pos);
    }

    /* Le edizioni superate restano consultabili ma non devono competere con
       quella in vigore: solo bordo, nessun fondo. */
    :host(.is-storico) {
      background: transparent;
      border-color: var(--c-line);
      color: var(--c-text-3);
    }

    :host(.is-attesa) {
      background: var(--c-stato-corso-soft);
      color: var(--c-stato-corso);
    }

    :host(.is-positivo) {
      background: var(--c-pos-soft);
      color: var(--c-pos);
    }

    :host(.is-negativo) {
      background: var(--c-neg-soft);
      color: var(--c-neg);
    }
  `,
})
export class Badge {
  readonly variante = input<VarianteBadge>('neutro');
}
