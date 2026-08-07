import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Credenziali, EsitoAccesso } from '@core/models';

/**
 * Marca le richieste dell'autenticazione stessa: l'interceptor non deve
 * provare a rinnovare il token su un login fallito.
 */
export const RICHIESTA_DI_ACCESSO = new HttpContextToken<boolean>(() => false);

/** Accesso e rinnovo token — le uniche rotte che viaggiano senza Bearer. */
@Injectable({ providedIn: 'root' })
export class AccessoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/sessione`;

  accedi(credenziali: Credenziali): Observable<EsitoAccesso> {
    return this.http.post<EsitoAccesso>(`${this.base}/accesso`, credenziali, {
      context: new HttpContext().set(RICHIESTA_DI_ACCESSO, true),
    });
  }

  aggiorna(tokenAggiornamento: string): Observable<Omit<EsitoAccesso, 'sessione'>> {
    return this.http.post<Omit<EsitoAccesso, 'sessione'>>(
      `${this.base}/aggiorna`,
      { tokenAggiornamento },
      { context: new HttpContext().set(RICHIESTA_DI_ACCESSO, true) },
    );
  }
}
