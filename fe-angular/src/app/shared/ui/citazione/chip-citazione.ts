import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Tooltip } from 'primeng/tooltip';

import { Citazione } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';

/**
 * Chip di citazione — il componente su cui poggia la verificabilità.
 *
 * RF-C-04: ogni risposta fondata sui documenti dichiara da dove viene, e la
 * citazione porta documento e posizione. RF-C-05: da qui si apre il
 * documento sul passaggio. Il chip attraversa chat, tabelle di analisi ed
 * esecuzioni degli agenti: per questo vive in `shared/ui`.
 *
 * Chi lo preme deve sapere cosa succederà: il suggerimento mostra l'estratto
 * testuale, così l'apertura del documento è una conferma, non una scoperta.
 */
@Component({
  selector: 'ui-chip-citazione',
  imports: [Icona, Tooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="chip"
      [pTooltip]="'«' + citazione().estratto + '»'"
      tooltipPosition="top"
      (click)="apri.emit(citazione())"
    >
      <ui-icon name="citazione" [size]="11" />
      <span class="chip__titolo">{{ citazione().documentoTitolo }}</span>
      <span class="chip__posizione">{{ posizione() }}</span>
    </button>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      max-width: 100%;
      padding: 3px 8px;
      border: 1px solid var(--c-line);
      background: var(--c-surface);
      color: var(--c-text-2);
      font-size: var(--t-xs);
      cursor: pointer;
      transition: border-color var(--dur-fast) var(--ease-brand);
    }

    .chip:hover,
    .chip:focus-visible {
      border-color: var(--c-accent);
      color: var(--c-accent);
    }

    .chip__titolo {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chip__posizione {
      flex: none;
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--c-text-3);
    }

    .chip:hover .chip__posizione,
    .chip:focus-visible .chip__posizione {
      color: var(--c-accent);
    }
  `,
})
export class ChipCitazione {
  readonly citazione = input.required<Citazione>();

  /** RF-C-05: chi ospita il chip decide come aprire il visualizzatore. */
  readonly apri = output<Citazione>();

  /**
   * `articolo` e `sezione` parlano all'utente, la pagina al visualizzatore:
   * si mostra il riferimento più vicino al modo in cui l'intermediario cita
   * nel proprio lavoro, con la pagina sempre in coda.
   */
  protected readonly posizione = computed(() => {
    const p = this.citazione().posizione;
    const parti: string[] = [];
    if (p.articolo) parti.push(`art. ${p.articolo}`);
    else if (p.sezione) parti.push(p.sezione);
    parti.push(`p. ${p.pagina}`);
    return parti.join(' · ');
  });
}
