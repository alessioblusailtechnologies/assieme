import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';

/**
 * Tendina di scelta del design system.
 *
 * Un pulsante che apre un elenco: freccia su/giù per scorrere, Invio per
 * scegliere, Esc per chiudere, clic fuori per andarsene. Le opzioni sono
 * oggetti qualsiasi: `campoEtichetta` dice cosa mostrare, `campoValore`
 * cosa scrivere nel modello — la stessa forma d'uso dei filtri degli
 * archivi, che sono il suo caso d'uso.
 *
 * `azzerabile` aggiunge la X per tornare a «nessun filtro»: in una barra
 * filtri, togliere un criterio è frequente quanto metterlo.
 */
@Component({
  selector: 'ui-select',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './select.html',
  styleUrl: './select.scss',
})
export class Select {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly opzioni = input<unknown[]>([]);
  readonly campoEtichetta = input<string>();
  readonly campoValore = input<string>();
  readonly placeholder = input('Seleziona');
  readonly azzerabile = input(false);
  readonly ariaLabel = input<string>('');

  readonly valore = model<unknown>(undefined);

  protected readonly aperto = signal(false);
  protected readonly indiceAttivo = signal(0);

  protected etichettaDi(opzione: unknown): string {
    const campo = this.campoEtichetta();
    const grezzo = campo ? (opzione as Record<string, unknown>)[campo] : opzione;
    return String(grezzo ?? '');
  }

  protected valoreDi(opzione: unknown): unknown {
    const campo = this.campoValore();
    return campo ? (opzione as Record<string, unknown>)[campo] : opzione;
  }

  protected readonly etichettaScelta = computed(() => {
    const valore = this.valore();
    if (valore === undefined || valore === null || valore === '') return undefined;
    const scelta = this.opzioni().find((o) => this.valoreDi(o) === valore);
    return scelta !== undefined ? this.etichettaDi(scelta) : String(valore);
  });

  constructor() {
    /* Clic fuori: chiude. Il listener esiste solo a tendina aperta. */
    effect((pulizia) => {
      if (!this.aperto()) return;
      const chiudiSeFuori = (evento: MouseEvent) => {
        if (!this.host.nativeElement.contains(evento.target as Node)) this.aperto.set(false);
      };
      document.addEventListener('mousedown', chiudiSeFuori);
      pulizia(() => document.removeEventListener('mousedown', chiudiSeFuori));
    });
  }

  protected commuta(): void {
    if (this.aperto()) {
      this.aperto.set(false);
      return;
    }
    const indice = this.opzioni().findIndex((o) => this.valoreDi(o) === this.valore());
    this.indiceAttivo.set(Math.max(indice, 0));
    this.aperto.set(true);
  }

  protected suTasto(evento: KeyboardEvent): void {
    const opzioni = this.opzioni();
    if (!this.aperto()) {
      if (evento.key === 'ArrowDown' || evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        this.commuta();
      }
      return;
    }
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.indiceAttivo.update((i) => Math.min(i + 1, opzioni.length - 1));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.indiceAttivo.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        evento.preventDefault();
        this.scegli(opzioni[this.indiceAttivo()]);
        break;
      case 'Escape':
        evento.preventDefault();
        this.aperto.set(false);
        break;
    }
  }

  protected scegli(opzione: unknown): void {
    this.valore.set(this.valoreDi(opzione));
    this.aperto.set(false);
  }

  protected azzera(evento: Event): void {
    evento.stopPropagation();
    this.valore.set(undefined);
    this.aperto.set(false);
  }
}
