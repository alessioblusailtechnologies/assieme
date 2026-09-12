import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import { Cliente, Id, Paginato } from '@core/models';

export interface NuovoCliente {
  nome: string;
  tipo?: 'persona' | 'azienda';
  codiceFiscale?: string | null;
  partitaIva?: string | null;
  alias?: string[];
  email?: string | null;
  telefono?: string | null;
  indirizzo?: string | null;
  natoIl?: string | null;
  note?: string | null;
  etichette?: string[];
  stato?: 'attivo' | 'archiviato';
}

export type ModificheCliente = Partial<NuovoCliente>;

export interface FiltriClienti {
  q?: string;
  etichetta?: string;
  tipo?: 'persona' | 'azienda';
  stato?: 'attivo' | 'archiviato';
}

/**
 * I clienti (`PIANO-CLIENTI.md`, 12/09/2026).
 *
 * Prende il posto di `cartelle-api`: l'albero non c'è più, e il cliente è
 * l'entità attorno a cui gira l'Archivio Privato.
 */
@Injectable({ providedIn: 'root' })
export class ClientiApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/clienti`;

  url(filtri: FiltriClienti = {}): string {
    let parametri = new HttpParams();
    if (filtri.q?.trim()) parametri = parametri.set('q', filtri.q.trim());
    if (filtri.etichetta) parametri = parametri.set('etichetta', filtri.etichetta);
    if (filtri.tipo) parametri = parametri.set('tipo', filtri.tipo);
    if (filtri.stato) parametri = parametri.set('stato', filtri.stato);
    const query = parametri.toString();
    return query ? `${this.base}?${query}` : this.base;
  }

  urlCliente(id: Id): string {
    return `${this.base}/${id}`;
  }

  crea(cliente: NuovoCliente): Observable<Cliente> {
    return this.http.post<Cliente>(this.base, cliente);
  }

  modifica(id: Id, modifiche: ModificheCliente): Observable<Cliente> {
    return this.http.patch<Cliente>(`${this.base}/${id}`, modifiche);
  }

  /** La fusione serve il giorno dopo l'importazione, non un mese dopo. */
  fondi(vincitore: Id, assorbito: Id): Observable<Cliente> {
    return this.http.post<Cliente>(`${this.base}/${vincitore}/fondi`, { assorbito });
  }
}

/** L'elenco clienti arriva paginato come gli altri elenchi. */
export type PaginaClienti = Paginato<Cliente>;
