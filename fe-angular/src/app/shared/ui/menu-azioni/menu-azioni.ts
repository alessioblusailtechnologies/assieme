import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, signal } from '@angular/core';

/** Una voce del menù: etichetta, eventuale dettaglio a destra, azione. */
export interface VoceMenu {
  etichetta: string;
  dettaglio?: string;
  azione: () => void;
}

/**
 * Menù di azioni a comparsa.
 *
 * Uno per schermata, non uno per riga: chi lo apre passa l'evento del clic e
 * il menù si posiziona accanto al pulsante premuto. Esc e il clic fuori
 * chiudono. In chat è la scelta del template di esportazione (RF-C-10).
 */
@Component({
  selector: 'ui-menu-azioni',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'chiudi()',
  },
  template: `
    @if (aperto()) {
      <div
        class="menu"
        role="menu"
        [style.left.px]="posizione().x"
        [style.top.px]="posizione().y"
      >
        @for (voce of voci(); track voce.etichetta) {
          <button type="button" role="menuitem" class="voce" (click)="esegui(voce)">
            <span class="voce__etichetta">{{ voce.etichetta }}</span>
            @if (voce.dettaglio) {
              <span class="voce__dettaglio">{{ voce.dettaglio }}</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    .menu {
      position: fixed;
      z-index: var(--z-dialog);
      min-width: 240px;
      padding: var(--sp-1);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px rgb(28 26 21 / 12%);
    }

    .voce {
      display: flex;
      align-items: baseline;
      gap: var(--sp-3);
      width: 100%;
      padding: var(--sp-2) var(--sp-3);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      font: inherit;
      font-size: var(--t-body);
      color: var(--c-text);
      text-align: left;
      cursor: pointer;
    }

    .voce:hover,
    .voce:focus-visible {
      background: var(--c-page-alt);
    }

    .voce__etichetta {
      flex: 1;
      min-width: 0;
    }

    .voce__dettaglio {
      flex: none;
      font-family: var(--f-mono);
      font-size: var(--t-mono-sm);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--c-text-3);
    }
  `,
})
export class MenuAzioni {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly voci = input<VoceMenu[]>([]);

  protected readonly aperto = signal(false);
  protected readonly posizione = signal({ x: 0, y: 0 });

  constructor() {
    effect((pulizia) => {
      if (!this.aperto()) return;
      const chiudiSeFuori = (evento: MouseEvent) => {
        if (!this.host.nativeElement.contains(evento.target as Node)) this.chiudi();
      };
      /* Al prossimo giro, non subito: il clic che ha aperto il menù non deve
         essere anche quello che lo chiude. */
      const timer = setTimeout(() => document.addEventListener('mousedown', chiudiSeFuori));
      pulizia(() => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', chiudiSeFuori);
      });
    });
  }

  /** Apre accanto all'elemento che ha scatenato l'evento. */
  apri(evento: Event): void {
    const innesco = (evento.currentTarget ?? evento.target) as HTMLElement;
    const riquadro = innesco.getBoundingClientRect();
    this.posizione.set({
      x: Math.min(riquadro.left, window.innerWidth - 260),
      y: Math.min(riquadro.bottom + 4, window.innerHeight - 200),
    });
    this.aperto.set(true);
  }

  chiudi(): void {
    this.aperto.set(false);
  }

  protected esegui(voce: VoceMenu): void {
    this.chiudi();
    voce.azione();
  }
}
