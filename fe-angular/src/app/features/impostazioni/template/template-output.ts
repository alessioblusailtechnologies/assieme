import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { SchedaIntestazione } from './intestazione/scheda-intestazione';
import { SchedaModelli } from './modelli/scheda-modelli';

type Scheda = 'intestazione' | 'modelli';

/**
 * Impostazioni > Template di output (11/09/2026, `PIANO-INTESTAZIONE-MODELLI.md`).
 *
 * Due cose diverse che prima stavano in una pagina sola, e facevano rumore:
 * l'intestazione e il piè di pagina dell'agenzia, che vanno su ogni
 * documento; e i modelli di riferimento, che si richiamano in chat uno per
 * volta. La scheda sta nell'indirizzo (`?scheda=modelli`), così la chat può
 * mandare dritto a caricare un modello.
 */
@Component({
  selector: 'app-template-output',
  imports: [SchedaIntestazione, SchedaModelli],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './template-output.html',
  styleUrl: './template-output.scss',
})
export class TemplateOutputSezione {
  private readonly router = inject(Router);
  private readonly rotta = inject(ActivatedRoute);

  protected readonly scheda = signal<Scheda>(
    this.rotta.snapshot.queryParamMap.get('scheda') === 'modelli' ? 'modelli' : 'intestazione',
  );

  protected cambiaScheda(scheda: Scheda): void {
    this.scheda.set(scheda);
    void this.router.navigate([], {
      relativeTo: this.rotta,
      queryParams: { scheda: scheda === 'modelli' ? 'modelli' : null },
      replaceUrl: true,
    });
  }
}
