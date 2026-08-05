import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { Icona } from '@shared/ui/icona/icona';

interface ConIdETitolo {
  id: string;
  titolo: string;
}

/** La colonna passa il percorso di base della sezione. */
export interface ParametriCellaApri {
  base: string;
}

/**
 * Azione di riga: apre la scheda del documento.
 *
 * È un **collegamento con l'aspetto di un pulsante**, non un pulsante che
 * naviga: così funzionano il clic centrale, l'apertura in una nuova scheda e
 * il copia-indirizzo. In un archivio si confrontano documenti tenendone
 * aperti due o tre, e un pulsante che intercetta il clic lo impedirebbe.
 *
 * L'etichetta accessibile porta il titolo del documento: "Apri" ripetuto
 * venti volte, letto da uno screen reader fuori dal contesto della riga, non
 * dice quale.
 */
@Component({
  selector: 'app-cella-apri',
  imports: [ButtonDirective, Icona, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <a
        pButton
        severity="secondary"
        size="small"
        [outlined]="true"
        [routerLink]="percorso()"
        [attr.aria-label]="'Apri ' + doc.titolo"
      >
        <span>Apri</span>
        <ui-icon name="espandi-destra" [size]="14" />
      </a>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      height: 100%;
    }

    a,
    a:hover {
      text-decoration: none;
    }
  `,
})
export class CellaApri implements ICellRendererAngularComp {
  protected readonly documento = signal<ConIdETitolo | undefined>(undefined);
  private readonly base = signal('/');

  protected readonly percorso = computed(() => [this.base(), this.documento()?.id ?? '']);

  agInit(params: ICellRendererParams<ConIdETitolo> & ParametriCellaApri): void {
    this.base.set(params.base);
    this.documento.set(params.data);
  }

  refresh(params: ICellRendererParams<ConIdETitolo>): boolean {
    this.documento.set(params.data);
    return true;
  }
}
