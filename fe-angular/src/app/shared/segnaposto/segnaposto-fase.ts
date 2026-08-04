import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { SessioneStore } from '@core/auth/sessione-store';

/**
 * Segnaposto delle schermate non ancora costruite.
 *
 * Riceve tutto da `data` di rotta tramite `withComponentInputBinding()`: una
 * sola classe copre tutte le sezioni, e la roadmap resta scritta accanto ai
 * percorsi in `app.routes.ts` invece che in un documento a parte che si
 * disallinea.
 *
 * Mostra sessione e permessi correnti — non per riempire lo spazio, ma
 * perché è la verifica visibile che l'autenticazione finta, l'interceptor di
 * sviluppo e il server mock siano davvero collegati: cambiando ruolo dal
 * pannello, questa lista cambia sotto gli occhi. Se non cambia, qualcosa
 * nella catena non funziona, e si scopre subito.
 */
@Component({
  selector: 'app-segnaposto-fase',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testata">
      <p class="mono">Fase {{ fase() }}</p>
      <h1 class="serif titolo">{{ titolo() }}</h1>
      <p class="descrizione">{{ descrizione() }}</p>
    </div>

    <div class="riquadri">
      <section class="riquadro">
        <p class="mono">Requisiti coperti</p>
        <ul class="requisiti">
          @for (r of requisiti(); track r) {
            <li>{{ r }}</li>
          }
        </ul>
      </section>

      <section class="riquadro">
        <p class="mono">Sessione corrente</p>
        @if (sessione.utente(); as utente) {
          <p class="utente">{{ utente.nome }} {{ utente.cognome }} — {{ utente.ruolo }}</p>
          <ul class="permessi">
            @for (p of sessione.sessione()?.permessi ?? []; track p) {
              <li><ui-icon name="pronto" [size]="13" /> {{ p }}</li>
            } @empty {
              <li class="vuoto">Nessun permesso oltre alla consultazione.</li>
            }
          </ul>
        } @else if (sessione.inCaricamento()) {
          <p class="vuoto">Caricamento…</p>
        } @else {
          <p class="vuoto">
            <ui-icon name="errore" [size]="14" />
            Sessione non disponibile: il server mock è avviato? (<code>npm run dev</code>)
          </p>
        }
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
      max-width: var(--content-max);
      padding: var(--sp-8) var(--sp-6);
    }

    .titolo {
      margin: var(--sp-2) 0 var(--sp-3);
      font-size: var(--t-page-title);
    }

    .descrizione {
      max-width: 62ch;
      color: var(--c-text-2);
      font-size: var(--t-lead);
    }

    .riquadri {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--sp-4);
      margin-top: var(--sp-8);
    }

    .riquadro {
      padding: var(--sp-4);
      background: var(--c-surface);
      border: 1px solid var(--c-line);
    }

    .riquadro .mono {
      margin-bottom: var(--sp-3);
    }

    .requisiti,
    .permessi {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      font-size: var(--t-sm);
      color: var(--c-text-2);
    }

    .permessi li {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      color: var(--c-pos);
      font-family: var(--f-mono);
      font-size: var(--t-xs);
    }

    .utente {
      margin-bottom: var(--sp-3);
      font-size: var(--t-sm);
    }

    .vuoto {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      color: var(--c-text-3);
      font-size: var(--t-sm);
    }

    code {
      font-family: var(--f-mono);
      font-size: var(--t-xs);
      background: var(--c-page-alt);
      padding: 1px 4px;
    }
  `,
})
export class SegnapostoFase {
  readonly titolo = input.required<string>();
  readonly fase = input.required<number>();
  readonly descrizione = input('');
  readonly requisiti = input<string[]>([]);

  protected readonly sessione = inject(SessioneStore);
}
