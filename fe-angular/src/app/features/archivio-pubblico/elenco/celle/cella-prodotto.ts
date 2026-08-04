import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { RigaArchivio } from './riga-archivio';

/**
 * Nome del prodotto con sotto la consistenza del suo set informativo.
 *
 * "6 documenti · 2 edizioni" risponde in anticipo alla domanda che si fa
 * prima di aprire una riga: vale la pena? Un elenco in cui bisogna aprire
 * ogni prodotto per scoprire che ne contiene uno solo si consulta male.
 */
@Component({
  selector: 'app-cella-prodotto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (riga(); as r) {
      <span class="nome">{{ r.prodotto.nome }}</span>
      <span class="consistenza">{{ consistenza() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
      line-height: 1.3;
      min-width: 0;
    }

    .nome {
      font-size: var(--t-body);
      color: var(--c-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .consistenza {
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      color: var(--c-text-3);
    }
  `,
})
export class CellaProdotto implements ICellRendererAngularComp {
  protected readonly riga = signal<RigaArchivio | undefined>(undefined);

  protected readonly consistenza = computed(() => {
    const p = this.riga()?.prodotto;
    if (!p) return '';

    const documenti = `${p.numeroDocumenti} ${p.numeroDocumenti === 1 ? 'documento' : 'documenti'}`;
    /* L'edizione unica non si dice: è il caso normale e occuperebbe spazio
       per non informare. Si dice quando ce n'è più d'una, che è l'eccezione
       da notare. */
    if (p.numeroEdizioni <= 1) return documenti;
    return `${documenti} · ${p.numeroEdizioni} edizioni`;
  });

  agInit(params: ICellRendererParams<RigaArchivio>): void {
    this.riga.set(params.data);
  }

  refresh(params: ICellRendererParams<RigaArchivio>): boolean {
    this.riga.set(params.data);
    return true;
  }
}
