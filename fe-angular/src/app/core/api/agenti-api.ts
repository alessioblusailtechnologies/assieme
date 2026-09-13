import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Agente, EsecuzioneAgente, Id, ModificheAgente, NuovoAgente } from '@core/models';

/**
 * Accesso agli agenti (RF-E-01…E-13).
 *
 * Come gli altri servizi di `core/api`, **è il contratto** verso il backend:
 * le letture espongono URL per `httpResource`, i comandi sono metodi.
 *
 * Il ritmo è quello già collaudato di documenti e tabelle: un'esecuzione
 * avviata si segue con il polling dello storico finché non si assesta -
 * niente streaming, un'esecuzione che dura minuti non è una risposta di chat.
 */
@Injectable({ providedIn: 'root' })
export class AgentiApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/agenti`;

  urlElenco(): string {
    return this.base;
  }

  urlDettaglio(id: Id): string {
    return `${this.base}/${id}`;
  }

  /** Lo storico delle esecuzioni (RF-E-06), la più recente in cima. */
  urlEsecuzioni(id: Id): string {
    return `${this.base}/${id}/esecuzioni`;
  }

  urlEsecuzione(id: Id, esecuzioneId: Id): string {
    return `${this.base}/${id}/esecuzioni/${esecuzioneId}`;
  }

  /** La libreria degli agenti predefiniti (RF-E-10). */
  urlPredefiniti(): string {
    return `${this.base}/predefiniti`;
  }

  /** RF-E-09: limiti del piano e consumi correnti, da mostrare prima dell'errore. */
  urlLimiti(): string {
    return `${this.base}/limiti`;
  }

  /**
   * La risposta arriva col piano già scritto: il server legge la richiesta
   * prima di rispondere, e ci mette qualche secondo.
   */
  crea(nuovo: NuovoAgente): Observable<Agente> {
    return this.http.post<Agente>(this.base, nuovo);
  }

  /** Una richiesta diversa si rilegge; quando corre, cambiato, rimette il piano da confermare. */
  modifica(id: Id, modifiche: ModificheAgente): Observable<Agente> {
    return this.http.patch<Agente>(`${this.base}/${id}`, modifiche);
  }

  /** «Rileggi la richiesta»: un piano nuovo, da confermare. */
  rileggiPiano(id: Id): Observable<Agente> {
    return this.http.post<Agente>(`${this.base}/${id}/piano`, {});
  }

  /** «Conferma e attiva»: da qui l'agente può partire, anche da solo. */
  conferma(id: Id): Observable<Agente> {
    return this.http.post<Agente>(`${this.base}/${id}/conferma`, {});
  }

  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** RF-E-01: la copia nasce disattiva, senza storico e col piano da confermare. */
  duplica(id: Id): Observable<Agente> {
    return this.http.post<Agente>(`${this.base}/${id}/duplica`, {});
  }

  /**
   * RF-E-03: esecuzione manuale, solo col piano confermato. La risposta è
   * l'esecuzione appena nata, in coda: il suo avanzamento si segue
   * interrogando lo storico.
   */
  esegui(id: Id): Observable<EsecuzioneAgente> {
    return this.http.post<EsecuzioneAgente>(`${this.base}/${id}/esecuzioni`, {});
  }
}
