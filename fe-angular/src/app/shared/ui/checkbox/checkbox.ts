import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * Casella di spunta del design system.
 *
 * Un input nativo stilizzato, non una ricostruzione: spazio, tastiera e
 * lettori di schermo funzionano perché sotto c'è l'elemento giusto.
 * `inputId` permette l'etichetta esterna con `for`, come si deve.
 */
@Component({
  selector: 'ui-checkbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="checkbox"
      [id]="inputId()"
      [checked]="valore()"
      (change)="valore.set($any($event.target).checked)"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    input {
      appearance: none;
      width: 16px;
      height: 16px;
      margin: 0;
      border: 1px solid var(--c-line);
      border-radius: 4px;
      background: var(--c-surface);
      cursor: pointer;
      display: grid;
      place-content: center;
      transition:
        background var(--dur-fast) var(--ease-brand),
        border-color var(--dur-fast) var(--ease-brand);
    }

    input:hover {
      border-color: var(--c-text-mute);
    }

    input:checked {
      background: var(--c-accent);
      border-color: var(--c-accent);
    }

    /* Il segno di spunta, disegnato col clip-path: nessuna icona da caricare. */
    input:checked::before {
      content: '';
      width: 9px;
      height: 9px;
      background: #fff;
      clip-path: polygon(14% 44%, 0 65%, 40% 100%, 100% 16%, 84% 0%, 38% 66%);
    }

    input:focus-visible {
      outline: 2px solid var(--c-accent);
      outline-offset: 2px;
    }
  `,
})
export class Checkbox {
  readonly valore = model(false);
  readonly inputId = input<string>('');
}
