import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { Badge } from '@shared/ui/badge/badge';
import { DocumentoPubblico } from '@core/models';
import { etichettaTipologiaBreve } from '@shared/testi/etichette';

/**
 * Tipologia del documento come badge.
 *
 * In forma breve — "CdA" invece di "Condizioni di Assicurazione" — perché in
 * una colonna il nome per esteso manderebbe a capo ogni riga. Chi lavora nel
 * ramo riconosce le sigle; il nome completo sta nella scheda.
 */
@Component({
  selector: 'app-cella-tipologia',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (etichetta(); as e) {
      <ui-badge variante="accento">{{ e }}</ui-badge>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      height: 100%;
    }
  `,
})
export class CellaTipologia implements ICellRendererAngularComp {
  protected readonly etichetta = signal<string | undefined>(undefined);

  agInit(params: ICellRendererParams<DocumentoPubblico>): void {
    this.aggiorna(params);
  }

  refresh(params: ICellRendererParams<DocumentoPubblico>): boolean {
    this.aggiorna(params);
    return true;
  }

  private aggiorna(params: ICellRendererParams<DocumentoPubblico>): void {
    this.etichetta.set(params.data ? etichettaTipologiaBreve(params.data.tipologia) : undefined);
  }
}
