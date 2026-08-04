import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HugeiconsIconComponent } from '@hugeicons/angular';

import { NomeIcona, REGISTRO_ICONE } from './registro-icone';

/**
 * Icona dell'applicazione.
 *
 * Unico punto in cui il resto del codice tocca Hugeicons. Se la libreria
 * cambia, cambia questo file — e non i template che la usano.
 *
 * ```html
 * <ui-icon name="documento" />
 * <ui-icon name="elimina" [size]="16" etichetta="Elimina il documento" />
 * ```
 *
 * **Accessibilità.** Un'icona è decorativa finché non si dimostra il
 * contrario: senza `etichetta` viene nascosta agli screen reader, perché
 * accanto a un testo che dice già la stessa cosa raddoppierebbe l'annuncio.
 * Con `etichetta` diventa `role="img"` e viene letta — il caso del pulsante
 * di sola icona, che altrimenti per chi non vede è un pulsante muto.
 */
@Component({
  selector: 'ui-icon',
  imports: [HugeiconsIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <hugeicons-icon
      [icon]="dato()"
      [size]="size()"
      [strokeWidth]="strokeWidth()"
      color="currentColor"
    />
  `,
  host: {
    class: 'ui-icon',
    '[attr.role]': 'etichetta() ? "img" : null',
    '[attr.aria-label]': 'etichetta() || null',
    '[attr.aria-hidden]': 'etichetta() ? null : "true"',
  },
  styles: `
    .ui-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      /* L'icona segue il colore del testo accanto a cui sta: niente
         allineamenti a mano nei venti punti in cui compare. */
      color: inherit;
      line-height: 0;
    }

    /*
     * L'SVG deve essere un blocco.
     *
     * Da elemento in linea poggerebbe sulla linea di base del testo, con
     * sotto lo spazio riservato ai discendenti: dentro un pulsante o accanto
     * a un'etichetta risulta spostata verso l'alto di due o tre pixel. È il
     * classico disallineamento che si insegue nel contenitore mentre la
     * causa è qui.
     */
    .ui-icon ::ng-deep svg {
      display: block;
    }
  `,
})
export class Icona {
  readonly name = input.required<NomeIcona>();
  readonly size = input(18);

  /**
   * 1.5 e non il 2 di serie: i filetti del design sono da 1px e un tratto
   * spesso farebbe sembrare le icone appiccicate sopra l'interfaccia invece
   * che parte di essa.
   */
  readonly strokeWidth = input(1.5);

  /** Valorizzata solo quando l'icona porta significato da sola. */
  readonly etichetta = input<string>();

  protected readonly dato = computed(() => REGISTRO_ICONE[this.name()]);
}
