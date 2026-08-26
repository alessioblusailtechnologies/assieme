import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ParteEvidenziata } from './evidenzia';

/**
 * Rende un testo già spezzato da `evidenziaTermini`, coi tratti trovati
 * dentro un `<mark>`.
 *
 * ```html
 * <ui-testo-evidenziato [parti]="voce.titoloEvidenziato" />
 * ```
 *
 * **Il template sta su una riga sola, e non è trascuratezza.** Con
 * `preserveWhitespaces: false` — il predefinito — Angular non butta via gli
 * a capo fra un blocco e l'altro: li riduce a uno spazio. Scritto su più
 * righe, «autovetture» con «auto» evidenziato uscirebbe come «auto
 * vetture»: la parola spezzata a metà, esattamente dove l'evidenziazione
 * doveva aiutare. Isolarlo in un componente è il modo di avere quella riga
 * in un punto solo invece che in ogni elenco che evidenzia qualcosa.
 */
@Component({
  selector: 'ui-testo-evidenziato',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // prettier-ignore
  template: `@for (parte of parti(); track $index) {@if (parte.forte) {<mark>{{ parte.testo }}</mark>} @else {<span>{{ parte.testo }}</span>}}`,
  styles: `
    :host {
      display: contents;
    }

    /*
     * Fondo tenue e peso, non un evidenziatore giallo: dentro un elenco di
     * documenti il colore significa già altre cose (accento, stato,
     * provenienza) e una terza lingua non ci sta.
     */
    mark {
      background: var(--c-accent-soft);
      color: inherit;
      border-radius: 2px;
      font-weight: 500;
    }
  `,
})
export class TestoEvidenziato {
  readonly parti = input.required<ParteEvidenziata[]>();
}
