import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Tag } from 'primeng/tag';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { TipologiaDocumento } from '@core/models';
import { etichettaTipologiaBreve } from '@shared/testi/etichette';

/** Tutto ciò che serve a questa cella: vale per i documenti di ogni archivio. */
interface ConTipologia {
  tipologia: TipologiaDocumento;
}

/**
 * Tipologia del documento.
 *
 * In forma breve — "CdA" invece di "Condizioni di Assicurazione" — perché in
 * una colonna il nome per esteso manderebbe a capo ogni riga. Chi lavora nel
 * ramo riconosce le sigle; il nome completo sta nella scheda.
 *
 * Sta in `shared/` perché serve identica ai due archivi, e tipizzata sul
 * minimo indispensabile invece che su `DocumentoPubblico`: una cella che
 * mostra la tipologia non ha motivo di sapere in quale archivio si trova.
 */
@Component({
  selector: 'app-cella-tipologia',
  imports: [Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (etichetta(); as e) {
      <!--
        severity="info" non è una scelta semantica ma il gancio a cui il
        preset appende il fondo tenue in accento: vedi components.tag nel
        preset del tema.
      -->
      <p-tag severity="info" [value]="e" />
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

  agInit(params: ICellRendererParams<ConTipologia>): void {
    this.aggiorna(params);
  }

  refresh(params: ICellRendererParams<ConTipologia>): boolean {
    this.aggiorna(params);
    return true;
  }

  private aggiorna(params: ICellRendererParams<ConTipologia>): void {
    this.etichetta.set(params.data ? etichettaTipologiaBreve(params.data.tipologia) : undefined);
  }
}
