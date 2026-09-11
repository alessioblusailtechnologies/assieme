import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { ImmagineCaricata, Intestazione, IntestazioneSalvata } from '@core/models';

/**
 * Intestazione e piè di pagina dell'agenzia (11/09/2026): la prima scheda
 * di Impostazioni > Template di output.
 *
 * Le immagini si scaricano come blob e non si mettono in un `<img src>`: la
 * rotta vuole il Bearer, e un tag `<img>` non lo manda. Così anche
 * l'anteprima, che è una POST col contenuto non ancora salvato.
 */
@Injectable({ providedIn: 'root' })
export class IntestazioneApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/intestazione`;

  url(): string {
    return this.base;
  }

  /** Solo amministratore. */
  salva(intestazione: Intestazione): Observable<IntestazioneSalvata> {
    return this.http.put<IntestazioneSalvata>(this.base, intestazione);
  }

  /** Un logo o un marchio: PNG o JPEG, al massimo 2 MB. */
  caricaImmagine(file: File): Observable<ImmagineCaricata> {
    const corpo = new FormData();
    corpo.append('file', file, file.name);
    return this.http.post<ImmagineCaricata>(`${this.base}/immagini`, corpo);
  }

  scaricaImmagine(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/immagini/${id}`, { responseType: 'blob' });
  }

  /** Il documento d'esempio col contenuto che si sta componendo, prima di salvarlo. */
  anteprima(intestazione: Intestazione, formato: 'pdf' | 'docx' = 'pdf'): Observable<Blob> {
    return this.http.post(
      `${this.base}/anteprima`,
      { ...intestazione, formato },
      { responseType: 'blob' },
    );
  }
}
