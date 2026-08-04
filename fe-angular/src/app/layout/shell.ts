import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

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
 */
@Component({
  selector: 'app-shell',
  imports: [BarraLaterale, BarraSuperiore, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="salta" href="#contenuto">Salta al contenuto</a>

    <app-barra-laterale />

    <div class="colonna">
      <app-barra-superiore />

      <main class="contenuto" id="contenuto" tabindex="-1">
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      height: 100vh;
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
    .contenuto {
      flex: 1;
      overflow: auto;
      background: var(--c-page);
    }

    .contenuto:focus {
      outline: none;
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
  `,
})
export class Shell {}
