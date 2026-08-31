import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NotificheStore } from '@core/notifiche/notifiche-store';

/**
 * Le notifiche a schermo, in alto a destra. Montato una volta nella shell;
 * chiunque voglia dire qualcosa passa da `NotificheStore`.
 */
@Component({
  selector: 'ui-notifiche',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pila" aria-live="polite">
      @for (n of store.elenco(); track n.id) {
        <div class="notifica" [class]="'is-' + n.gravita" role="status">
          <span class="medaglione" aria-hidden="true">
            <ui-icon
              [name]="n.gravita === 'errore' ? 'errore' : n.gravita === 'successo' ? 'pronto' : 'informazione'"
              [size]="16"
            />
          </span>
          <div class="notifica__testo">
            <p class="notifica__titolo">{{ n.titolo }}</p>
            @if (n.dettaglio) {
              <p class="notifica__dettaglio">{{ n.dettaglio }}</p>
            }
          </div>
          <button
            type="button"
            class="notifica__chiudi"
            (click)="store.rimuovi(n.id)"
            aria-label="Chiudi la notifica"
          >
            <ui-icon name="chiudi" [size]="13" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .pila {
      position: fixed;
      top: var(--sp-4);
      right: var(--sp-4);
      z-index: var(--z-toast);
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      width: min(380px, calc(100vw - 2rem));
    }

    /* La stessa lingua di \`ui-avviso\`: carta su superficie, barra di
       severità a sinistra, icona nel colore del tono. Se quel disegno
       cambia, va riportato qui. */
    .notifica {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-left-width: 3px;
      border-radius: var(--radius);
      box-shadow: 0 8px 24px var(--c-ombra);
    }

    /* Il medaglione dell'icona, come in \`ui-avviso\`: il segnale si vede
       per primo, la carta resta neutra. */
    .medaglione {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex: none;
    }

    .notifica.is-errore {
      border-left-color: var(--c-stato-errore);
    }

    .notifica.is-errore .medaglione {
      background: var(--c-stato-errore-soft);
      color: var(--c-stato-errore);
    }

    .notifica.is-successo {
      border-left-color: var(--c-stato-pronto);
    }

    .notifica.is-successo .medaglione {
      background: var(--c-stato-pronto-soft);
      color: var(--c-stato-pronto);
    }

    .notifica.is-informazione {
      border-left-color: var(--c-accent);
    }

    .notifica.is-informazione .medaglione {
      background: var(--c-accent-soft);
      color: var(--c-accent);
    }

    .notifica__testo {
      flex: 1;
      min-width: 0;
    }

    .notifica__titolo {
      font-size: var(--t-body);
      font-weight: 500;
      color: var(--c-text);
    }

    .notifica__dettaglio {
      margin-top: 2px;
      font-size: var(--t-sm);
      line-height: 1.45;
      color: var(--c-text-3);
    }

    .notifica__chiudi {
      flex: none;
      display: inline-flex;
      padding: 2px;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--c-text-mute);
      cursor: pointer;
    }

    .notifica__chiudi:hover {
      color: var(--c-text);
      background: var(--c-page-alt);
    }
  `,
})
export class Notifiche {
  protected readonly store = inject(NotificheStore);
}
