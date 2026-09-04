import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Cartella, Cliente, Convenzione, Id, Paginato } from '@core/models';

/** Che fine fanno i documenti quando la cartella sparisce. */
export type DestinazioneDocumenti = 'da-sistemare' | 'al-padre';

export interface NuovaCartella {
  nome: string;
  parentId?: Id | null;
  descrizione?: string | null;
  /**
   * L'utente ha visto l'avviso sul quasi-doppione e va avanti lo stesso.
   * L'avviso è un avviso, non un divieto: «Preventivi» e «Preventivi 2026»
   * si somigliano parecchio e sono due cartelle legittime.
   */
  consentiSimile?: boolean;
}

export interface ModificheCartella {
  nome?: string;
  parentId?: Id | null;
  descrizione?: string | null;
}

export interface NuovoCliente {
  nome: string;
  tipo?: 'persona' | 'azienda';
  codiceFiscale?: string | null;
  partitaIva?: string | null;
  alias?: string[];
}

/**
 * Le cartelle, i clienti e la convenzione osservata (Fase 10).
 *
 * L'albero si chiede intero: sono cartelle, non documenti, e anche un
 * archivio grosso ne ha poche migliaia. È l'elenco dei documenti a essere
 * paginato, non la mappa per navigarli.
 */
@Injectable({ providedIn: 'root' })
export class CartelleApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/cartelle`;
  private readonly baseClienti = `${environment.apiBase}/clienti`;
  private readonly baseConvenzione = `${environment.apiBase}/convenzione`;

  urlAlbero(): string {
    return this.base;
  }

  urlClienti(q?: string): string {
    if (!q?.trim()) return this.baseClienti;
    return `${this.baseClienti}?${new HttpParams().set('q', q.trim()).toString()}`;
  }

  urlConvenzione(): string {
    return this.baseConvenzione;
  }

  crea(cartella: NuovaCartella): Observable<Cartella> {
    return this.http.post<Cartella>(this.base, cartella);
  }

  modifica(id: Id, modifiche: ModificheCartella): Observable<Cartella> {
    return this.http.patch<Cartella>(`${this.base}/${id}`, modifiche);
  }

  /**
   * L'eliminazione dice sempre che fine fanno i documenti dentro: una
   * cartella che sparisce portandosi via quello che aveva è il modo in cui
   * si perde roba senza accorgersene.
   */
  elimina(id: Id, documenti: DestinazioneDocumenti = 'da-sistemare'): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}?documenti=${documenti}`);
  }

  creaCliente(cliente: NuovoCliente): Observable<Cliente> {
    return this.http.post<Cliente>(this.baseClienti, cliente);
  }

  /** La fusione serve il giorno dopo l'importazione, non un mese dopo. */
  fondiClienti(vincitore: Id, assorbito: Id): Observable<Cliente> {
    return this.http.post<Cliente>(`${this.baseClienti}/${vincitore}/fondi`, { assorbito });
  }

  correggiConvenzione(testoUtente: string | null): Observable<Convenzione> {
    return this.http.patch<Convenzione>(this.baseConvenzione, { testoUtente });
  }
}

/** L'elenco clienti arriva paginato come gli altri elenchi. */
export type PaginaClienti = Paginato<Cliente>;
