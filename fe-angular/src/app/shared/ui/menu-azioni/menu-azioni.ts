import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, signal } from '@angular/core';

/** Una voce del menù: etichetta, eventuale dettaglio a destra, azione. */
export interface VoceMenu {
  etichetta: string;
  dettaglio?: string;
  /**
   * Sotto quale intestazione sta la voce (12/09/2026). Le voci con lo
   * stesso `gruppo` vanno consecutive: l'intestazione compare quando
   * cambia. Serve ai menù che raccolgono più famiglie di azioni in un
   * elenco solo, invece di annidare un secondo menù dentro il primo.
   */
  gruppo?: string;
  azione: () => void;
}

/*
 * Le misure con cui si stima l'ingombro del menù prima di disegnarlo,
 * arrotondate per eccesso: meglio aprirlo verso l'alto una volta di troppo
 * che vederlo uscire dallo schermo. Prese su un menù di sei voci e tre
 * gruppi (327 px), il più alto che abbiamo. La stima può sbagliare, e
 * infatti non è l'unica difesa: `max-height` sul menù lo tiene comunque
 * dentro lo schermo, al peggio con una scorsa.
 */
const ALTEZZA_VOCE = 36;
const ALTEZZA_GRUPPO = 34;
const MARGINE = 4;

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
        @for (voce of voci(); track voce.etichetta; let i = $index) {
          @if (voce.gruppo && voce.gruppo !== voci()[i - 1]?.gruppo) {
            <p class="mono gruppo" role="presentation">{{ voce.gruppo }}</p>
          }
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
      /* Qualunque cosa dica la stima, il menù resta dentro lo schermo. */
      max-height: calc(100vh - 16px);
      overflow-y: auto;
      padding: var(--sp-1);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px var(--c-ombra);
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

    /* L'intestazione di un gruppo: dice di che famiglia sono le voci sotto,
       senza costringere a un secondo menù. Non è cliccabile, e la riga di
       separazione la porta solo se qualcosa la precede. */
    .gruppo {
      margin: 0;
      padding: var(--sp-2) var(--sp-3) var(--sp-1);
    }

    .gruppo:not(:first-child) {
      margin-top: var(--sp-1);
      border-top: 1px solid var(--c-line-soft);
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

  /**
   * Apre accanto all'elemento che ha scatenato l'evento: sotto se c'è
   * posto, sopra se il pulsante sta in fondo allo schermo.
   *
   * L'altezza si stima dalle voci invece di misurarla dopo il disegno: il
   * menù nasce già al posto giusto, e non si vede scivolare. La stima è per
   * eccesso di poco, e uno scarto di qualche pixel non si nota; quel che si
   * noterebbe è il menù della barra sopra il composer che esce dallo
   * schermo, perché lì il pulsante è già in fondo.
   */
  apri(evento: Event): void {
    const innesco = (evento.currentTarget ?? evento.target) as HTMLElement;
    const riquadro = innesco.getBoundingClientRect();
    const voci = this.voci();
    const gruppi = new Set(voci.map((v) => v.gruppo).filter(Boolean)).size;
    const stimaAltezza = voci.length * ALTEZZA_VOCE + gruppi * ALTEZZA_GRUPPO + 2 * MARGINE;
    const sotto = riquadro.bottom + MARGINE;
    const staSotto = sotto + stimaAltezza <= window.innerHeight - MARGINE;
    this.posizione.set({
      x: Math.min(riquadro.left, window.innerWidth - 260),
      y: staSotto
        ? sotto
        : Math.max(MARGINE, riquadro.top - MARGINE - stimaAltezza),
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
