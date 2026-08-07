import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { NuovaSegnalazione, Segnalazione } from '@core/models';

/**
 * Segnalazioni sull'Archivio Pubblico (RF-A-08).
 *
 * Questo file è il contratto verso il backend per il dominio: una rotta
 * sola, un comando. Non c'è lettura — le segnalazioni le legge il gestore
 * della piattaforma, non chi le ha inviate.
 */
@Injectable({ providedIn: 'root' })
export class SegnalazioniApi {
  private readonly http = inject(HttpClient);

  invia(segnalazione: NuovaSegnalazione): Observable<Segnalazione> {
    return this.http.post<Segnalazione>(`${environment.apiBase}/segnalazioni`, segnalazione);
  }
}
