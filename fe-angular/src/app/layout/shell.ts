import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { BarraLaterale } from './barra-laterale/barra-laterale';
import { BarraSuperiore } from './barra-superiore/barra-superiore';

/**
 * Struttura dell'applicazione: barra laterale, barra superiore, area di
 * lavoro.
 *
 * Il collegamento "salta al contenuto" non è cortesia formale. Le voci di
 * navigazione sono una decina e chi usa la tastiera le attraversa a ogni
 * cambio di schermata: senza questo collegamento, arrivare al contenuto
 * costa dieci pressioni di tabulatore ogni volta.
 *
 * Sotto i 768px la barra laterale non ha posto accanto al contenuto: diventa
 * un cassetto che si apre dal menu nella testata e si chiude toccando lo
 * sfondo o navigando. Lo stato vive qui, che è l'unico posto che vede
 * entrambe le barre.
 */
@Component({
  selector: 'app-shell',
  imports: [BarraLaterale, BarraSuperiore, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="salta" href="#contenuto">Salta al contenuto</a>

    <app-barra-laterale [class.is-aperta]="menuAperto()" />

    @if (menuAperto()) {
      <div class="sfondo" (click)="menuAperto.set(false)" aria-hidden="true"></div>
    }

    <div class="colonna">
      <app-barra-superiore [menuAperto]="menuAperto()" (menu)="menuAperto.set(!menuAperto())" />

      <main class="contenuto" id="contenuto" tabindex="-1">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      height: 100vh;
      /* La barra degli indirizzi di Safari e Chrome mobile si ritira allo
         scorrimento: dvh segue quella altezza, vh no. */
      height: 100dvh;
      overflow: hidden;
    }

    .colonna {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }

    /*
     * Scorre il contenuto, non la pagina: la barra laterale e quella
     * superiore restano ferme. In una chat lunga o in una tabella da
     * quaranta righe è la differenza fra sapere sempre dove ci si trova e
     * doverlo ritrovare.
     */
    /* L'area di lavoro è bianca sul contorno avorio: il contenuto è il
       foglio, la navigazione è il tavolo. */
    .contenuto {
      flex: 1;
      overflow: auto;
      background: var(--c-surface);
    }

    .contenuto:focus {
      outline: none;
    }

    /*
     * L'uscita del router resta nel DOM accanto al componente che ha
     * caricato: nascondendola si evita che partecipi all'impaginazione. Conta
     * per le schermate che si misurano sull'altezza della finestra — come
     * l'elenco dell'archivio, dove la griglia prende lo spazio che avanza e
     * qualche pixel di troppo la farebbe sbordare.
     */
    router-outlet {
      display: none;
    }

    .salta {
      position: absolute;
      top: var(--sp-2);
      left: var(--sp-2);
      z-index: var(--z-skip, 100);
      padding: var(--sp-2) var(--sp-3);
      background: var(--c-surface);
      border: 1px solid var(--c-accent);
      color: var(--c-accent);
      transform: translateY(-200%);
    }

    .salta:focus {
      transform: translateY(0);
    }

    /* Lo sfondo del cassetto: scuro quanto basta a dire «c'è un livello sopra». */
    .sfondo {
      display: none;
    }

    @media (max-width: 768px) {
      .sfondo {
        display: block;
        position: fixed;
        inset: 0;
        z-index: calc(var(--z-overlay) - 1);
        background: rgb(28 26 21 / 40%);
      }
    }
  `,
})
export class Shell {
  private readonly router = inject(Router);

  readonly menuAperto = signal(false);

  constructor() {
    /* Scegliere una voce chiude il cassetto: sullo schermo piccolo la
       navigazione è un gesto, non un pannello che resta. */
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuAperto.set(false));
  }
}
