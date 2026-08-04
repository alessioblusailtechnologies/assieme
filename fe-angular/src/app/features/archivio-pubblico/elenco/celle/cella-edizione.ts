import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { Badge } from '@shared/ui/badge/badge';
import { RigaArchivio } from './riga-archivio';

/**
 * Edizione corrente del prodotto.
 *
 * RF-A-04: a parità di prodotto coesistono più edizioni, e sapere quale sia
 * quella in vigore è metà del lavoro dell'intermediario. Un'etichetta come
 * "ed. 09/2025" da sola non lo dice.
 */
@Component({
  selector: 'app-cella-edizione',
  imports: [Badge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (edizione(); as ed) {
      <span class="etichetta">{{ ed.etichetta }}</span>
      <ui-badge variante="corrente">corrente</ui-badge>
    } @else if (riga()) {
      <!--
        Del prodotto restano solo edizioni superate: succede quando i filtri
        escludono quella corrente, o quando la compagnia ha ritirato il
        prodotto. Dirlo è più utile che lasciare la cella vuota.
      -->
      <ui-badge variante="storico">nessuna corrente</ui-badge>
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
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class CellaEdizione implements ICellRendererAngularComp {
  protected readonly riga = signal<RigaArchivio | undefined>(undefined);
  protected readonly edizione = computed(() => this.riga()?.prodotto.edizioneCorrente);

  agInit(params: ICellRendererParams<RigaArchivio>): void {
    this.riga.set(params.data);
  }

  refresh(params: ICellRendererParams<RigaArchivio>): boolean {
    this.riga.set(params.data);
    return true;
  }
}
