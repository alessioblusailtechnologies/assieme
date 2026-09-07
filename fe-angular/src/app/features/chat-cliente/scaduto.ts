import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Dove finisce chi apre un link che l'agenzia non tiene più aperto — o che
 * ha smesso di valere mentre la pagina era ancora aperta (revocato,
 * scaduto, domande finite).
 *
 * Una pagina sua e non un messaggio dentro la chat: se il link non vale, la
 * chat non c'è, e mostrarne il guscio vuoto sarebbe peggio che dirlo.
 */
@Component({
  selector: 'app-link-scaduto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scaduto">
      <p class="scaduto__titolo">Questo collegamento non è più valido.</p>
      <p class="scaduto__nota">
        Se ti serve ancora, chiedi alla tua agenzia di mandartene uno nuovo.
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--c-page);
    }

    .scaduto {
      max-width: 34rem;
      margin: 0 auto;
      padding: var(--sp-12) var(--sp-4);
      text-align: center;
      color: var(--c-text-3);
    }

    .scaduto__titolo {
      font-family: var(--f-serif);
      font-size: var(--t-section);
      color: var(--c-text);
      margin-bottom: var(--sp-2);
    }

    .scaduto__nota {
      font-size: var(--t-sm);
    }
  `,
})
export class LinkScaduto {}
