import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '@env';
import { RICHIESTA_DI_ACCESSO } from '@core/auth/accesso-api';
import type { ChatCliente, LinkChatCliente, SessioneOspite } from '@core/models';

/**
 * Le chat per i clienti: il lato dell'agenzia, e la porta del cliente.
 *
 * `apri` è l'unica rotta che viaggia **senza credenziale** — il token del
 * link sta nel corpo, non nell'intestazione, perché in quel momento la
 * scheda non ha ancora niente da presentare. Da lì in poi il token torna
 * nell'header con lo schema `Ospite`, che ci mette l'interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ChatClientiApi {
  private readonly http = inject(HttpClient);
  /* Mai un URL scritto a mano: in produzione app e API stanno su host
     diversi, e `/api/...` finirebbe sul sito statico invece che sul
     backend. La base la decide `config.js`, senza ricompilare. */
  private readonly base = `${environment.apiBase}/chat-clienti`;

  elenco(): Promise<ChatCliente[]> {
    return firstValueFrom(this.http.get<ChatCliente[]>(this.base));
  }

  crea(dati: {
    titolo: string;
    nome: string;
    cognome: string;
    clienteId?: string;
    istruzioni?: string;
    scadeIl?: string;
    tettoDomande?: number;
    cartelle: string[];
    documenti: string[];
  }): Promise<LinkChatCliente> {
    return firstValueFrom(this.http.post<LinkChatCliente>(this.base, dati));
  }

  modifica(id: string, modifiche: Partial<Record<string, unknown>>): Promise<ChatCliente> {
    return firstValueFrom(this.http.patch<ChatCliente>(`${this.base}/${id}`, modifiche));
  }

  /** Rigenera il link: il precedente muore all'istante. */
  rigeneraLink(id: string): Promise<LinkChatCliente> {
    return firstValueFrom(this.http.post<LinkChatCliente>(`${this.base}/${id}/link`, {}));
  }

  elimina(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/${id}`));
  }

  /** La porta del cliente: dal token del link a chi è l'agenzia. */
  apri(token: string): Promise<SessioneOspite> {
    return firstValueFrom(
      this.http.post<SessioneOspite>(
        `${environment.apiBase}/sessione/ospite`,
        { token },
        { context: new HttpContext().set(RICHIESTA_DI_ACCESSO, true) },
      ),
    );
  }
}
