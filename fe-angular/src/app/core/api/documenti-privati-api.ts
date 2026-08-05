import { HttpClient, HttpEvent, HttpParams, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { DocumentoPrivato, FiltriDocumentiPrivati, Id, TipologiaDocumento } from '@core/models';

/** Campi che la scheda documento può modificare (RF-B-03, RF-B-04). */
export interface ModificheDocumento {
  titolo?: string;
  tipologia?: TipologiaDocumento;
  compagniaId?: Id;
  ramoId?: Id;
  riferimentoCliente?: string;
  etichette?: string[];
}

/** Esito del caricamento: i documenti creati, già in coda di elaborazione. */
export interface EsitoCaricamento {
  creati: DocumentoPrivato[];
}

/**
 * Accesso all'Archivio Privato.
 *
 * A differenza di quello pubblico qui si scrive, e il contratto lo riflette:
 * accanto alle letture ci sono comandi che possono fallire a metà — un
 * caricamento interrotto, un documento che l'elaborazione rifiuta, una quota
 * esaurita. Ogni errore ha un codice, perché l'interfaccia deve poter dire
 * *cosa* è andato storto e non solo *che* è andato storto.
 */
@Injectable({ providedIn: 'root' })
export class DocumentiPrivatiApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/documenti-privati`;

  urlElenco(filtri: FiltriDocumentiPrivati): string {
    let params = new HttpParams();
    for (const [chiave, valore] of Object.entries(filtri)) {
      if (valore === undefined || valore === null || valore === '' || valore === false) continue;
      params = params.set(chiave, String(valore));
    }
    const query = params.toString();
    return query ? `${this.base}?${query}` : this.base;
  }

  urlDettaglio(id: Id): string {
    return `${this.base}/${id}`;
  }

  urlEtichette(): string {
    return `${environment.apiBase}/etichette`;
  }

  urlSpazio(): string {
    return `${environment.apiBase}/spazio`;
  }

  /**
   * RF-B-02: caricamento singolo e multiplo.
   *
   * Restituisce gli eventi di avanzamento, non solo la risposta finale:
   * `reportProgress` è ciò che permette alla coda di mostrare quanto manca.
   * Su un preventivo da 300 KB non serve, su una scansione da 15 MB su
   * connessione d'agenzia sì — ed è il secondo caso a definire l'esperienza.
   */
  carica(file: File[]): Observable<HttpEvent<EsitoCaricamento>> {
    const corpo = new FormData();
    for (const f of file) corpo.append('file', f, f.name);

    return this.http.request(
      new HttpRequest('POST', this.base, corpo, { reportProgress: true }),
    ) as Observable<HttpEvent<EsitoCaricamento>>;
  }

  modifica(id: Id, modifiche: ModificheDocumento): Observable<DocumentoPrivato> {
    return this.http.patch<DocumentoPrivato>(`${this.base}/${id}`, modifiche);
  }

  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * RF-B-09: promozione a documento di riferimento.
   *
   * Il server rifiuta con 409 se il documento non è ancora elaborato: non può
   * diventare contesto permanente finché l'AI non riesce a leggerlo.
   */
  impostaRiferimento(id: Id, riferimento: boolean): Observable<DocumentoPrivato> {
    const url = `${this.base}/${id}/riferimento`;
    return riferimento
      ? this.http.put<DocumentoPrivato>(url, {})
      : this.http.delete<DocumentoPrivato>(url);
  }
}
