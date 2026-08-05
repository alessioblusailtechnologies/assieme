import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';

import { DocumentoPrivato } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';
import { NomeIcona } from '@shared/ui/icona/registro-icone';

/**
 * Stato di elaborazione del documento (RF-B-05).
 *
 * È la colonna che giustifica l'esistenza di questa schermata rispetto a
 * quella pubblica: un documento caricato **non è subito utilizzabile**, e
 * scoprirlo mentre si scrive un messaggio in chat è il modo peggiore di
 * apprenderlo.
 *
 * Come nell'archivio pubblico, il caso normale è discreto: "pronto" è uno
 * stato smorzato, mentre attesa ed errore si fanno notare. Su venti righe
 * quasi tutte pronte, marcare il normale sarebbe rumore.
 */
@Component({
  selector: 'app-cella-stato',
  imports: [Icona, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <span
        class="stato"
        [class]="'is-' + doc.stato"
        [pTooltip]="doc.erroreElaborazione ?? ''"
        tooltipPosition="top"
        [tooltipDisabled]="!doc.erroreElaborazione"
      >
        <ui-icon [name]="icona()" [size]="14" />
        {{ testo() }}
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      height: 100%;
    }

    .stato {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* Il caso normale non grida: nessun fondo, colore attenuato. */
    .is-pronto {
      color: var(--c-text-3);
    }

    .is-in-coda,
    .is-in-elaborazione {
      color: var(--c-stato-corso);
    }

    .is-errore {
      color: var(--c-stato-errore);
      /* Il tratteggio sotto dice "c'è altro da sapere": il motivo è nel
         suggerimento, e senza un segnale nessuno passerebbe sopra. */
      text-decoration: underline dotted;
      text-underline-offset: 3px;
      cursor: help;
    }

    /* L'attesa ruota piano: dice che qualcosa sta accadendo senza chiedere
       attenzione. Chi ha chiesto meno movimento non la vede girare. */
    .is-in-elaborazione ui-icon {
      animation: gira 1.8s linear infinite;
    }

    @keyframes gira {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class CellaStato implements ICellRendererAngularComp {
  protected readonly documento = signal<DocumentoPrivato | undefined>(undefined);

  protected readonly testo = computed(() => {
    switch (this.documento()?.stato) {
      case 'in-coda':
        return 'in coda';
      case 'in-elaborazione':
        return 'elaborazione';
      case 'errore':
        return 'non leggibile';
      default:
        return 'pronto';
    }
  });

  protected readonly icona = computed<NomeIcona>(() => {
    switch (this.documento()?.stato) {
      case 'in-coda':
        return 'attesa';
      case 'in-elaborazione':
        return 'in-corso';
      case 'errore':
        return 'errore';
      default:
        return 'pronto';
    }
  });

  agInit(params: ICellRendererParams<DocumentoPrivato>): void {
    this.documento.set(params.data);
  }

  refresh(params: ICellRendererParams<DocumentoPrivato>): boolean {
    this.documento.set(params.data);
    return true;
  }
}
