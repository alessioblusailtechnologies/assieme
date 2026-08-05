import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { DocumentoPrivato } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
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
 * Come nell'archivio pubblico, il caso normale è discreto: "pronto" è uno
 * stato smorzato, mentre attesa ed errore si fanno notare. Su venti righe
 * quasi tutte pronte, marcare il normale sarebbe rumore.
 */
@Component({
  selector: 'app-cella-stato',
  imports: [Icona, Suggerimento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="stato"
      [class]="'is-' + documento().stato"
      [uiSuggerimento]="documento().erroreElaborazione ?? ''"
    >
      <ui-icon [name]="icona()" [size]="14" />
      {{ testo() }}
    </span>
  `,
  styles: `
    :host {
      display: flex;
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
    .is-pronto {
      color: var(--c-text-3);
    }

    .is-in-coda,
    .is-in-elaborazione {
      color: var(--c-stato-corso);
    }

    .is-errore {
      color: var(--c-stato-errore);
      /* Il tratteggio sotto dice "c'è altro da sapere": il motivo è nel
         suggerimento, e senza un segnale nessuno passerebbe sopra. */
      text-decoration: underline dotted;
      text-underline-offset: 3px;
      cursor: help;
    }

    /* L'attesa ruota piano: dice che qualcosa sta accadendo senza chiedere
       attenzione. Chi ha chiesto meno movimento non la vede girare. */
    .is-in-elaborazione ui-icon {
      animation: gira 1.8s linear infinite;
    }

    @keyframes gira {
      to {
        transform: rotate(360deg);
      }
    }
  `,
})
export class CellaStato {
  readonly documento = input.required<DocumentoPrivato>();

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
