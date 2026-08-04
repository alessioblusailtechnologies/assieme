import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NomeIcona } from '@shared/ui/icona/registro-icone';

/**
 * Stato vuoto.
 *
 * Una schermata senza risultati non è un errore ma una situazione normale, e
 * merita di dire **perché** è vuota e **cosa fare**. La differenza pratica:
 * "nessun documento" lascia l'utente a chiedersi se l'archivio sia rotto,
 * "nessun documento per questi filtri — prova ad allargare la ricerca" gli
 * dice che il sistema funziona e la mossa è sua.
 *
 * L'azione si passa per proiezione, così ogni schermata offre la propria
 * senza che questo componente conosca il dominio.
 */
@Component({
  selector: 'ui-stato-vuoto',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-icon [name]="icona()" [size]="28" />
    <p class="titolo">{{ titolo() }}</p>
    @if (descrizione()) {
      <p class="descrizione">{{ descrizione() }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-12) var(--sp-6);
      text-align: center;
      color: var(--c-text-3);
    }

    .titolo {
      font-family: var(--f-serif);
      font-size: var(--t-section);
      color: var(--c-text);
    }

    .descrizione {
      max-width: 46ch;
      font-size: var(--t-sm);
      color: var(--c-text-3);
    }
  `,
})
export class StatoVuoto {
  readonly titolo = input.required<string>();
  readonly descrizione = input<string>();
  readonly icona = input<NomeIcona>('documento');
}
