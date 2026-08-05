import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { DocumentoPrivato } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';

/**
 * Titolo del documento, con sotto cliente ed etichette.
 *
 * Nell'archivio privato il titolo è l'unico appiglio: non c'è un prodotto né
 * una compagnia a distinguere le righe, e due preventivi si chiamano quasi
 * uguale. Il riferimento cliente sotto è ciò che li separa davvero — è il
 * modo in cui l'agenzia pensa ai propri documenti.
 */
@Component({
  selector: 'app-cella-documento',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="titolo">
      {{ documento().titolo }}
      @if (documento().documentoDiRiferimento) {
        <!--
          RF-B-09: il documento è anche contesto permanente. Sta qui e non
          in una colonna sua perché riguarda poche righe: una colonna
          quasi sempre vuota è spazio sprecato su tutte le altre.
        -->
        <ui-icon name="riferimenti" [size]="13" etichetta="Usato come documento di riferimento" />
      }
    </span>

    <span class="sotto">
      @if (documento().riferimentoCliente) {
        <span class="cliente">{{ documento().riferimentoCliente }}</span>
      }
      @for (e of documento().etichette; track e) {
        <span class="etichetta">{{ e }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      min-width: 0;
      line-height: 1.3;
    }

    .titolo {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      font-size: var(--t-body);
      color: var(--c-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .titolo ui-icon {
      color: var(--c-prov-riferimento);
    }

    .sotto {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      overflow: hidden;
      white-space: nowrap;
    }

    /* Il cliente è il dato con cui si cerca: più scuro delle etichette. */
    .cliente {
      font-size: var(--t-xs);
      color: var(--c-text-2);
    }

    .etichetta {
      padding: 0 4px;
      background: var(--c-page-alt);
      color: var(--c-text-3);
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
    }
  `,
})
export class CellaDocumento {
  readonly documento = input.required<DocumentoPrivato>();
}
