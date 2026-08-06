import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NomeIcona } from '@shared/ui/icona/registro-icone';

export type VarianteTag = 'neutro' | 'accento';

/**
 * Tag: una pillola bordata per classificare — tipologie di documento,
 * categorie, appartenenze. Testo in tondo, leggibile: a differenza del
 * badge (mono maiuscolo, segnale di stato) il tag porta una parola che si
 * legge come tale.
 *
 * L'icona è facoltativa e viene dal registro: quando una classificazione ha
 * un segno di dominio (l'ambito di un ricordo, l'archivio di provenienza) il
 * tag lo mostra, e lo mostra uguale in tutta l'applicazione — è il motivo
 * per cui l'icona sta qui e non in un `<ui-icon>` appoggiato accanto.
 *
 * Come i chip dei file nel riferimento Harvey: superficie bianca, bordo
 * tenue, angoli pieni.
 */
@Component({
  selector: 'ui-tag',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (icona(); as nome) {
      <ui-icon [name]="nome" [size]="12" />
    }
    <ng-content />
  `,
  host: {
    '[class]': '"tag is-" + variante()',
  },
  styles: `
    .tag {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      padding: 2px 10px;
      border: 1px solid var(--c-line);
      border-radius: var(--radius-pieno);
      background: var(--c-surface);
      color: var(--c-text-2);
      font-size: var(--t-xs);
      line-height: 1.5;
      white-space: nowrap;
    }

    .tag ui-icon {
      color: var(--c-text-3);
    }

    .is-accento {
      border-color: var(--c-accent-hairline);
      color: var(--c-accent);
    }

    .is-accento ui-icon {
      color: var(--c-accent);
    }
  `,
})
export class Tag {
  readonly variante = input<VarianteTag>('neutro');
  readonly icona = input<NomeIcona | undefined>(undefined);
}
