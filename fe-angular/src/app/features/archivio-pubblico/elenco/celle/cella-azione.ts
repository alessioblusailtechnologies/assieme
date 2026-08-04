import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from 'primeng/button';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { DocumentoPubblico } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';

/**
 * Azione di riga: apre la scheda del documento.
 *
 * È un collegamento con l'aspetto di un pulsante, non un pulsante che
 * naviga: così funziona il clic centrale, l'apertura in una nuova scheda e
 * il copia-indirizzo. In un archivio si confrontano documenti tenendone
 * aperti due o tre, e un pulsante che intercetta il clic lo impedirebbe.
 *
 * L'etichetta accessibile porta il titolo del documento: "Apri" ripetuto
 * venti volte, letto da uno screen reader fuori dal contesto della riga, non
 * dice quale.
 */
@Component({
  selector: 'app-cella-azione',
  imports: [ButtonDirective, Icona, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <a
        pButton
        severity="secondary"
        size="small"
        [outlined]="true"
        [routerLink]="['/archivio/pubblico', doc.id]"
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

    a {
      text-decoration: none;
    }

    a:hover {
      text-decoration: none;
    }
  `,
})
export class CellaAzione implements ICellRendererAngularComp {
  protected readonly documento = signal<DocumentoPubblico | undefined>(undefined);

  agInit(params: ICellRendererParams<DocumentoPubblico>): void {
    this.documento.set(params.data);
  }

  refresh(params: ICellRendererParams<DocumentoPubblico>): boolean {
    this.documento.set(params.data);
    return true;
  }
}
