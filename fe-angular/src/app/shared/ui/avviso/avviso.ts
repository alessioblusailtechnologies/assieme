import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NomeIcona } from '@shared/ui/icona/registro-icone';

/**
 * Il tono dice il significato, non il colore — come per chip ed etichette:
 * se domani un colore cambia, si cambia qui, non nei template.
 */
export type TonoAvviso = 'info' | 'successo' | 'attenzione' | 'errore';

/**
 * L'avviso inline del design system: carta su superficie con la barra di
 * severità a sinistra, icona e occhiello nel colore del tono, corpo in
 * testo neutro. Come per le chip, il fondo non porta mai la severità — la
 * portano la barra, l'icona e l'occhiello.
 *
 * `role` lo decide chi lo usa: `role="alert"` per ciò che interrompe,
 * `role="status"` per ciò che informa. `girante` fa ruotare piano l'icona
 * del lavoro in corso (ferma per chi ha chiesto meno movimento).
 *
 * I toast (`ui-notifiche`) parlano la stessa lingua: stessa barra, stessi
 * toni — se questo disegno cambia, va riportato anche lì.
 */
@Component({
  selector: 'ui-avviso',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="medaglione" aria-hidden="true">
      <ui-icon [name]="iconaEffettiva()" [size]="16" />
    </span>
    <div class="corpo">
      @if (titolo()) {
        <p class="titolo">{{ titolo() }}</p>
      }
      <div class="testo"><ng-content /></div>
    </div>
  `,
  host: {
    '[class]': '"is-" + tono()',
    '[class.is-girante]': 'girante()',
  },
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-left-width: 3px;
      border-radius: var(--radius);
    }

    /* L'icona sta in un medaglione col fondo tenue del tono: è il segnale
       dell'avviso e deve vedersi per primo — la carta resta neutra. */
    .medaglione {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex: none;
    }

    :host(.is-info) {
      border-left-color: var(--c-accent);
    }

    :host(.is-info) .medaglione {
      background: var(--c-accent-soft);
      color: var(--c-accent);
    }

    :host(.is-info) .titolo {
      color: var(--c-accent);
    }

    :host(.is-successo) {
      border-left-color: var(--c-stato-pronto);
    }

    :host(.is-successo) .medaglione {
      background: var(--c-stato-pronto-soft);
      color: var(--c-stato-pronto);
    }

    :host(.is-successo) .titolo {
      color: var(--c-stato-pronto);
    }

    :host(.is-attenzione) {
      border-left-color: var(--c-stato-corso);
    }

    :host(.is-attenzione) .medaglione {
      background: var(--c-stato-corso-soft);
      color: var(--c-stato-corso);
    }

    :host(.is-attenzione) .titolo {
      color: var(--c-stato-corso);
    }

    :host(.is-errore) {
      border-left-color: var(--c-stato-errore);
    }

    :host(.is-errore) .medaglione {
      background: var(--c-stato-errore-soft);
      color: var(--c-stato-errore);
    }

    :host(.is-errore) .titolo {
      color: var(--c-stato-errore);
    }

    .corpo {
      flex: 1;
      min-width: 0;
    }

    /* L'occhiello nella lingua mono delle etichette: nomina, non racconta. */
    .titolo {
      margin-bottom: 2px;
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
    }

    .testo {
      font-size: var(--t-sm);
      line-height: 1.55;
      color: var(--c-text);
    }

    :host(.is-girante) .medaglione ui-icon {
      animation: gira 1.8s linear infinite;
    }

    @keyframes gira {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host(.is-girante) .medaglione ui-icon {
        animation: none;
      }
    }
  `,
})
export class Avviso {
  readonly tono = input<TonoAvviso>('info');
  /** Senza, l'icona è quella del tono. */
  readonly icona = input<NomeIcona>();
  /** Occhiello mono opzionale sopra il testo. */
  readonly titolo = input<string>();
  readonly girante = input(false);

  protected readonly iconaEffettiva = computed<NomeIcona>(
    () =>
      this.icona() ??
      (
        {
          info: 'informazione',
          successo: 'pronto',
          attenzione: 'avviso',
          errore: 'errore',
        } as const
      )[this.tono()],
  );
}
