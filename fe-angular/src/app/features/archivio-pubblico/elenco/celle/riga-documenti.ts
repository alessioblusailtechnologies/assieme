import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { Badge } from '@shared/ui/badge/badge';
import { DocumentoPubblico } from '@core/models';
import { RigaArchivio } from './riga-archivio';
import { etichettaTipologia } from '@shared/testi/etichette';

/** Altezza di una riga di documento, condivisa con `getRowHeight`. */
export const ALTEZZA_RIGA_DOCUMENTO = 34;
/** Spazio fisso della riga espansa: intestazione più margini. */
export const ALTEZZA_INTESTAZIONE_DOCUMENTI = 40;

/**
 * I documenti di un prodotto, dentro una riga a tutta larghezza.
 *
 * È la sostituzione del master/detail, che in AG Grid è Enterprise. Sotto
 * sotto la griglia non sa nulla di gerarchie: vede una riga in più, larga
 * quanto la tabella, e lascia a noi cosa metterci dentro.
 *
 * Qui dentro non serve un'altra griglia: sono tre o quattro righe, e una
 * lista si legge meglio di una tabella annidata con le sue intestazioni e la
 * sua barra di scorrimento.
 */
@Component({
  selector: 'app-riga-documenti',
  imports: [Badge, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prodotto(); as p) {
      <div class="pannello">
        <p class="mono intestazione">Set informativo — {{ p.nome }}</p>

        <ul class="documenti">
          @for (doc of p.documenti; track doc.id) {
            <li class="documento">
              <ui-badge variante="accento">{{ tipologia(doc) }}</ui-badge>

              <a class="titolo" [routerLink]="['/archivio/pubblico', doc.id]">{{ doc.titolo }}</a>

              <span class="edizione">{{ doc.edizione.etichetta }}</span>

              @if (doc.edizione.corrente) {
                <ui-badge variante="corrente">corrente</ui-badge>
              } @else {
                <ui-badge variante="storico">superata</ui-badge>
              }

              <span class="pagine">{{ doc.numeroPagine }} pag.</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      /* Fondo tenue e filetto a sinistra: si legge come una diramazione
         della riga sopra, non come un'altra sezione della pagina. */
      background: var(--c-surface-tint);
      border-left: 2px solid var(--c-accent);
    }

    .pannello {
      padding: var(--sp-2) var(--sp-4) var(--sp-3);
    }

    .intestazione {
      margin-bottom: var(--sp-1);
    }

    .documento {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      height: 34px;
      font-size: var(--t-sm);
    }

    .documento + .documento {
      border-top: 1px solid var(--c-line-soft);
    }

    /* Le tipologie incolonnate: scorrendo l'occhio trova subito le
       Condizioni senza leggere ogni titolo. */
    .documento ui-badge:first-child {
      flex: none;
      min-width: 96px;
      justify-content: center;
    }

    .titolo {
      flex: 1;
      min-width: 0;
      color: var(--c-text);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .titolo:hover {
      color: var(--c-accent);
      text-decoration: underline;
    }

    .edizione {
      flex: none;
      color: var(--c-text-2);
      font-variant-numeric: tabular-nums;
    }

    .pagine {
      flex: none;
      min-width: 7ch;
      text-align: right;
      color: var(--c-text-3);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class RigaDocumenti implements ICellRendererAngularComp {
  protected readonly prodotto = signal<RigaArchivio['prodotto'] | undefined>(undefined);
  protected readonly tipologia = (d: DocumentoPubblico) => etichettaTipologia(d.tipologia);

  agInit(params: ICellRendererParams<RigaArchivio>): void {
    this.prodotto.set(params.data?.prodotto);
  }

  refresh(params: ICellRendererParams<RigaArchivio>): boolean {
    this.prodotto.set(params.data?.prodotto);
    return true;
  }
}
