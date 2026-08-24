import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Una tappa del percorso; senza `percorso` è la tappa corrente. */
export interface VoceBriciola {
  etichetta: string;
  percorso?: string;
}

/**
 * Percorso di navigazione.
 *
 * Una riga di metadati sopra il titolo, non un componente che si fa notare:
 * mono maiuscolo, separatori discreti, l'ultima tappa senza collegamento.
 */
@Component({
  selector: 'ui-briciole',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Percorso">
      <ol>
        @for (voce of voci(); track voce.etichetta; let ultima = $last) {
          <li>
            @if (voce.percorso && !ultima) {
              <a [routerLink]="voce.percorso">{{ voce.etichetta }}</a>
            } @else {
              <span [attr.aria-current]="ultima ? 'page' : null">{{ voce.etichetta }}</span>
            }
            @if (!ultima) {
              <span class="separatore" aria-hidden="true">/</span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    ol {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      font-family: var(--f-mono);
      font-size: var(--t-mono);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      color: var(--c-text-3);
      white-space: nowrap;
      /* Su uno schermo stretto un percorso lungo scorre, non sfonda la testata. */
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
    }

    ol::-webkit-scrollbar {
      display: none;
    }

    li {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-2);
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    a:hover {
      color: var(--c-accent);
      text-decoration: none;
    }

    .separatore {
      color: var(--c-text-ghost);
    }
  `,
})
export class Briciole {
  readonly voci = input.required<VoceBriciola[]>();
}
