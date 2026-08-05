import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Badge } from '@shared/ui/badge/badge';
import { TipologiaDocumento } from '@core/models';
import { etichettaTipologiaBreve } from '@shared/testi/etichette';

/**
 * Tipologia del documento.
 *
 * In forma breve — "CdA" invece di "Condizioni di Assicurazione" — perché in
 * una colonna il nome per esteso manderebbe a capo ogni riga. Chi lavora nel
 * ramo riconosce le sigle; il nome completo sta nella scheda.
 *
 * Sta in `shared/` perché serve identica ai due archivi, e tipizzata sul
 * minimo indispensabile: una cella che mostra la tipologia non ha motivo di
 * sapere in quale archivio si trova.
 */
@Component({
  selector: 'app-cella-tipologia',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ui-badge variante="accento">{{ etichetta() }}</ui-badge>`,
  styles: `
    :host {
      display: flex;
      align-items: center;
    }
  `,
})
export class CellaTipologia {
  readonly tipologia = input.required<TipologiaDocumento>();

  protected readonly etichetta = computed(() => etichettaTipologiaBreve(this.tipologia()));
}
