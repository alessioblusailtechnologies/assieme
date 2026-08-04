import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { DocumentoPubblico } from '@core/models';

/**
 * Edizione del documento.
 *
 * RF-A-04: a parità di prodotto coesistono più edizioni, e sapere quale si
 * sta guardando è metà del lavoro dell'intermediario.
 *
 * **Il caso normale non si etichetta.** Con il filtro "solo edizioni
 * correnti" acceso di default, dire "corrente" su ogni riga significa
 * ripetere quarantotto volte un'informazione che non distingue nulla: è
 * rumore che si impara a ignorare, e quando serve davvero non lo si legge
 * più. Si marca l'eccezione.
 *
 * Un'edizione superata quindi si smorza e porta la data fino a cui è stata
 * in vigore. Quella data non è decorazione: chi ha in mano un contratto del
 * 2025 deve sapere se quel testo copre il suo periodo, e la risposta è
 * proprio lì invece che a due clic di distanza.
 */
@Component({
  selector: 'app-cella-edizione',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <span class="etichetta" [class.is-superata]="!doc.edizione.corrente">
        {{ doc.edizione.etichetta }}
      </span>

      @if (!doc.edizione.corrente) {
        <span class="validita">
          @if (doc.edizione.validaAl) {
            fino al {{ doc.edizione.validaAl | date: 'dd/MM/yyyy' }}
          } @else {
            non più in vigore
          }
        </span>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
      height: 100%;
    }

    .etichetta {
      font-size: var(--t-sm);
      color: var(--c-text);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    /* L'edizione superata si legge ancora, ma non compete con le correnti
       che le stanno intorno. */
    .etichetta.is-superata {
      color: var(--c-text-3);
      text-decoration: line-through;
      text-decoration-color: var(--c-text-ghost);
    }

    .validita {
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      color: var(--c-neg);
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
