import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';

import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Icona } from '@shared/ui/icona/icona';
import { ImpostazioniApi } from '@core/api/impostazioni-api';
import { Id, ModelloAI, VoceStoricoImpostazioni } from '@core/models';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';

/**
 * Scelta del provider e del modello AI (RF-D-02/03).
 *
 * La scelta vale per tutto il tenant ed è dell'amministratore; l'operatore
 * vede quale modello è in uso e le sue caratteristiche — sapere con che
 * cosa si sta lavorando non è un privilegio.
 *
 * Sotto, lo storico delle modifiche (RF-D-07): chi ha cambiato modello e
 * quando. È il primo posto dove guardare quando «le risposte sono diverse
 * da ieri».
 */
@Component({
  selector: 'app-modello',
  imports: [Badge, Bottone, DatePipe, Icona, Scheletro, StatoVuoto, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modello.html',
  styleUrl: './modello.scss',
})
export class Modello {
  private readonly api = inject(ImpostazioniApi);
  private readonly sessione = inject(SessioneStore);

  private readonly risorsaModelli = httpResource<ModelloAI[]>(() => this.api.urlModelli());
  private readonly risorsaAttivo = httpResource<ModelloAI>(() => this.api.urlModelloAttivo());
  private readonly risorsaStorico = httpResource<VoceStoricoImpostazioni[]>(() =>
    this.api.urlStorico(['modello']),
  );

  protected readonly modelli = computed(() =>
    this.risorsaModelli.hasValue() ? this.risorsaModelli.value() : [],
  );
  protected readonly attivo = computed(() =>
    this.risorsaAttivo.hasValue() ? this.risorsaAttivo.value() : undefined,
  );
  protected readonly storico = computed(() =>
    this.risorsaStorico.hasValue() ? this.risorsaStorico.value() : [],
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
        this.risorsaStorico.reload();
        this.inSalvataggio.set(undefined);
      },
      error: () => this.inSalvataggio.set(undefined),
    });
  }

  protected etichettaAdeguatezza(m: ModelloAI): string {
    return m.adeguatezzaDocumentale === 'alta'
      ? 'adeguatezza documentale alta'
      : m.adeguatezzaDocumentale === 'media'
        ? 'adeguatezza documentale media'
        : 'adeguatezza documentale bassa';
  }
}
