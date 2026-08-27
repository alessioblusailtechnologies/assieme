import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CellaTabella, Citazione } from '@core/models';
import { Accordion } from '@shared/ui/accordion/accordion';
import { ChipCitazione } from '@shared/ui/citazione/chip-citazione';
import { Icona } from '@shared/ui/icona/icona';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';

/**
 * Una cella della tabella di analisi (RF-C-12): valore con la citazione da
 * cui è tratto, oppure la dichiarazione esplicita che il dato non c'è.
 *
 * Il «non presente» non è un buco: è un'informazione di prima classe — in
 * una tabella di garanzie, sapere che una copertura manca vale quanto
 * conoscerne il massimale. Per questo ha una veste sua, distinta dalla cella
 * in attesa (che invece è un'assenza temporanea, e si vede pulsare).
 */
@Component({
  selector: 'app-cella-valore',
  imports: [Accordion, ChipCitazione, Icona, Suggerimento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = cella();
    @if (!c || c.stato === 'in-attesa') {
      <span class="attesa" role="status" aria-label="In generazione">
        <span class="attesa__barra" aria-hidden="true"></span>
      </span>
    } @else {
      @switch (c.esito) {
        @case ('presente') {
          <p class="valore">{{ c.valore }}</p>
          @if (c.citazioni.length) {
            <!-- Come nella chat: le fonti stanno in un accordion che nasce
                 chiuso, e il riepilogo dice già quanti passaggi ci sono. Una
                 griglia di chip aperti a ogni cella soffocava i valori. -->
            <ui-accordion class="fonti" etichetta="Fonti" [riepilogo]="riepilogo(c.citazioni)">
              <div class="fonti__elenco">
                @for (citazione of c.citazioni; track citazione.id) {
                  <ui-chip-citazione [citazione]="citazione" (apri)="apri.emit($event)" />
                }
              </div>
            </ui-accordion>
          }
        }
        @case ('non-presente') {
          <p class="assenza" [uiSuggerimento]="c.nota ?? ''">non presente</p>
        }
        @default {
          <p class="dubbio" [uiSuggerimento]="c.motivo">
            <ui-icon name="avviso" [size]="13" />
            <span>non determinabile</span>
          </p>
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      min-width: 0;
    }

    /* La cella in attesa pulsa: la griglia è viva, non rotta. */
    .attesa__barra {
      display: block;
      width: 64%;
      max-width: 140px;
      height: 10px;
      border-radius: var(--radius-sm);
      background: var(--c-page-alt);
      animation: pulsazione 1.4s ease-in-out infinite;
    }

    @keyframes pulsazione {
      50% {
        opacity: 0.35;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .attesa__barra {
        animation: none;
      }
    }

    .valore {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .fonti {
      margin-top: var(--sp-1);
      font-size: var(--t-xs);
    }

    /* Un chip per riga: nella cella la larghezza è poca, e affiancati si
       troncherebbero tutti a tre lettere. */
    .fonti__elenco {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--sp-1);
    }

    /* RF-C-12 con RF-C-08: l'assenza dichiarata, nella voce mono dei
       metadati - è un'annotazione del sistema, non un dato del documento. */
    .assenza,
    .dubbio {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      align-self: flex-start;
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--c-text-3);
      border-bottom: 1px dashed var(--c-line);
      cursor: help;
    }

    .dubbio {
      color: var(--c-warn, var(--c-text-3));
    }
  `,
})
export class CellaValore {
  /** `undefined` capita quando la colonna è appena nata: vale come attesa. */
  readonly cella = input.required<CellaTabella | undefined>();

  /** RF-C-05: chi ospita la griglia apre il visualizzatore sul passaggio. */
  readonly apri = output<Citazione>();

  /** Lo stesso patto dell'accordion in chat: da chiuso dice già quanto c'è. */
  protected riepilogo(citazioni: Citazione[]): string {
    return citazioni.length === 1 ? '1 passaggio' : `${citazioni.length} passaggi`;
  }
}
