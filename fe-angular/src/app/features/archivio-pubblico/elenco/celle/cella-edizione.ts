import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

import { Edizione } from '@core/models';

/**
 * Edizione del documento.
 *
 * RF-A-04: a parità di prodotto coesistono più edizioni, e sapere quale si
 * sta guardando è metà del lavoro dell'intermediario.
 *
 * **Il caso normale non si etichetta.** Con il filtro "solo edizioni
 * correnti" acceso di default, dire "corrente" su ogni riga significa
 * ripetere quarantotto volte un'informazione che non distingue nulla: è
 * rumore che si impara a ignorare, e quando serve davvero non lo si legge
 * più. Si marca l'eccezione.
 *
 * Un'edizione superata quindi si smorza e porta la data fino a cui è stata
 * in vigore. Quella data non è decorazione: chi ha in mano un contratto del
 * 2025 deve sapere se quel testo copre il suo periodo, e la risposta è
 * proprio lì invece che a due clic di distanza.
 */
@Component({
  selector: 'app-cella-edizione',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="etichetta" [class.is-superata]="!edizione().corrente">
      {{ edizione().etichetta }}
    </span>

    @if (!edizione().corrente) {
      <span class="validita">
        @if (edizione().validaAl) {
          fino al {{ edizione().validaAl | date: 'dd/MM/yyyy' }}
        } @else {
          non più in vigore
        }
      </span>
    }
  `,
  styles: `
    /* I due pezzi stanno incolonnati, non affiancati: in linea servirebbe
       più larghezza di quanta la colonna possa cederne. */
    :host {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      line-height: 1.3;
    }

    .etichetta {
      font-size: var(--t-sm);
      color: var(--c-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-variant-numeric: tabular-nums;
    }

    /* L'edizione superata si legge ancora, ma non compete con le correnti
       che le stanno intorno. */
    .etichetta.is-superata {
      color: var(--c-text-3);
      text-decoration: line-through;
      text-decoration-color: var(--c-text-ghost);
    }

    .validita {
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      color: var(--c-neg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class CellaEdizione {
  readonly edizione = input.required<Edizione>();
}
