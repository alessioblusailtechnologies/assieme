import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';

/**
 * Cassetto laterale: un pannello che si apre accanto al contenuto, non al
 * suo posto. In chat ospita il visualizzatore della citazione (RF-C-05) —
 * si verifica la fonte senza perdere il filo del discorso.
 *
 * Esc e il clic sul fondo chiudono; il contenuto è proiettato e vive solo
 * mentre il cassetto è aperto.
 */
@Component({
  selector: 'ui-cassetto',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'aperto() && aperto.set(false)',
  },
  template: `
    @if (aperto()) {
      <div class="fondo" (click)="aperto.set(false)" aria-hidden="true"></div>
      <aside
        class="pannello"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="titolo()"
        [style.width]="larghezza()"
      >
        <header class="testata">
          <h2 class="testata__titolo">{{ titolo() }}</h2>
          <button
            type="button"
            class="testata__chiudi"
            (click)="aperto.set(false)"
            aria-label="Chiudi il pannello"
          >
            <ui-icon name="chiudi" [size]="16" />
          </button>
        </header>
        <div class="corpo">
          <ng-content />
        </div>
      </aside>
    }
  `,
  styles: `
    .fondo {
      position: fixed;
      inset: 0;
      z-index: var(--z-dialog);
      background: var(--c-scrim);
    }

    .pannello {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: var(--z-dialog);
      display: flex;
      flex-direction: column;
      max-width: 94vw;
      background: var(--c-surface);
      border-left: 1px solid var(--c-line);
      box-shadow: -12px 0 32px var(--c-ombra);
      padding-top: var(--safe-top);
      padding-bottom: var(--safe-bottom);
    }

    /* Su smartphone il cassetto è la schermata: tutto lo schermo, niente
       margine laterale da cui sbirciare. */
    @media (max-width: 600px) {
      .pannello {
        left: 0;
        width: auto !important;
        max-width: none;
        border-left: 0;
      }
    }

    .testata {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-4);
      border-bottom: 1px solid var(--c-line-soft);
      flex: none;
    }

    .testata__titolo {
      flex: 1;
      min-width: 0;
      font-family: var(--f-serif);
      font-size: var(--t-section);
      font-weight: 400;
      letter-spacing: var(--ls-snug);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .testata__chiudi {
      display: inline-flex;
      align-items: center;
      padding: var(--sp-1);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--c-text-3);
      cursor: pointer;
    }

    .testata__chiudi:hover {
      background: var(--c-page-alt);
      color: var(--c-text);
    }

    .corpo {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: var(--sp-4);
    }
  `,
})
export class Cassetto {
  readonly aperto = model(false);
  readonly titolo = input('');
  readonly larghezza = input('min(640px, 94vw)');
}
