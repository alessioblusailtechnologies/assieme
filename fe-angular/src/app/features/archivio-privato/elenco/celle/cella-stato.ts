import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { DocumentoPrivato } from '@core/models';
import { EtichettaStato, TonoStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { NomeIcona } from '@shared/ui/icona/registro-icone';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';

/**
 * Stato di elaborazione del documento (RF-B-05).
 *
 * È la colonna che giustifica l'esistenza di questa schermata rispetto a
 * quella pubblica: un documento caricato **non è subito utilizzabile**, e
 * scoprirlo mentre si scrive un messaggio in chat è il modo peggiore di
 * apprenderlo.
 *
 * La resa è l'etichetta di stato del design system (`ui-etichetta-stato`);
 * qui resta solo la traduzione di dominio: quale stato, quale icona, quale
 * parola — e il motivo dell'errore nel suggerimento.
 */
@Component({
  selector: 'app-cella-stato',
  imports: [EtichettaStato, Suggerimento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-etichetta-stato
      [tono]="tono()"
      [icona]="icona()"
      [girante]="documento().stato === 'in-elaborazione'"
      [class.con-motivo]="documento().stato === 'errore'"
      [uiSuggerimento]="documento().erroreElaborazione ?? ''"
    >
      {{ testo() }}
    </ui-etichetta-stato>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
    }

    /* Il motivo sta nel suggerimento: il cursore dice che c'è altro. */
    ui-etichetta-stato.con-motivo {
      cursor: help;
    }
  `,
})
export class CellaStato {
  readonly documento = input.required<DocumentoPrivato>();

  protected readonly tono = computed<TonoStato>(() => {
    switch (this.documento().stato) {
      case 'in-coda':
      case 'in-elaborazione':
        return 'corso';
      case 'errore':
        return 'errore';
      default:
        return 'pronto';
    }
  });

  protected readonly testo = computed(() => {
    switch (this.documento().stato) {
      case 'in-coda':
        return 'in coda';
      case 'in-elaborazione':
        return 'elaborazione';
      case 'errore':
        return 'non leggibile';
      default:
        return 'pronto';
    }
  });

  protected readonly icona = computed<NomeIcona>(() => {
    switch (this.documento().stato) {
      case 'in-coda':
        return 'attesa';
      case 'in-elaborazione':
        return 'in-corso';
      case 'errore':
        return 'errore';
      default:
        return 'pronto';
    }
  });
}
