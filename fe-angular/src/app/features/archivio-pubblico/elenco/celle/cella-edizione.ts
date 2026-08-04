import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { Badge } from '@shared/ui/badge/badge';
import { DocumentoPubblico } from '@core/models';

/**
 * Edizione con lo stato accanto.
 *
 * RF-A-04: a parità di prodotto coesistono più edizioni, e sapere quale si
 * sta guardando è metà del lavoro dell'intermediario. Un'etichetta come
 * "ed. 09/2025" da sola non dice se sia ancora quella in vigore.
 */
@Component({
  selector: 'app-cella-edizione',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <span class="etichetta">{{ doc.edizione.etichetta }}</span>
      @if (doc.edizione.corrente) {
        <ui-badge variante="corrente">corrente</ui-badge>
      } @else {
        <ui-badge variante="storico">superata</ui-badge>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      height: 100%;
    }

    .etichetta {
      font-size: var(--t-sm);
      color: var(--c-text-2);
      white-space: nowrap;
    }
  `,
})
export class CellaEdizione implements ICellRendererAngularComp {
  protected readonly documento = signal<DocumentoPubblico | undefined>(undefined);

  agInit(params: ICellRendererParams<DocumentoPubblico>): void {
    this.documento.set(params.data);
  }

  refresh(params: ICellRendererParams<DocumentoPubblico>): boolean {
    this.documento.set(params.data);
    return true;
  }
}
