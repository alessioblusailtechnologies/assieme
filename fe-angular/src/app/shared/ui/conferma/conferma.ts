import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  viewChild,
} from '@angular/core';

import { Bottone } from '@shared/ui/bottone/bottone';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { Icona } from '@shared/ui/icona/icona';

/**
 * La finestra di conferma, montata una volta sola nella radice.
 *
 * Piccola e al centro: dice che cosa sta per succedere e offre due strade,
 * una delle quali è tornare indietro. Sostituisce il pulsante che si armava
 * al primo clic e cancellava al secondo (12/09/2026): quello chiedeva il
 * permesso con un gesto che sembrava già l'azione.
 *
 * Il fuoco parte dall'annulla e Esc chiude: la via d'uscita è la più facile
 * da imboccare, perché è quella che non rompe niente.
 */
@Component({
  selector: 'ui-conferma',
  imports: [Bottone, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'store.rispondi(false)',
  },
  template: `
    @if (store.inCorso(); as c) {
      <div class="fondo" (click)="store.rispondi(false)" aria-hidden="true"></div>
      <div
        class="finestra"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conferma-titolo"
        [attr.aria-describedby]="c.dettaglio ? 'conferma-dettaglio' : null"
      >
        <div class="testa">
          <span class="medaglione" [class.is-pericolo]="c.tono !== 'neutro'" aria-hidden="true">
            <ui-icon [name]="c.tono === 'neutro' ? 'informazione' : 'avviso'" [size]="17" />
          </span>
          <div class="testa__testo">
            <h2 class="titolo" id="conferma-titolo">{{ c.titolo }}</h2>
            @if (c.dettaglio) {
              <p class="dettaglio" id="conferma-dettaglio">{{ c.dettaglio }}</p>
            }
          </div>
        </div>

        <div class="azioni">
          <button
            #annulla
            uiBottone
            variante="testo"
            type="button"
            (click)="store.rispondi(false)"
          >
            <span>{{ c.annulla || 'Annulla' }}</span>
          </button>
          <button
            uiBottone
            [variante]="c.tono === 'neutro' ? 'primario' : 'pericolo'"
            type="button"
            (click)="store.rispondi(true)"
          >
            <span>{{ c.conferma || 'Elimina' }}</span>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .fondo {
      position: fixed;
      inset: 0;
      z-index: var(--z-dialog);
      background: var(--c-scrim);
    }

    .finestra {
      position: fixed;
      z-index: var(--z-dialog);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
      width: min(420px, calc(100vw - 2rem));
      padding: var(--sp-5);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-radius: var(--radius);
      box-shadow: 0 16px 48px var(--c-ombra-forte);
    }

    .testa {
      display: flex;
      align-items: flex-start;
      gap: var(--sp-3);
    }

    /* Lo stesso medaglione delle notifiche e di \`ui-avviso\`: il tono si
       riconosce prima di leggere il titolo. */
    .medaglione {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      flex: none;
      border-radius: 50%;
      background: var(--c-page-alt);
      color: var(--c-text-3);
    }

    .medaglione.is-pericolo {
      background: var(--c-neg-soft);
      color: var(--c-neg);
    }

    .testa__testo {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      min-width: 0;
    }

    .titolo {
      margin: 0;
      font-family: var(--f-serif);
      font-size: var(--t-section);
      font-weight: 400;
      letter-spacing: var(--ls-snug);
      line-height: 1.3;
    }

    .dettaglio {
      margin: 0;
      font-size: var(--t-body);
      line-height: 1.5;
      color: var(--c-text-2);
    }

    .azioni {
      display: flex;
      justify-content: flex-end;
      gap: var(--sp-2);
    }

    /* Su smartphone i due pulsanti prendono la riga: il pollice non cerca
       un bersaglio stretto in fondo a destra. */
    @media (max-width: 600px) {
      .azioni {
        flex-direction: column-reverse;
      }

      .azioni > * {
        justify-content: center;
      }
    }
  `,
})
export class Conferma {
  protected readonly store = inject(ConfermeStore);

  private readonly annulla = viewChild<ElementRef<HTMLButtonElement>>('annulla');

  constructor() {
    /* Il fuoco va all'annulla appena la finestra compare: chi risponde col
       tasto invio senza aver letto non cancella niente. */
    afterRenderEffect(() => {
      this.annulla()?.nativeElement.focus();
    });
  }
}
