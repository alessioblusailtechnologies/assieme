import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import {
  Id,
  ModificheTabella,
  NuovaColonna,
  NuovaTabella,
  TabellaAnalisi,
} from '@core/models';

/**
 * Accesso alle tabelle di analisi (RF-C-11…C-15).
 *
 * Come gli altri servizi di `core/api`, **è il contratto** verso il backend:
 * le letture espongono URL per `httpResource`, i comandi sono metodi.
 *
 * Una nota sul ritmo: la generazione è progressiva e il dettaglio viene
 * interrogato a intervalli finché `stato === 'in-generazione'` — lo stesso
 * schema dell'elaborazione documenti (RF-B-05). Niente streaming qui: una
 * cella ogni secondo non è una risposta di chat, e il polling tiene il
 * contratto a una sola forma di risposta.
 */
@Injectable({ providedIn: 'root' })
export class TabelleApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/tabelle`;

  urlElenco(): string {
    return this.base;
  }

  urlDettaglio(id: Id): string {
    return `${this.base}/${id}`;
  }

  /**
   * I set di criteri predefiniti pertinenti ai documenti scelti (RF-C-11):
   * il server risolve i rami dei documenti e propone i criteri di quei rami,
   * oltre a quelli validi ovunque.
   */
  urlCriteri(documentiIds: Id[]): string {
    const query = documentiIds.length
      ? `?documenti=${documentiIds.map(encodeURIComponent).join(',')}`
      : '';
    return `${this.base}/criteri${query}`;
  }

  /** La tabella nasce con le celle in attesa e si popola da sola (RF-C-11). */
  crea(nuova: NuovaTabella): Observable<TabellaAnalisi> {
    return this.http.post<TabellaAnalisi>(this.base, nuova);
  }

  /** RF-C-14 (rinomina) e RF-C-15 (condivisione nel tenant). */
  modifica(id: Id, modifiche: ModificheTabella): Observable<TabellaAnalisi> {
    return this.http.patch<TabellaAnalisi>(`${this.base}/${id}`, modifiche);
  }

  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * RF-C-15: chi riceve una tabella condivisa la duplica per proseguire in
   * autonomia. La copia appartiene a chi la chiede e nasce non condivisa.
   */
  duplica(id: Id): Observable<TabellaAnalisi> {
    return this.http.post<TabellaAnalisi>(`${this.base}/${id}/duplica`, {});
  }

  /** RF-C-14: nuove righe. Le celle nuove partono in attesa e si generano. */
  aggiungiDocumenti(id: Id, documentiIds: Id[]): Observable<TabellaAnalisi> {
    return this.http.post<TabellaAnalisi>(`${this.base}/${id}/documenti`, { documentiIds });
  }

  rimuoviDocumento(id: Id, documentoId: Id): Observable<TabellaAnalisi> {
    return this.http.delete<TabellaAnalisi>(`${this.base}/${id}/documenti/${documentoId}`);
  }

  /** RF-C-14: nuova colonna, predefinita o in linguaggio naturale. */
  aggiungiColonna(id: Id, colonna: NuovaColonna): Observable<TabellaAnalisi> {
    return this.http.post<TabellaAnalisi>(`${this.base}/${id}/colonne`, colonna);
  }

  rimuoviColonna(id: Id, colonnaId: Id): Observable<TabellaAnalisi> {
    return this.http.delete<TabellaAnalisi>(`${this.base}/${id}/colonne/${colonnaId}`);
  }

  /**
   * RF-C-14: esportazione su template di output (RF-D-10), XLSX in
   * particolare. La genera il server — è lui che applica il template
   * grafico dell'agenzia — e il client scarica il file.
   */
  esporta(id: Id, templateId: Id): Observable<Blob> {
    return this.http.post(`${this.base}/${id}/esporta`, { templateId }, { responseType: 'blob' });
  }
}
