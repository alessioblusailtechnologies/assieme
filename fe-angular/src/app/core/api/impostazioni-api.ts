import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Id, ModelloAI, VoceStoricoImpostazioni } from '@core/models';

/**
 * Impostazioni trasversali del Modulo D: scelta del livello AI (RF-D-02/03)
 * e storico delle modifiche (RF-D-07). L'identità visiva non c'è più
 * (11/09/2026): al suo posto intestazione e piè di pagina (fase 2 di
 * `PIANO-INTESTAZIONE-MODELLI.md`).
 *
 * Istruzioni, template e utenti hanno servizi propri: sono domini con un
 * ciclo di vita, non voci di configurazione.
 */
@Injectable({ providedIn: 'root' })
export class ImpostazioniApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  /** I modelli offerti dalla piattaforma, disponibili e non (RF-D-03). */
  urlModelli(): string {
    return `${this.base}/modelli`;
  }

  urlModelloAttivo(): string {
    return `${this.base}/modelli/attivo`;
  }

  /** RF-D-02: la scelta vale per tutto il tenant. Solo amministratore. */
  scegliModello(modelloId: Id): Observable<ModelloAI> {
    return this.http.put<ModelloAI>(this.urlModelloAttivo(), { modelloId });
  }

  /**
   * RF-D-07: chi, cosa, quando — per audit e diagnosi di risposte inattese.
   * `oggetti` filtra per tipo di voce, così ogni schermata mostra il suo.
   */
  urlStorico(oggetti: VoceStoricoImpostazioni['oggetto'][]): string {
    const query = oggetti.length ? `?oggetti=${oggetti.join(',')}` : '';
    return `${this.base}/impostazioni/storico${query}`;
  }
}
