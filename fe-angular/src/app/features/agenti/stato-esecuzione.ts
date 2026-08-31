import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { EtichettaStato, TonoStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { NomeIcona } from '@shared/ui/icona/registro-icone';
import { StatoEsecuzione } from '@core/models';

/**
 * Stato di un'esecuzione (RF-E-06), nella stessa lingua della colonna di
 * stato dell'Archivio Privato: è l'etichetta di stato del design system
 * (`ui-etichetta-stato`), qui resta solo la traduzione di dominio. Compare
 * nell'elenco degli agenti (ultima esecuzione), nello storico e nella
 * pagina dell'esito.
 */
@Component({
  selector: 'app-stato-esecuzione',
  imports: [EtichettaStato],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-etichetta-stato [tono]="tono()" [icona]="icona()" [girante]="stato() === 'in-corso'">
      {{ testo() }}
    </ui-etichetta-stato>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
    }
  `,
})
export class ComponenteStatoEsecuzione {
  readonly stato = input.required<StatoEsecuzione>();

  protected readonly tono = computed<TonoStato>(() => {
    switch (this.stato()) {
      case 'in-coda':
      case 'in-corso':
        return 'corso';
      case 'fallita':
        return 'errore';
      default:
        return 'pronto';
    }
  });

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
