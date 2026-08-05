import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { DocumentoPrivato } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';

/**
 * Titolo del documento, con sotto cliente ed etichette.
 *
 * Nell'archivio privato il titolo è l'unico appiglio: non c'è un prodotto né
 * una compagnia a distinguere le righe, e due preventivi si chiamano quasi
 * uguale. Il riferimento cliente sotto è ciò che li separa davvero — è il
 * modo in cui l'agenzia pensa ai propri documenti.
 */
@Component({
  selector: 'app-cella-documento',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <span class="titolo">
        {{ doc.titolo }}
        @if (doc.documentoDiRiferimento) {
          <!--
            RF-B-09: il documento è anche contesto permanente. Sta qui e non
            in una colonna sua perché riguarda poche righe: una colonna
            quasi sempre vuota è spazio sprecato su tutte le altre.
          -->
          <ui-icon
            name="riferimenti"
            [size]="13"
            etichetta="Usato come documento di riferimento"
          />
        }
      </span>

      <span class="sotto">
        @if (doc.riferimentoCliente) {
          <span class="cliente">{{ doc.riferimentoCliente }}</span>
        }
        @for (e of doc.etichette; track e) {
          <span class="etichetta">{{ e }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      height: 100%;
      min-width: 0;
      line-height: 1.3;
    }

    .titolo {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      font-size: var(--t-body);
      color: var(--c-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .titolo ui-icon {
      color: var(--c-prov-riferimento);
    }

    .sotto {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      overflow: hidden;
      white-space: nowrap;
    }

    /* Il cliente è il dato con cui si cerca: più scuro delle etichette. */
    .cliente {
      font-size: var(--t-xs);
      color: var(--c-text-2);
    }

    .etichetta {
      padding: 0 4px;
      background: var(--c-page-alt);
      color: var(--c-text-3);
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
    }
  `,
})
export class CellaDocumento implements ICellRendererAngularComp {
  protected readonly documento = signal<DocumentoPrivato | undefined>(undefined);

  agInit(params: ICellRendererParams<DocumentoPrivato>): void {
    this.documento.set(params.data);
  }

  refresh(params: ICellRendererParams<DocumentoPrivato>): boolean {
    this.documento.set(params.data);
    return true;
  }
}
