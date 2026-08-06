import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Id, ModificheRicordo, NuovoRicordo, Ricordo } from '@core/models';

/**
 * Accesso alla memoria (RF-G-01…G-07).
 *
 * Come gli altri servizi di `core/api`, **è il contratto** verso il backend.
 *
 * L'elenco restituisce i ricordi di tenant più quelli personali dell'utente
 * corrente — mai quelli personali dei colleghi (RF-G-02): la separazione la
 * fa il server sulla sessione, non un parametro del client.
 */
@Injectable({ providedIn: 'root' })
export class MemoriaApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/ricordi`;

  urlElenco(): string {
    return this.base;
  }

  /** RF-G-07 dal pannello: la registrazione esplicita nasce `origine: 'esplicito'`. */
  crea(nuovo: NuovoRicordo): Observable<Ricordo> {
    return this.http.post<Ricordo>(this.base, nuovo);
  }

  /** RF-G-03: modificabile — testo, ambito, categoria — e sospendibile. */
  modifica(id: Id, modifiche: ModificheRicordo): Observable<Ricordo> {
    return this.http.patch<Ricordo>(`${this.base}/${id}`, modifiche);
  }

  /**
   * RF-G-03 con RF-G-05: la cancellazione è effettiva, non una sospensione —
   * il ricordo sparisce dal modello e non condiziona più nulla.
   */
  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
