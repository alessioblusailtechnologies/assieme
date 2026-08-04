import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Briciola {
  etichetta: string;
  /** Assente sull'ultima voce: è la posizione corrente, non un collegamento. */
  percorso?: string;
}

/**
 * Percorso di navigazione.
 *
 * In un archivio di migliaia di documenti sapere *dove si è* conta quanto
 * sapere cosa si sta guardando. Serve soprattutto in due momenti: quando si
 * arriva da un collegamento condiviso da un collega, e quando si è scesi in
 * una scheda dopo tre filtri e si vuole tornare indietro di un solo passo.
 *
 * L'ultima voce non è un collegamento e porta `aria-current="page"`: chi usa
 * uno screen reader sente dov'è senza doverlo dedurre dall'ordine.
 */
@Component({
  selector: 'ui-briciole',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Percorso di navigazione">
      <ol>
        @for (voce of voci(); track voce.etichetta; let ultima = $last) {
          <li>
            @if (voce.percorso && !ultima) {
              <a [routerLink]="voce.percorso">{{ voce.etichetta }}</a>
            } @else {
              <!--
                aria-current va SOLO sull'ultima voce. Una voce intermedia
                senza collegamento — un raggruppamento come "Archivi", che
                non è una schermata — resta testo semplice: marcarla come
                posizione corrente farebbe annunciare due posizioni a chi usa
                uno screen reader.
              -->
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
      flex-wrap: wrap;
      align-items: center;
      gap: var(--sp-2);
      font-family: var(--f-mono);
      font-size: var(--t-mono);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
      color: var(--c-text-3);
    }

    li {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
    }

    a {
      color: var(--c-text-3);
      text-decoration: none;
    }

    a:hover {
      color: var(--c-accent);
      text-decoration: underline;
    }

    /* La posizione corrente è più scura delle voci che la precedono: la
       gerarchia si legge senza dover cercare quale non sia cliccabile. */
    [aria-current='page'] {
      color: var(--c-text-2);
    }

    .separatore {
      color: var(--c-text-ghost);
    }
  `,
})
export class Briciole {
  readonly voci = input.required<Briciola[]>();
}
