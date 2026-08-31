import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Permesso } from '@core/models';
import { SessioneStore } from '@core/auth/sessione-store';

interface VoceSezione {
  percorso: string;
  etichetta: string;
  spiega: string;
  /** Se presente, la voce compare solo a chi ha il permesso (RF-D-01). */
  permesso?: Permesso;
}

const VOCI: VoceSezione[] = [
  {
    percorso: 'modello',
    etichetta: 'Modello AI',
    spiega: 'Provider e modello con cui il sistema ragiona',
  },
  {
    percorso: 'istruzioni',
    etichetta: 'Istruzioni',
    spiega: 'Regole scritte e documenti di riferimento',
  },
  {
    percorso: 'template',
    etichetta: 'Template di output',
    spiega: 'Documenti generati con l’identità dell’agenzia',
  },
  {
    percorso: 'utenti',
    etichetta: 'Utenti',
    spiega: 'Chi accede e con quale ruolo',
    permesso: 'utenti.gestisci',
  },
  {
    percorso: 'mcp',
    etichetta: 'Accesso MCP',
    spiega: 'VELIA come strumento nei client AI esterni',
    permesso: 'mcp.credenziali',
  },
  {
    percorso: 'aspetto',
    etichetta: 'Aspetto',
    spiega: 'Tema chiaro o scuro, su questo computer',
  },
];

/**
 * Shell delle Impostazioni: navigazione secondaria a sinistra, sottosezione
 * a destra. Le voci si filtrano sui permessi, non sul ruolo (RF-D-01): la
 * regola è la stessa di tutta l'applicazione — mai chiedere «sei
 * amministratore?», sempre `puo()`.
 */
@Component({
  selector: 'app-sezione-impostazioni',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="indice" aria-label="Sottosezioni delle impostazioni">
      <p class="mono indice__titolo">Impostazioni</p>
      <ul>
        @for (voce of voci(); track voce.percorso) {
          <li>
            <a class="voce" [routerLink]="voce.percorso" routerLinkActive="is-attiva">
              <span class="voce__etichetta">{{ voce.etichetta }}</span>
              <span class="voce__spiega">{{ voce.spiega }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>

    <div class="contenuto">
      <router-outlet />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      height: 100%;
      min-height: 0;
    }

    .indice {
      flex: none;
      width: 248px;
      padding: var(--sp-6) var(--sp-4);
      border-right: 1px solid var(--c-line);
      background: var(--c-surface);
      overflow-y: auto;
    }

    .indice__titolo {
      margin-bottom: var(--sp-3);
      padding: 0 var(--sp-2);
    }

    .indice ul {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .voce {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: var(--sp-2);
      border-radius: var(--radius-sm);
      text-decoration: none;
      color: var(--c-text-2);
    }

    .voce:hover {
      background: var(--c-page-alt);
      text-decoration: none;
    }

    .voce.is-attiva {
      background: var(--c-accent-soft, var(--c-page-alt));
      color: var(--c-accent);
    }

    .voce__etichetta {
      font-size: var(--t-sm);
      color: var(--c-text);
    }

    .voce.is-attiva .voce__etichetta {
      color: var(--c-accent);
    }

    .voce__spiega {
      font-size: var(--t-xs);
      color: var(--c-text-3);
    }

    .contenuto {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
    }

    @media (max-width: 900px) {
      :host {
        flex-direction: column;
      }

      .indice {
        width: auto;
        border-right: 0;
        border-bottom: 1px solid var(--c-line);
        padding: var(--sp-3) var(--sp-4);
      }

      .indice ul {
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--sp-1);
      }

      .voce__spiega {
        display: none;
      }
    }
  `,
})
export class SezioneImpostazioni {
  private readonly sessione = inject(SessioneStore);

  protected readonly voci = computed(() =>
    VOCI.filter((v) => !v.permesso || this.sessione.puo(v.permesso)),
  );
}
