import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import {
  Compagnia,
  Documento,
  DocumentoPubblico,
  Edizione,
  FiltriDocumenti,
  FiltriSet,
  Id,
  Ramo,
} from '@core/models';

/**
 * Un'edizione dello stesso prodotto, con il documento che la rappresenta.
 *
 * RF-A-04: a parità di prodotto coesistono più edizioni. Dalla scheda si
 * deve poter passare all'edizione precedente senza tornare all'elenco —
 * capita in continuazione, perché un contratto in essere è quasi sempre su
 * un'edizione che non è più quella corrente.
 */
export interface EdizioneDiProdotto extends Edizione {
  documentoId: Id;
}

/** Il documento come lo restituisce il dettaglio: con le altre edizioni. */
export interface DettaglioDocumento extends DocumentoPubblico {
  edizioni: EdizioneDiProdotto[];
}

/**
 * Accesso ai documenti.
 *
 * Questo file **è il contratto** verso il backend per il dominio
 * documentale: percorsi, parametri e forme di risposta. La sua controparte
 * eseguibile è in `mocks/` — se i due divergono il front-end si rompe subito,
 * ed è l'unica garanzia che restino allineati.
 *
 * Le letture espongono URL invece di eseguire la chiamata: chi le usa le
 * avvolge in `httpResource`, ottenendo caricamento, errore e ricarica
 * automatica al cambio dei filtri senza gestire stato a mano. I comandi
 * restano metodi normali, perché un'azione la si esegue una volta e si
 * aspetta l'esito.
 */
@Injectable({ providedIn: 'root' })
export class DocumentiApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/documenti`;

  /**
   * I parametri vuoti vengono omessi invece che inviati vuoti: l'URL resta
   * leggibile nel pannello di rete del browser, e il backend non deve
   * distinguere fra «assente» e «stringa vuota» — distinzione che nessuno
   * ricorda mai di gestire allo stesso modo su tutti gli endpoint.
   */
  private query(filtri: FiltriDocumenti | FiltriSet): string {
    let params = new HttpParams();
    for (const [chiave, valore] of Object.entries(filtri)) {
      if (valore === undefined || valore === null || valore === '' || valore === false) continue;
      params = params.set(chiave, String(valore));
    }
    return params.toString();
  }

  /** Elenco dei singoli documenti: serve alla referenziazione in chat. */
  urlElenco(filtri: FiltriDocumenti): string {
    const query = this.query(filtri);
    return query ? `${this.base}?${query}` : this.base;
  }

  /** L'elenco dell'archivio come lo legge un intermediario: una riga per set. */
  urlSetInformativi(filtri: FiltriSet): string {
    const base = `${environment.apiBase}/set-informativi`;
    const query = this.query(filtri);
    return query ? `${base}?${query}` : base;
  }

  urlDettaglio(id: Id): string {
    return `${this.base}/${id}`;
  }

  /** Il PDF del documento, per il visualizzatore (RF-C-05). */
  urlFile(id: Id): string {
    return `${this.base}/${id}/file`;
  }

  urlCompagnie(): string {
    return `${environment.apiBase}/compagnie`;
  }

  urlRami(): string {
    return `${environment.apiBase}/rami`;
  }

  /** RF-A-09: marcare un documento di uso frequente. */
  impostaPreferito(id: Id, preferito: boolean): Observable<Documento> {
    const url = `${this.base}/${id}/preferito`;
    return preferito ? this.http.put<Documento>(url, {}) : this.http.delete<Documento>(url);
  }
}

/** Tipi delle risposte delle tassonomie, per chi crea le risorse. */
export type ElencoCompagnie = Compagnia[];
export type ElencoRami = Ramo[];
