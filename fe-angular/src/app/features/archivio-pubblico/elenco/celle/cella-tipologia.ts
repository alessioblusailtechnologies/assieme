import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Tag } from 'primeng/tag';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { DocumentoPubblico } from '@core/models';
import { etichettaTipologiaBreve } from '@shared/testi/etichette';

/**
 * Tipologia del documento.
 *
 * È la colonna che distingue le righe dello stesso prodotto: senza, DIP,
 * DIP Aggiuntivo, Condizioni e Glossario di "Active Veicoli AUTOPIÙ"
 * sarebbero quattro righe identiche. Per questo sta subito dopo il prodotto.
 *
 * In forma breve — "CdA" invece di "Condizioni di Assicurazione" — perché in
 * una colonna il nome per esteso manderebbe a capo ogni riga. Chi lavora nel
 * ramo riconosce le sigle; il nome completo sta nella scheda.
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
