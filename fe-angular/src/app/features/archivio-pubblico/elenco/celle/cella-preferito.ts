import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { ButtonDirective } from 'primeng/button';

import { DocumentoPubblico } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';

/** Parametri che la colonna passa a questa cella. */
export interface ParametriCellaPreferito {
  alterna: (documento: DocumentoPubblico, preferito: boolean) => void;
}

/** RF-A-09: accesso rapido ai documenti di uso frequente. */
@Component({
  selector: 'app-cella-preferito',
  imports: [ButtonDirective, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (documento(); as doc) {
      <button
        pButton
        type="button"
        severity="secondary"
        size="small"
        [text]="true"
        [class.is-attivo]="doc.preferito"
        (click)="alterna(doc)"
        [attr.aria-pressed]="doc.preferito"
        [attr.aria-label]="
          (doc.preferito ? 'Togli dai preferiti: ' : 'Aggiungi ai preferiti: ') + doc.titolo
        "
      >
        <ui-icon name="preferito" [size]="15" />
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      height: 100%;
    }

    /* A riposo quasi invisibile: è un'azione secondaria e non deve competere
       con il titolo del documento. Il pulsante PrimeNG porta struttura e
       stati di fuoco; qui resta solo il colore, che è una scelta di
       significato e non di componente. */
    button {
      padding: var(--sp-1);
      color: var(--c-text-ghost);
    }

    button:hover,
    button.is-attivo {
      color: var(--c-accent);
    }
  `,
})
export class CellaPreferito implements ICellRendererAngularComp {
  protected readonly documento = signal<DocumentoPubblico | undefined>(undefined);
  private parametri?: ParametriCellaPreferito;

  agInit(params: ICellRendererParams<DocumentoPubblico> & ParametriCellaPreferito): void {
    this.documento.set(params.data);
    this.parametri = params;
  }

  refresh(params: ICellRendererParams<DocumentoPubblico>): boolean {
    this.documento.set(params.data);
    return true;
  }

  protected alterna(doc: DocumentoPubblico): void {
    this.parametri?.alterna(doc, !doc.preferito);
  }
}
