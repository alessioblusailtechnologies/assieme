import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { ButtonDirective } from 'primeng/button';

import { Icona } from '@shared/ui/icona/icona';
import { Prodotto } from '@core/models';
import { RigaArchivio } from './riga-archivio';

/** Parametri che la colonna passa a questa cella. */
export interface ParametriCellaPreferito {
  alterna: (prodotto: Prodotto, preferito: boolean) => void;
}

/**
 * RF-A-09: accesso rapido a ciò che si usa spesso.
 *
 * Il preferito sta sul **prodotto** e non sul singolo documento: si mette da
 * parte "la polizza auto di Generali", non il suo DIP Aggiuntivo.
 */
@Component({
  selector: 'app-cella-preferito',
  imports: [ButtonDirective, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prodotto(); as p) {
      <button
        pButton
        type="button"
        severity="secondary"
        size="small"
        [text]="true"
        [class.is-attivo]="p.preferito"
        (click)="alterna(p)"
        [attr.aria-pressed]="p.preferito"
        [attr.aria-label]="
          (p.preferito ? 'Togli dai preferiti: ' : 'Aggiungi ai preferiti: ') + p.nome
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
  protected readonly prodotto = signal<Prodotto | undefined>(undefined);
  private parametri?: ParametriCellaPreferito;

  agInit(params: ICellRendererParams<RigaArchivio> & ParametriCellaPreferito): void {
    this.prodotto.set(params.data?.prodotto);
    this.parametri = params;
  }

  refresh(params: ICellRendererParams<RigaArchivio>): boolean {
    this.prodotto.set(params.data?.prodotto);
    return true;
  }

  protected alterna(prodotto: Prodotto): void {
    this.parametri?.alterna(prodotto, !prodotto.preferito);
  }
}
