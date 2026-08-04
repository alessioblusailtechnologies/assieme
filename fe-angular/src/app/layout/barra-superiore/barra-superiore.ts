import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { SessioneStore } from '@core/auth/sessione-store';

/**
 * Barra superiore: contesto a sinistra, identità a destra.
 *
 * Il nome del tenant è sempre in vista di proposito. RF-B-01 fonda il
 * prodotto sull'isolamento fra agenzie, e in una sessione condivisa o in
 * demo la domanda "di chi sono questi documenti?" deve avere risposta a
 * colpo d'occhio, non dopo un clic.
 */
@Component({
  selector: 'app-barra-superiore',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contesto">
      @if (sessione.tenant(); as tenant) {
        <ui-icon name="compagnia" [size]="16" />
        <span class="contesto__nome">{{ tenant.nome }}</span>
      } @else if (sessione.inCaricamento()) {
        <span class="scheletro" aria-hidden="true"></span>
        <span class="visually-hidden">Caricamento della sessione in corso</span>
      }
    </div>

    <div class="identita">
      @if (sessione.utente(); as utente) {
        <span class="mono identita__ruolo">{{ utente.ruolo }}</span>
        <span class="identita__avatar" [title]="utente.nome + ' ' + utente.cognome">
          {{ sessione.iniziali() }}
        </span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-4);
      height: var(--topbar-h);
      flex: none;
      padding: 0 var(--sp-4);
      background: var(--c-surface);
      border-bottom: 1px solid var(--c-line);
    }

    .contesto {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      min-width: 0;
      color: var(--c-text-2);
    }

    .contesto__nome {
      font-size: var(--t-body);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .identita {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
    }

    .identita__ruolo {
      color: var(--c-text-3);
    }

    .identita__avatar {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      background: var(--c-accent-soft);
      color: var(--c-accent);
      font-size: var(--t-xs);
      letter-spacing: 0.02em;
    }

    /* Scheletro invece di spinner: occupa lo spazio che occuperà il
       contenuto, così la barra non sussulta quando la sessione arriva. */
    .scheletro {
      display: block;
      width: 160px;
      height: 12px;
      background: var(--c-page-alt);
    }
  `,
})
export class BarraSuperiore {
  protected readonly sessione = inject(SessioneStore);
}
