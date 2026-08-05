import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Bottone } from '@shared/ui/bottone/bottone';

import { Icona } from '@shared/ui/icona/icona';

/** Una voce della coda. Ricalca `VoceCoda` dello store, senza dipenderne. */
export interface FileInCoda {
  nome: string;
  dimensione: number;
  stato: 'in-corso' | 'completato' | 'errore';
  percentuale: number;
  messaggio?: string;
}

/**
 * Riepilogo dei caricamenti in corso.
 *
 * Compatto e in testata, non una finestra modale: chi lascia dieci file deve
 * poter continuare a lavorare mentre salgono. Una finestra che copre
 * l'archivio trasforma un'operazione di sfondo in un'attesa forzata.
 *
 * Sta in `shared/` perché la Fase 5 la riusa per i documenti di riferimento.
 */
@Component({
  selector: 'ui-coda-caricamento',
  imports: [Bottone, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testata">
      <p class="mono">{{ riassunto() }}</p>

      @if (!inCorso()) {
        <button
          uiBottone
          variante="testo"
          dimensione="piccolo"
          type="button"
          (click)="chiudi.emit()"
        >
          <ui-icon name="chiudi" [size]="13" />
          <span>Chiudi</span>
        </button>
      }
    </div>

    <ul class="voci">
      @for (v of file(); track v.nome + v.dimensione) {
        <li class="voce" [class.is-errore]="v.stato === 'errore'">
          <span class="nome">{{ v.nome }}</span>

          @switch (v.stato) {
            @case ('in-corso') {
              <span class="mono percentuale">{{ v.percentuale }}%</span>
              <span class="barra" aria-hidden="true">
                <span class="barra__pieno" [style.width.%]="v.percentuale"></span>
              </span>
            }
            @case ('completato') {
              <!--
                "In elaborazione" e non "completato": il file è arrivato ma il
                documento non è ancora utilizzabile in chat. Dire "fatto" a
                metà strada è il modo più rapido per far credere che qualcosa
                sia pronto quando non lo è.
              -->
              <span class="mono esito">in elaborazione</span>
            }
            @case ('errore') {
              <span class="mono esito">{{ v.messaggio }}</span>
            }
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      padding: var(--sp-3) var(--sp-4);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
    }

    .testata {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-3);
      margin-bottom: var(--sp-2);
    }

    .voci {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
    }

    .voce {
      display: grid;
      grid-template-columns: 1fr auto 120px;
      align-items: center;
      gap: var(--sp-3);
      font-size: var(--t-sm);
    }

    .nome {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--c-text-2);
    }

    .percentuale {
      font-variant-numeric: tabular-nums;
    }

    .barra {
      display: block;
      height: 4px;
      background: var(--c-page-alt);
    }

    .barra__pieno {
      display: block;
      height: 100%;
      background: var(--c-accent);
      transition: width var(--dur-fast) linear;
    }

    /* L'esito occupa le due colonne di destra, dove stavano percentuale e
       barra: così la riga non si riassesta quando il caricamento finisce. */
    .esito {
      grid-column: 2 / -1;
      text-align: right;
      color: var(--c-text-3);
    }

    .voce.is-errore .nome,
    .voce.is-errore .esito {
      color: var(--c-neg);
    }

    .voce.is-errore .esito {
      /* Il motivo dell'errore è una frase, non un'etichetta: va letto. */
      font-family: var(--f-sans);
      font-size: var(--t-xs);
      letter-spacing: normal;
      text-transform: none;
      white-space: normal;
    }
  `,
})
export class CodaCaricamento {
  readonly file = input.required<readonly FileInCoda[]>();
  readonly chiudi = output<void>();

  protected readonly inCorso = computed(() => this.file().some((v) => v.stato === 'in-corso'));

  protected readonly riassunto = computed(() => {
    const voci = this.file();
    const inCorso = voci.filter((v) => v.stato === 'in-corso').length;
    const errori = voci.filter((v) => v.stato === 'errore').length;

    if (inCorso) return `caricamento — ${inCorso} di ${voci.length}`;
    if (errori) return `${errori} ${errori === 1 ? 'file non caricato' : 'file non caricati'}`;
    return `${voci.length} ${voci.length === 1 ? 'file caricato' : 'file caricati'}`;
  });
}
