import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Icona } from '@shared/ui/icona/icona';

interface ConIdETitolo {
  id: string;
  titolo: string;
}

/**
 * Azione di riga: apre la scheda del documento.
 *
 * È un **collegamento con l'aspetto di un pulsante**, non un pulsante che
 * naviga: così funzionano il clic centrale, l'apertura in una nuova scheda e
 * il copia-indirizzo. In un archivio si confrontano documenti tenendone
 * aperti due o tre, e un pulsante che intercetta il clic lo impedirebbe.
 *
 * L'etichetta accessibile porta il titolo del documento: "Apri" ripetuto
 * venti volte, letto da uno screen reader fuori dal contesto della riga, non
 * dice quale.
 */
@Component({
  selector: 'app-cella-apri',
  imports: [Bottone, Icona, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      uiBottone
      dimensione="piccolo"
      [routerLink]="percorso()"
      [attr.aria-label]="'Apri ' + documento().titolo"
    >
      <span>Apri</span>
      <ui-icon name="espandi-destra" [size]="14" />
    </a>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: flex-end;
    }

    a,
    a:hover {
      text-decoration: none;
    }
  `,
})
export class CellaApri {
  /** Percorso di base della sezione, es. \`/archivio/pubblico\`. */
  readonly base = input.required<string>();
  readonly documento = input.required<ConIdETitolo>();

  protected readonly percorso = computed(() => [this.base(), this.documento().id]);
}
