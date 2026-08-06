import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type VarianteTag = 'neutro' | 'accento';

/**
 * Tag: una pillola bordata per classificare — tipologie di documento,
 * categorie, appartenenze. Testo in tondo, leggibile: a differenza del
 * badge (mono maiuscolo, segnale di stato) il tag porta una parola che si
 * legge come tale.
 *
 * Come i chip dei file nel riferimento Harvey: superficie bianca, bordo
 * tenue, angoli pieni.
 */
@Component({
  selector: 'ui-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ng-content />`,
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

    .is-accento {
      border-color: var(--c-accent-hairline);
      color: var(--c-accent);
    }
  `,
})
export class Tag {
  readonly variante = input<VarianteTag>('neutro');
}
