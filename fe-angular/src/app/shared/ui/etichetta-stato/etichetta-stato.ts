import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NomeIcona } from '@shared/ui/icona/registro-icone';

/**
 * Il tono dice il significato, non il colore: se domani «pronto» deve
 * smettere di essere verde si cambia il CSS qui, non i template che lo
 * usano. `neutro` è per gli stati che non giudicano (sospeso, archiviato).
 */
export type TonoStato = 'pronto' | 'corso' | 'errore' | 'neutro';

/**
 * L'etichetta di stato del design system: pillola su fondo neutro, icona e
 * testo mono maiuscolo nel colore semantico dello stato. Il fondo non porta
 * la severità — la portano l'icona e il testo: su venti righe l'occhio
 * cerca l'ambra e il rosso, e un fondo colorato ovunque sarebbe rumore.
 *
 * È lo stato di lavorazione detto ovunque nello stesso modo: la colonna
 * dell'Archivio Privato (RF-B-05), le esecuzioni degli agenti (RF-E-06),
 * il ricordo sospeso della memoria. Chi ha uno stato nuovo passa da qui.
 */
@Component({
  selector: 'ui-etichetta-stato',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-icon [name]="icona()" [size]="13" />
    <ng-content />
  `,
  host: {
    '[class]': '"is-" + tono()',
    '[class.is-girante]': 'girante()',
  },
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      padding: 2px 10px 2px 7px;
      border-radius: var(--radius-pieno);
      /* Un velo, non una campitura: la severità la dicono icona e testo. */
      background: var(--c-page);
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      white-space: nowrap;
    }

    :host(.is-pronto) {
      color: var(--c-stato-pronto);
    }

    :host(.is-corso) {
      color: var(--c-stato-corso);
    }

    :host(.is-errore) {
      color: var(--c-stato-errore);
    }

    :host(.is-neutro) {
      color: var(--c-text-3);
    }

    /* Il lavoro in corso ruota piano: dice che qualcosa sta accadendo senza
       chiedere attenzione. Chi ha chiesto meno movimento non lo vede girare. */
    :host(.is-girante) ui-icon {
      animation: gira 1.8s linear infinite;
    }

    @keyframes gira {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host(.is-girante) ui-icon {
        animation: none;
      }
    }
  `,
})
export class EtichettaStato {
  readonly tono = input<TonoStato>('neutro');
  readonly icona = input.required<NomeIcona>();
  /** Vero per il lavoro attivo (elaborazione, esecuzione in corso). */
  readonly girante = input(false);
}
