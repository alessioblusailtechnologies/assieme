import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import {
  DocumentoRiferimento,
  Id,
  ModificheRegola,
  ModificheRiferimento,
  NuovaRegola,
  RegolaIstruzione,
} from '@core/models';

/**
 * Istruzioni personalizzate (RF-D-04…D-08, D-14…D-16): le due nature del
 * DNA d'Agenzia — regole scritte e documenti di riferimento.
 *
 * I documenti di riferimento sono un **elenco unico** qualunque sia
 * l'origine: caricati qui o promossi dall'Archivio Privato (RF-B-09). La
 * promozione non sposta il documento, gli aggiunge un ruolo; l'eliminazione
 * da qui glielo toglie e basta — il documento resta nel suo archivio.
 */
@Injectable({ providedIn: 'root' })
export class IstruzioniApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/istruzioni`;

  // --- Regole scritte (RF-D-04/06) ----------------------------------------

  urlRegole(): string {
    return `${this.base}/regole`;
  }

  creaRegola(regola: NuovaRegola): Observable<RegolaIstruzione> {
    return this.http.post<RegolaIstruzione>(this.urlRegole(), regola);
  }

  modificaRegola(id: Id, modifiche: ModificheRegola): Observable<RegolaIstruzione> {
    return this.http.patch<RegolaIstruzione>(`${this.urlRegole()}/${id}`, modifiche);
  }

  eliminaRegola(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.urlRegole()}/${id}`);
  }

  // --- Documenti di riferimento (RF-D-14/15/16) ---------------------------

  urlRiferimenti(): string {
    return `${this.base}/riferimenti`;
  }

  /**
   * Caricamento diretto, con progresso: riusa lo stesso schema multipart
   * dell'Archivio Privato, e la stessa coda in interfaccia.
   */
  caricaRiferimenti(file: File[]): Observable<HttpEvent<{ creati: DocumentoRiferimento[] }>> {
    const corpo = new FormData();
    for (const f of file) corpo.append('file', f, f.name);
    return this.http.post<{ creati: DocumentoRiferimento[] }>(this.urlRiferimenti(), corpo, {
      reportProgress: true,
      observe: 'events',
    });
  }

  /** Ambito e attivazione: il governo ordinario del contesto permanente. */
  modificaRiferimento(id: Id, modifiche: ModificheRiferimento): Observable<DocumentoRiferimento> {
    return this.http.patch<DocumentoRiferimento>(`${this.urlRiferimenti()}/${id}`, modifiche);
  }

  /**
   * Toglie il ruolo di riferimento. Se il documento veniva dall'Archivio
   * Privato resta lì, intatto; se era caricato qui, sparisce con il ruolo.
   */
  eliminaRiferimento(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.urlRiferimenti()}/${id}`);
  }
}
