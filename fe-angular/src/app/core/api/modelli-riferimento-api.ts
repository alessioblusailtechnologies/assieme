import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Id, ModelloRiferimento } from '@core/models';

/** Ciò che si cambia di un modello: nome, «quando usarlo», intestazione. */
export interface ModificaModello {
  nome?: string;
  descrizione?: string;
  intestazioneAgenzia?: boolean;
}

/**
 * I modelli di riferimento dell'agenzia (11/09/2026, fase 3 di
 * `PIANO-INTESTAZIONE-MODELLI.md`).
 *
 * `GET /api/template` è lo stesso elenco che la chat usa per «Genera da
 * modello»: la libreria è una, la scheda di Impostazioni è il suo pannello
 * di governo. La rotta resta `/api/template`: `/api/modelli` è dei livelli AI.
 */
@Injectable({ providedIn: 'root' })
export class ModelliRiferimentoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/template`;

  urlElenco(): string {
    return this.base;
  }

  /** L'anteprima, sempre PDF: il file stesso, o la conversione quando è pronta. */
  urlAnteprima(id: Id): string {
    return `${this.base}/${id}/anteprima`;
  }

  /** Uno o più file, di qualsiasi dei quattro formati. */
  carica(file: File[]): Observable<HttpEvent<{ creati: ModelloRiferimento[] }>> {
    const corpo = new FormData();
    for (const f of file) corpo.append('file', f, f.name);
    return this.http.post<{ creati: ModelloRiferimento[] }>(this.base, corpo, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /** Risponde con l'elenco intero. */
  modifica(id: Id, modifica: ModificaModello): Observable<ModelloRiferimento[]> {
    return this.http.patch<ModelloRiferimento[]>(`${this.base}/${id}`, modifica);
  }

  /** Il file originale, com'è stato caricato: col token, quindi come blob. */
  scarica(id: Id): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/file`, { responseType: 'blob' });
  }

  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
