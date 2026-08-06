import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { CredenzialeGenerata, CredenzialeMcp, Id } from '@core/models';

/**
 * Accesso via MCP (RF-F-02, RF-F-04) — la superficie FE del Modulo F, che
 * per il resto vive tutto nel backend.
 *
 * La generazione risponde con il token in chiaro **una sola volta**
 * (`CredenzialeGenerata`); da lì in poi l'elenco espone solo la forma
 * mascherata. La revoca è definitiva: una credenziale revocata resta in
 * elenco come storia, non torna valida.
 */
@Injectable({ providedIn: 'root' })
export class McpApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/mcp`;

  urlCredenziali(): string {
    return `${this.base}/credenziali`;
  }

  /** RF-F-04: le connessioni attive dei client esterni. */
  urlConnessioni(): string {
    return `${this.base}/connessioni`;
  }

  genera(nome: string): Observable<CredenzialeGenerata> {
    return this.http.post<CredenzialeGenerata>(`${this.base}/credenziali`, { nome });
  }

  revoca(id: Id): Observable<CredenzialeMcp> {
    return this.http.post<CredenzialeMcp>(`${this.base}/credenziali/${id}/revoca`, {});
  }
}
