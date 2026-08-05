import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Id, NuovoUtente, Ruolo, Utente } from '@core/models';

/**
 * Gestione utenti del tenant (RF-D-01) — riservata a chi ha
 * `utenti.gestisci`; il server risponde 403 agli altri.
 *
 * Non esiste un'eliminazione: un utente si **sospende**. Chi se ne va
 * lascia conversazioni, tabelle e regole firmate col suo nome, e un elenco
 * che perde gli autori diventa un archivio di orfani.
 */
@Injectable({ providedIn: 'root' })
export class UtentiApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/utenti`;

  urlElenco(): string {
    return this.base;
  }

  /** L'invito: l'utente nasce `invitato` e diventa attivo al primo accesso. */
  invita(nuovo: NuovoUtente): Observable<Utente> {
    return this.http.post<Utente>(this.base, nuovo);
  }

  cambiaRuolo(id: Id, ruolo: Ruolo): Observable<Utente> {
    return this.http.patch<Utente>(`${this.base}/${id}`, { ruolo });
  }

  /** Sospensione e riattivazione. Su sé stessi il server risponde 409. */
  impostaStato(id: Id, stato: 'attivo' | 'sospeso'): Observable<Utente> {
    return this.http.patch<Utente>(`${this.base}/${id}`, { stato });
  }
}
