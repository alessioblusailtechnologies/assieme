import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Icona } from '@shared/ui/icona/icona';
import { Id, ModelloAI } from '@core/models';
import { LivelliStore } from '@core/impostazioni/livelli-store';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';

/**
 * Scelta del livello AI (RF-D-02/03): Medio, Avanzato o Boost. Il modello
 * che serve ciascun livello lo decide il backend, e qui non arriva.
 *
 * La scelta vale per tutto il tenant ed è dell'amministratore; l'operatore
 * vede quale livello è in uso e le sue caratteristiche — sapere con che
 * cosa si sta lavorando non è un privilegio. Passa da `LivelliStore`, lo
 * stesso che legge la chat: quello che si sceglie qui, il composer lo
 * mostra subito.
 *
 * La pagina mostra solo i livelli disponibili: uno il cui fornitore non è
 * ancora configurato resta un fatto del backend finché non si può scegliere
 * davvero. Lo storico delle modifiche (RF-D-07) resta registrato dal server;
 * qui non si mostra.
 */
@Component({
  selector: 'app-modello',
  imports: [Bottone, Icona, Scheletro, StatoVuoto, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modello.html',
  styleUrl: './modello.scss',
})
export class Modello {
  private readonly livelli = inject(LivelliStore);
  private readonly sessione = inject(SessioneStore);

  protected readonly modelli = this.livelli.livelli;
  protected readonly attivo = this.livelli.agenzia;
  protected readonly inCaricamento = this.livelli.inCaricamento;
  protected readonly errore = this.livelli.errore;

  protected readonly puoConfigurare = computed(() => this.sessione.puo('modello-ai.configura'));

  protected readonly inSalvataggio = signal<Id | undefined>(undefined);

  constructor() {
    this.livelli.ricarica();
  }

  protected riprova(): void {
    this.livelli.ricarica();
  }

  protected scegli(modello: ModelloAI): void {
    if (this.inSalvataggio()) return;
    this.inSalvataggio.set(modello.id);
    this.livelli.scegli(modello.id).subscribe({
      next: () => this.inSalvataggio.set(undefined),
      error: () => this.inSalvataggio.set(undefined),
    });
  }
}
