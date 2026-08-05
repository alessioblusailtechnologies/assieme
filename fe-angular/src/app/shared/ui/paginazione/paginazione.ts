import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';

/**
 * Paginazione degli elenchi.
 *
 * Sobria di proposito: precedente, successiva e «pagina N di M». I salti
 * diretti a pagina 7 servono di rado su elenchi filtrabili — chi cerca,
 * filtra; chi sfoglia va avanti e indietro.
 */
@Component({
  selector: 'ui-paginazione',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="paginazione" aria-label="Paginazione">
      <button
        type="button"
        class="passo"
        (click)="cambiaPagina.emit(pagina() - 1)"
        [disabled]="pagina() <= 1"
        aria-label="Pagina precedente"
      >
        <ui-icon name="espandi-destra" [size]="14" class="ruota" />
      </button>

      <span class="posizione" aria-live="polite">
        pagina {{ pagina() }} di {{ totalePagine() }}
      </span>

      <button
        type="button"
        class="passo"
        (click)="cambiaPagina.emit(pagina() + 1)"
        [disabled]="pagina() >= totalePagine()"
        aria-label="Pagina successiva"
      >
        <ui-icon name="espandi-destra" [size]="14" />
      </button>
    </nav>
  `,
  styles: `
    .paginazione {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--sp-3);
      padding: var(--sp-2);
    }

    .passo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: 1px solid var(--c-line);
      border-radius: var(--radius-sm);
      background: var(--c-surface);
      color: var(--c-text-2);
      cursor: pointer;
    }

    .passo:hover:not(:disabled) {
      border-color: var(--c-text-mute);
    }

    .passo:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .ruota {
      transform: rotate(180deg);
    }

    .posizione {
      font-family: var(--f-mono);
      font-size: var(--t-mono);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      color: var(--c-text-3);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class Paginazione {
  /** Pagina corrente, in base 1 — come nel contratto API. */
  readonly pagina = input.required<number>();
  readonly perPagina = input.required<number>();
  readonly totale = input.required<number>();

  readonly cambiaPagina = output<number>();

  protected readonly totalePagine = computed(() =>
    Math.max(1, Math.ceil(this.totale() / this.perPagina())),
  );
}
