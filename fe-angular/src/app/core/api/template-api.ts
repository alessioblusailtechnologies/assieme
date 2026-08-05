import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Id, TemplateOutput, TipologiaOutput } from '@core/models';

/**
 * Libreria dei template di output (RF-D-10…D-13).
 *
 * `GET /api/template` è lo stesso elenco che chat e tabelle usano per
 * esportare (RF-C-10, RF-C-14): la libreria è una, questa schermata è il suo
 * pannello di governo.
 */
@Injectable({ providedIn: 'root' })
export class TemplateApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/template`;

  urlElenco(): string {
    return this.base;
  }

  /**
   * L'anteprima è sempre un PDF, qualunque sia il formato di generazione:
   * mostra l'impaginazione — intestazione, stili, segnaposto (RF-D-11) —
   * e per quello un'immagine fedele basta e avanza.
   */
  urlAnteprima(id: Id): string {
    return `${this.base}/${id}/anteprima`;
  }

  /** RF-D-12: template propri del tenant, conformi allo schema dei segnaposto. */
  carica(file: File[]): Observable<HttpEvent<{ creati: TemplateOutput[] }>> {
    const corpo = new FormData();
    for (const f of file) corpo.append('file', f, f.name);
    return this.http.post<{ creati: TemplateOutput[] }>(this.base, corpo, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /**
   * RF-D-13: associa il template a una tipologia di output come predefinito.
   * Il server garantisce l'unicità: assegnare una tipologia la toglie a chi
   * la portava prima. `null` la rimuove.
   */
  impostaTipologia(id: Id, tipologia: TipologiaOutput | null): Observable<TemplateOutput[]> {
    return this.http.patch<TemplateOutput[]>(`${this.base}/${id}`, {
      tipologiaPredefinita: tipologia,
    });
  }

  /** Solo i personalizzati: i precaricati sono della piattaforma. */
  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
