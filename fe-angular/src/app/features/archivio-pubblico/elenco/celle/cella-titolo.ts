import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { DocumentoPubblico } from '@core/models';

/**
 * Cella del titolo: collegamento alla scheda più il nome del prodotto sotto.
 *
 * Due righe e non una: i set informativi hanno titoli quasi identici fra
 * documenti dello stesso prodotto, e senza il prodotto in chiaro due righe
 * vicine diventano indistinguibili.
 */
@Component({
  selector: 'app-cella-titolo',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <a class="titolo" [routerLink]="['/archivio/pubblico', doc.id]">{{ doc.titolo }}</a>
      <span class="prodotto">{{ doc.prodotto }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
      line-height: 1.3;
    }

    .titolo {
      font-size: var(--t-body);
      color: var(--c-text);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .titolo:hover {
      color: var(--c-accent);
      text-decoration: underline;
    }

    .prodotto {
      font-size: var(--t-xs);
      color: var(--c-text-3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class CellaTitolo implements ICellRendererAngularComp {
  protected readonly documento = signal<DocumentoPubblico | undefined>(undefined);

  agInit(params: ICellRendererParams<DocumentoPubblico>): void {
    this.documento.set(params.data);
  }

  /* Restituendo `true` la cella si aggiorna al posto di essere ricreata:
     su una griglia che si ricarica a ogni cambio di filtro è la differenza
     fra un aggiornamento e uno sfarfallio. */
  refresh(params: ICellRendererParams<DocumentoPubblico>): boolean {
    this.documento.set(params.data);
    return true;
  }
}
