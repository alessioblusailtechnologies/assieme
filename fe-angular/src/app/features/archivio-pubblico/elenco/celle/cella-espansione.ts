import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonDirective } from 'primeng/button';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { Icona } from '@shared/ui/icona/icona';
import { RigaArchivio } from './riga-archivio';

export interface ParametriCellaEspansione {
  espanso: (id: string) => boolean;
  alterna: (id: string) => void;
}

/** Apre e chiude l'elenco dei documenti di un prodotto. */
@Component({
  selector: 'app-cella-espansione',
  imports: [ButtonDirective, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (riga(); as r) {
      <button
        pButton
        type="button"
        severity="secondary"
        size="small"
        [text]="true"
        [class.is-aperto]="aperto()"
        (click)="alterna(r.prodotto.id)"
        [attr.aria-expanded]="aperto()"
        [attr.aria-label]="
          (aperto() ? 'Nascondi i documenti di ' : 'Mostra i documenti di ') + r.prodotto.nome
        "
      >
        <ui-icon name="espandi-destra" [size]="16" />
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      place-items: center;
      height: 100%;
    }

    button {
      padding: var(--sp-1);
      color: var(--c-text-3);
    }

    button:hover {
      color: var(--c-accent);
    }

    /* La freccia ruota invece di cambiare disegno: il movimento dice che è
       lo stesso elemento in un altro stato, non un'icona diversa. */
    button ui-icon {
      transition: transform var(--dur-fast) var(--ease-brand);
    }

    button.is-aperto {
      color: var(--c-accent);
    }

    button.is-aperto ui-icon {
      transform: rotate(90deg);
    }
  `,
})
export class CellaEspansione implements ICellRendererAngularComp {
  protected readonly riga = signal<RigaArchivio | undefined>(undefined);
  protected readonly aperto = signal(false);
  private parametri?: ParametriCellaEspansione;

  agInit(params: ICellRendererParams<RigaArchivio> & ParametriCellaEspansione): void {
    this.parametri = params;
    this.aggiorna(params);
  }

  refresh(params: ICellRendererParams<RigaArchivio>): boolean {
    this.aggiorna(params);
    return true;
  }

  private aggiorna(params: ICellRendererParams<RigaArchivio>): void {
    this.riga.set(params.data);
    this.aperto.set(params.data ? (this.parametri?.espanso(params.data.prodotto.id) ?? false) : false);
  }

  protected alterna(id: string): void {
    this.parametri?.alterna(id);
  }
}
