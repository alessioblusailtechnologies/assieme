import { Injectable, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { Conversazione, Paginato } from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';

/**
 * Lo storico delle conversazioni (RF-C-01), la più recente in cima.
 *
 * Vive in `core` e non nella funzionalità chat perché ha due lettori con
 * cicli di vita diversi: la **barra laterale**, che lo mostra sotto la voce
 * Chat ed esiste per tutta la sessione, e lo store della chat, che vive
 * quanto la permanenza nella sezione. Se stesse nella funzionalità, il
 * layout dovrebbe importare da `features/` — ed è esattamente la dipendenza
 * che la struttura del progetto vieta di creare.
 */
@Injectable({ providedIn: 'root' })
export class StoricoConversazioni {
  private readonly api = inject(ConversazioniApi);

  private readonly risorsa = httpResource<Paginato<Conversazione>>(() => this.api.urlElenco());

  readonly conversazioni = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().elementi : [],
  );
  readonly inCaricamento = this.risorsa.isLoading;
  readonly errore = this.risorsa.error;

  ricarica(): void {
    this.risorsa.reload();
  }
}
