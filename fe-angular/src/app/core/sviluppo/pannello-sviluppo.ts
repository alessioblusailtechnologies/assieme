import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Bottone } from '@shared/ui/bottone/bottone';

import { ErroreSimulato, SviluppoStore } from './sviluppo-store';
import { Icona } from '@shared/ui/icona/icona';
import { Ruolo } from '@core/models';
import { SessioneStore } from '@core/auth/sessione-store';

/**
 * Pannello di sviluppo.
 *
 * Mezza giornata di lavoro che si ripaga nella prima settimana. Gli stati
 * che rompono un'interfaccia — permessi mancanti, rete lenta, quota
 * superata — sviluppando non si incontrano mai: i dati arrivano subito e
 * l'utente è sempre amministratore. Poterli richiamare in due clic è la
 * differenza fra progettarli e scoprirli in produzione.
 *
 * Vale anche per chi non scrive codice: chi mostra la demo può passare da
 * operatore ad amministratore davanti al cliente senza chiedere aiuto.
 *
 * Non finge nulla lato client: imposta header che Mockoon interpreta, e il
 * 500 che arriva è un 500 vero (vedi `sviluppo.interceptor.ts`).
 */
@Component({
  selector: 'app-pannello-sviluppo',
  imports: [Bottone, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      uiBottone
      variante="primario"
      dimensione="piccolo"
      type="button"
      class="maniglia"
      (click)="dev.pannelloAperto.set(!dev.pannelloAperto())"
      [attr.aria-expanded]="dev.pannelloAperto()"
      aria-label="Strumenti di sviluppo"
    >
      <ui-icon name="impostazioni" [size]="14" />
      <span>dev</span>
    </button>

    @if (dev.pannelloAperto()) {
      <div class="pannello">
        <div class="campo">
          <label class="mono" for="dev-ruolo">Ruolo</label>
          <select id="dev-ruolo" [value]="dev.ruolo()" (change)="cambiaRuolo($event)">
            <option value="operatore">operatore</option>
            <option value="amministratore">amministratore</option>
          </select>
        </div>

        <div class="campo">
          <label class="mono" for="dev-latenza">Latenza extra</label>
          <select id="dev-latenza" [value]="dev.latenzaExtra()" (change)="cambiaLatenza($event)">
            <option value="0">naturale (400 ms)</option>
            <option value="3000">rete lenta (3 s)</option>
          </select>
        </div>

        <div class="campo">
          <label class="mono" for="dev-errore">Prossima chiamata</label>
          <select
            id="dev-errore"
            [value]="dev.erroreProssimaChiamata()"
            (change)="cambiaErrore($event)"
          >
            <option value="nessuno">normale</option>
            <option value="500">errore server (500)</option>
            <option value="403">permesso negato (403)</option>
            <option value="429">quota superata (429)</option>
            <option value="timeout">attesa lunga poi timeout (504)</option>
          </select>
        </div>

        <p class="nota">
          Gli errori valgono per una sola chiamata, poi si azzerano.
          Le impostazioni viaggiano come header verso Mockoon.
        </p>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      right: 0;
      bottom: var(--sp-4);
      z-index: var(--z-devtools);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--sp-2);
      font-size: var(--t-xs);
    }

    .maniglia {
      font-family: var(--f-mono);
      font-size: var(--t-mono);
      letter-spacing: var(--ls-mono);
      text-transform: uppercase;
    }

    .pannello {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      width: 260px;
      padding: var(--sp-4);
      margin-right: var(--sp-2);
      background: var(--c-ink);
      color: var(--c-text-oninverse-2);
      border: 1px solid var(--c-line-dark);
    }

    .campo {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
    }

    .campo .mono {
      color: var(--c-text-oninverse-mute);
      font-size: var(--t-mono-sm);
    }

    select {
      width: 100%;
      padding: var(--sp-1) var(--sp-2);
      background: var(--c-ink-raise-2);
      color: var(--c-text-oninverse);
      border: 1px solid var(--c-line-dark);
      font-size: var(--t-xs);
    }

    .nota {
      color: var(--c-text-oninverse-mute);
      font-size: var(--t-mono);
      line-height: 1.45;
    }
  `,
})
export class PannelloSviluppo {
  protected readonly dev = inject(SviluppoStore);
  private readonly sessione = inject(SessioneStore);

  protected cambiaRuolo(e: Event): void {
    this.dev.ruolo.set((e.target as HTMLSelectElement).value as Ruolo);
    /* Il ruolo viaggia come header, quindi cambiarlo non fa scattare da solo
       un nuovo caricamento: la sessione va richiesta di nuovo a mano. */
    this.sessione.ricarica();
  }

  protected cambiaLatenza(e: Event): void {
    this.dev.latenzaExtra.set(Number((e.target as HTMLSelectElement).value));
  }

  protected cambiaErrore(e: Event): void {
    this.dev.erroreProssimaChiamata.set((e.target as HTMLSelectElement).value as ErroreSimulato);
  }
}
