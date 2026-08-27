import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Citazione } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';

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
  imports: [Icona, Suggerimento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="chip"
      [uiSuggerimento]="'«' + citazione().estratto + '»'"
      (click)="apri.emit(citazione())"
    >
      <ui-icon name="citazione" [size]="11" />
      <span class="chip__titolo">{{ citazione().documentoTitolo }}</span>
      <span class="chip__posizione">{{ posizione() }}</span>
    </button>
  `,
  styles: `
    /* L'host può stringersi fino a troncare il titolo: senza min-width a zero
       un elemento flessibile non scende sotto il proprio contenuto, e in
       una cella di tabella il chip sporgeva nella colonna accanto. */
    :host {
      display: inline-flex;
      min-width: 0;
      max-width: 100%;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      max-width: 100%;
      /* Niente esce dal bordo: se lo spazio manca, prima cede il titolo e
         poi anche la posizione, sempre coi puntini. */
      overflow: hidden;
      padding: 3px 8px;
      border: 1px solid var(--c-line);
      border-radius: var(--radius-pieno);
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

    /* Se manca spazio cede prima il titolo (si riconosce anche mozzo), e la
       posizione resta leggibile il più a lungo possibile. */
    .chip__titolo {
      flex: 1 10 auto;
      min-width: 3ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chip__posizione {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
