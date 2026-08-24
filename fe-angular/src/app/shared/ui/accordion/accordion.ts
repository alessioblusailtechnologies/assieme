import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { Icona } from '../icona/icona';

/**
 * Sezione ripiegabile.
 *
 * Una testata sola — etichetta mono, riepilogo di cosa c'è dentro, chevron
 * che ruota — e il contenuto proiettato sotto, separato da un filo. Nasce
 * chiusa: si usa quando il dettaglio è legittimo ma non deve occupare la
 * scena (le fonti di una risposta, un elenco lungo). Il riepilogo è il
 * patto col lettore: da chiusa deve già dire quanto e cosa c'è.
 *
 * ```html
 * <ui-accordion etichetta="Fonti" [riepilogo]="'19 passaggi in 3 documenti'">
 *   …contenuto…
 * </ui-accordion>
 * ```
 */
@Component({
  selector: 'ui-accordion',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="testata"
      (click)="aperto.set(!aperto())"
      [attr.aria-expanded]="aperto()"
    >
      <span class="mono etichetta">{{ etichetta() }}</span>
      @if (riepilogo()) {
        <span class="riepilogo">{{ riepilogo() }}</span>
      }
      <ui-icon name="espandi-giu" [size]="14" class="freccia" />
    </button>
    @if (aperto()) {
      <div class="contenuto">
        <ng-content />
      </div>
    }
  `,
  host: {
    class: 'ui-accordion',
    '[class.is-aperto]': 'aperto()',
  },
  styles: `
    :host {
      display: block;
      border: 1px solid var(--c-line-soft);
      border-radius: var(--radius-sm);
      background: var(--c-surface);
      overflow: hidden;
    }

    .testata {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      width: 100%;
      padding: var(--sp-2) var(--sp-3);
      border: 0;
      background: transparent;
      font: inherit;
      text-align: left;
      cursor: pointer;
      color: var(--c-text-3);
    }

    .testata:hover,
    .testata:focus-visible {
      background: var(--c-page-alt);
      color: var(--c-text-2);
    }

    .riepilogo {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--t-xs);
      color: var(--c-text-3);
    }

    .freccia {
      margin-left: auto;
      transition: transform var(--dur-fast, 0.15s) ease;
    }

    :host(.is-aperto) .freccia {
      transform: rotate(180deg);
    }

    .contenuto {
      padding: var(--sp-3);
      border-top: 1px solid var(--c-line-soft);
    }
  `,
})
export class Accordion {
  /** L'etichetta mono della testata, es. «Fonti». */
  readonly etichetta = input.required<string>();

  /** Cosa c'è dentro, detto da chiusa: «19 passaggi in 3 documenti». */
  readonly riepilogo = input<string>();

  /** Nasce chiusa; `[(aperto)]` per chi vuole governarla da fuori. */
  readonly aperto = model(false);
}
