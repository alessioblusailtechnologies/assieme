import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import {
  Id,
  IdentitaVisiva,
  ModelloAI,
  VoceStoricoImpostazioni,
} from '@core/models';

/**
 * Impostazioni trasversali del Modulo D: scelta del modello AI (RF-D-02/03),
 * storico delle modifiche (RF-D-07), identità visiva (RF-D-12).
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

  /** Saldo, listino dei pesi e registro dei movimenti dei crediti. */
  urlCrediti(): string {
    return `${this.base}/crediti`;
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

  urlIdentitaVisiva(): string {
    return `${this.base}/identita-visiva`;
  }

  /** RF-D-12: colori, recapiti e firma che i template applicano. */
  salvaIdentitaVisiva(identita: IdentitaVisiva): Observable<IdentitaVisiva> {
    return this.http.put<IdentitaVisiva>(this.urlIdentitaVisiva(), identita);
  }

  /** Il logo dell'agenzia, in testa ai documenti generati (RF-D-12). */
  caricaLogo(file: File): Observable<{ logoUrl: string }> {
    return this.http.put<{ logoUrl: string }>(`${this.urlIdentitaVisiva()}/logo`, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  }
}
