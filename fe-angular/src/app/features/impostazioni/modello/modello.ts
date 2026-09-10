import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Icona } from '@shared/ui/icona/icona';
import { ImpostazioniApi } from '@core/api/impostazioni-api';
import { Id, ModelloAI } from '@core/models';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';

/**
 * Scelta del livello AI (RF-D-02/03): Avanzato o Boost. Il modello che
 * serve ciascun livello lo decide il backend, e qui non arriva.
 *
 * La scelta vale per tutto il tenant ed è dell'amministratore; l'operatore
 * vede quale livello è in uso e le sue caratteristiche — sapere con che
 * cosa si sta lavorando non è un privilegio.
 *
 * Il badge dice la posizione nella scala e non l'adeguatezza documentale:
 * l'ordine dei nomi l'ha deciso il committente, e l'adeguatezza di Avanzato
 * (media, non validata) sotto quella di Medio (alta) lo avrebbe smentito.
 *
 * La pagina mostra solo i livelli disponibili: uno il cui fornitore non è
 * ancora configurato resta un fatto del backend finché non si può scegliere
 * davvero. Lo storico delle modifiche (RF-D-07) resta registrato dal server;
 * qui non si mostra.
 */
@Component({
  selector: 'app-modello',
  imports: [Badge, Bottone, Icona, Scheletro, StatoVuoto, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modello.html',
  styleUrl: './modello.scss',
})
export class Modello {
  private readonly api = inject(ImpostazioniApi);
  private readonly sessione = inject(SessioneStore);

  private readonly risorsaModelli = httpResource<ModelloAI[]>(() => this.api.urlModelli());
  private readonly risorsaAttivo = httpResource<ModelloAI>(() => this.api.urlModelloAttivo());

  protected readonly modelli = computed(() =>
    this.risorsaModelli.hasValue() ? this.risorsaModelli.value().filter((m) => m.disponibile) : [],
  );
  protected readonly attivo = computed(() =>
    this.risorsaAttivo.hasValue() ? this.risorsaAttivo.value() : undefined,
  );
  protected readonly inCaricamento = this.risorsaModelli.isLoading;
  protected readonly errore = this.risorsaModelli.error;

  protected readonly puoConfigurare = computed(() => this.sessione.puo('modello-ai.configura'));

  protected readonly inSalvataggio = signal<Id | undefined>(undefined);

  protected riprova(): void {
    this.risorsaModelli.reload();
    this.risorsaAttivo.reload();
  }

  protected scegli(modello: ModelloAI): void {
    if (this.inSalvataggio()) return;
    this.inSalvataggio.set(modello.id);
    this.api.scegliModello(modello.id).subscribe({
      next: (attivo) => {
        this.risorsaAttivo.set(attivo);
        this.inSalvataggio.set(undefined);
      },
      error: () => this.inSalvataggio.set(undefined),
    });
  }
}
