import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NomeIcona } from '@shared/ui/icona/registro-icone';
import { StatoEsecuzione } from '@core/models';

/**
 * Stato di un'esecuzione (RF-E-06), nella stessa lingua della colonna di
 * stato dell'Archivio Privato: il caso normale è discreto, attesa e
 * fallimento si fanno notare. Compare nell'elenco degli agenti (ultima
 * esecuzione), nello storico e nella pagina dell'esito.
 */
@Component({
  selector: 'app-stato-esecuzione',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="stato" [class]="'is-' + stato()">
      <ui-icon [name]="icona()" [size]="14" />
      {{ testo() }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }

    .stato {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      white-space: nowrap;
    }

    /* Il caso normale non grida: nessun fondo, colore attenuato. */
    .is-completata {
      color: var(--c-text-3);
    }

    .is-in-coda,
    .is-in-corso {
      color: var(--c-stato-corso);
    }

    .is-fallita {
      color: var(--c-stato-errore);
    }

    .is-in-corso ui-icon {
      animation: gira 1.8s linear infinite;
    }

    @keyframes gira {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class ComponenteStatoEsecuzione {
  readonly stato = input.required<StatoEsecuzione>();

  protected readonly testo = computed(() => {
    switch (this.stato()) {
      case 'in-coda':
        return 'in coda';
      case 'in-corso':
        return 'in corso';
      case 'fallita':
        return 'fallita';
      default:
        return 'completata';
    }
  });

  protected readonly icona = computed<NomeIcona>(() => {
    switch (this.stato()) {
      case 'in-coda':
        return 'attesa';
      case 'in-corso':
        return 'in-corso';
      case 'fallita':
        return 'errore';
      default:
        return 'pronto';
    }
  });
}
