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
  viewChild,
} from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';

/** Una voce della tendina: un'etichetta che esiste già, o quella da creare. */
interface VoceEtichetta {
  nome: string;
  nuova: boolean;
}

let progressivo = 0;

const normalizza = (testo: string): string => testo.trim().toLocaleLowerCase('it');

/**
 * Le etichette di qualcosa, scelte da un vocabolario che si può allargare.
 *
 * Una tendina e non un campo libero (13/09/2026): scritte a mano, le
 * etichette diventano «in rinnovo», «In rinnovo» e «rinnovo» sullo stesso
 * gruppo di clienti, e il filtro per etichetta smette di servire. Qui si
 * sceglie fra quelle che ci sono già, e se quella giusta non c'è la si crea
 * dalla stessa tendina: scrivendo, in fondo compare «Crea «…»».
 *
 * Il confronto ignora maiuscole e spazi ai bordi: chi scrive «vip» trova
 * «VIP», e non gli si propone di crearne un doppione.
 */
@Component({
  selector: 'ui-scelta-etichette',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Un label e non un div: un clic ovunque nel riquadro porta nel campo,
         senza gestori da rendere accessibili a mano. -->
    <label class="campo" [class.is-aperta]="aperta()" [for]="idTendina + '-campo'">
      @for (e of scelte(); track e) {
        <span class="scelta">
          {{ e }}
          <button
            type="button"
            class="scelta__togli"
            [attr.aria-label]="'Togli ' + e"
            (click)="$event.stopPropagation(); togli(e)"
          >
            <ui-icon name="chiudi" [size]="11" />
          </button>
        </span>
      }
      @if (scelte().length < massimo()) {
        <input
          #campo
          [id]="idTendina + '-campo'"
          class="campo__testo"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          [attr.aria-label]="ariaLabel()"
          [attr.aria-expanded]="aperta()"
          [attr.aria-controls]="idTendina"
          [placeholder]="scelte().length ? 'Aggiungi…' : placeholder()"
          [maxLength]="lunghezzaMassima()"
          [value]="testo()"
          (focus)="aperta.set(true)"
          (input)="suInput($any($event.target).value)"
          (keydown)="suTasto($event)"
        />
      }
      <ui-icon class="campo__freccia" name="espandi-giu" [size]="14" />
    </label>

    @if (aperta() && scelte().length < massimo()) {
      <ul class="tendina" [id]="idTendina" role="listbox">
        @for (v of voci(); track v.nome + v.nuova; let i = $index) {
          <li>
            <button
              type="button"
              class="tendina__voce"
              role="option"
              [class.is-attiva]="indiceAttivo() === i"
              [class.is-nuova]="v.nuova"
              [attr.aria-selected]="indiceAttivo() === i"
              (mouseenter)="indiceAttivo.set(i)"
              (click)="scegli(v)"
            >
              @if (v.nuova) {
                <ui-icon name="aggiungi" [size]="13" />
                <span>Crea «{{ v.nome }}»</span>
              } @else {
                <span>{{ v.nome }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="tendina__vuota">
            {{
              testo().trim()
                ? '«' + testo().trim() + '» è già fra le etichette scelte.'
                : 'Nessun’altra etichetta: scrivine una per crearla.'
            }}
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-width: 0;
    }

    .campo {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--sp-1);
      width: 100%;
      min-height: 2.375rem;
      padding: 0.3125rem 0.625rem;
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-radius: var(--radius-sm);
      cursor: text;
      transition: border-color var(--dur-fast) var(--ease-brand);
    }

    .campo:hover {
      border-color: var(--c-text-ghost);
    }

    .campo.is-aperta,
    .campo:focus-within {
      border-color: var(--c-accent);
      box-shadow: 0 0 0 3px var(--c-accent-soft);
    }

    .campo__testo {
      flex: 1;
      min-width: 8rem;
      padding: 2px 0;
      border: 0;
      outline: none;
      background: transparent;
      font: inherit;
      font-size: var(--t-body);
      color: var(--c-text);
    }

    .campo__testo::placeholder {
      color: var(--c-text-mute);
    }

    .campo__freccia {
      flex: none;
      margin-left: auto;
      color: var(--c-text-mute);
    }

    /* Le scelte hanno lo stesso colore delle etichette nell'elenco: si
       riconoscono come la stessa cosa. */
    .scelta {
      display: inline-flex;
      align-items: center;
      gap: var(--sp-1);
      padding: 1px 4px 1px 8px;
      border-radius: var(--radius-pieno);
      background: var(--c-accent-soft);
      color: var(--c-accent);
      font-size: var(--t-xs);
    }

    .scelta__togli {
      display: inline-flex;
      align-items: center;
      padding: 2px;
      border: 0;
      border-radius: var(--radius-pieno);
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: 0.7;
    }

    .scelta__togli:hover {
      opacity: 1;
    }

    .tendina {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: var(--z-overlay);
      max-height: 280px;
      margin: 0;
      padding: var(--sp-1);
      overflow-y: auto;
      list-style: none;
      background: var(--c-surface);
      border: 1px solid var(--c-line);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px var(--c-ombra);
    }

    .tendina__voce {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
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

    .tendina__voce.is-attiva {
      background: var(--c-page-alt);
    }

    /* Creare è un gesto diverso dallo scegliere, e si vede. */
    .tendina__voce.is-nuova {
      color: var(--c-accent);
    }

    .tendina__vuota {
      padding: var(--sp-2) var(--sp-3);
      font-size: var(--t-sm);
      color: var(--c-text-3);
    }

    @media (pointer: coarse) {
      .campo {
        min-height: 44px;
      }

      .campo__testo {
        font-size: 16px;
      }
    }
  `,
})
export class SceltaEtichette {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Il vocabolario: le etichette che esistono già. */
  readonly opzioni = input<string[]>([]);
  /** Le etichette scelte, nell'ordine in cui sono state messe. */
  readonly scelte = model<string[]>([]);
  readonly placeholder = input("Aggiungi un'etichetta");
  readonly ariaLabel = input('Etichette');
  /** Gli stessi limiti del contratto: oltre, il server rifiuta. */
  readonly massimo = input(30);
  readonly lunghezzaMassima = input(60);

  protected readonly idTendina = `scelta-etichette-${++progressivo}`;
  protected readonly aperta = signal(false);
  protected readonly testo = signal('');
  protected readonly indiceAttivo = signal(0);

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  /**
   * Le voci della tendina: quelle che ci sono e non sono già scelte,
   * filtrate da ciò che si scrive, e in fondo la creazione quando il testo
   * non corrisponde a niente.
   */
  protected readonly voci = computed<VoceEtichetta[]>(() => {
    const scelte = new Set(this.scelte().map(normalizza));
    const cercato = normalizza(this.testo());
    const esistenti = [...new Set(this.opzioni())]
      .filter((o) => !scelte.has(normalizza(o)))
      .filter((o) => !cercato || normalizza(o).includes(cercato))
      .map((nome) => ({ nome, nuova: false }));
    const pulito = this.testo().trim();
    const esisteGia = this.opzioni().some((o) => normalizza(o) === cercato) || scelte.has(cercato);
    return pulito && !esisteGia ? [...esistenti, { nome: pulito, nuova: true }] : esistenti;
  });

  constructor() {
    /* Clic fuori: chiude. Il listener esiste solo a tendina aperta. */
    effect((pulizia) => {
      if (!this.aperta()) return;
      const chiudiSeFuori = (evento: MouseEvent) => {
        if (!this.host.nativeElement.contains(evento.target as Node)) this.chiudi();
      };
      document.addEventListener('mousedown', chiudiSeFuori);
      pulizia(() => document.removeEventListener('mousedown', chiudiSeFuori));
    });
  }

  protected focalizza(): void {
    this.campo()?.nativeElement.focus();
  }

  protected suInput(valore: string): void {
    this.testo.set(valore);
    this.indiceAttivo.set(0);
    this.aperta.set(true);
  }

  protected suTasto(evento: KeyboardEvent): void {
    const voci = this.voci();
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.aperta.set(true);
        this.indiceAttivo.update((i) => Math.min(i + 1, Math.max(voci.length - 1, 0)));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.indiceAttivo.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        /* Sempre trattenuto: dentro un modulo, Invio salverebbe la scheda
           invece di aggiungere l'etichetta. */
        evento.preventDefault();
        const voce = voci[this.indiceAttivo()];
        if (this.aperta() && voce) this.scegli(voce);
        break;
      }
      case 'Escape':
        if (this.aperta()) {
          evento.preventDefault();
          evento.stopPropagation();
          this.chiudi();
        }
        break;
      case 'Backspace':
        /* A campo vuoto toglie l'ultima, come in ogni campo a etichette. */
        if (!this.testo() && this.scelte().length) this.togli(this.scelte().at(-1)!);
        break;
    }
  }

  protected scegli(voce: VoceEtichetta): void {
    this.scelte.update((scelte) => [...scelte, voce.nome]);
    this.testo.set('');
    this.indiceAttivo.set(0);
    this.focalizza();
  }

  protected togli(nome: string): void {
    this.scelte.update((scelte) => scelte.filter((s) => s !== nome));
  }

  chiudi(): void {
    this.aperta.set(false);
    this.testo.set('');
    this.indiceAttivo.set(0);
  }
}
