import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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

  elenco(): Promise<ChatCliente[]> {
    return firstValueFrom(this.http.get<ChatCliente[]>('/api/chat-clienti'));
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
    return firstValueFrom(this.http.post<LinkChatCliente>('/api/chat-clienti', dati));
  }

  modifica(id: string, modifiche: Partial<Record<string, unknown>>): Promise<ChatCliente> {
    return firstValueFrom(this.http.patch<ChatCliente>(`/api/chat-clienti/${id}`, modifiche));
  }

  /** Rigenera il link: il precedente muore all'istante. */
  rigeneraLink(id: string): Promise<LinkChatCliente> {
    return firstValueFrom(this.http.post<LinkChatCliente>(`/api/chat-clienti/${id}/link`, {}));
  }

  elimina(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/chat-clienti/${id}`));
  }

  /** La porta del cliente: dal token del link a chi è l'agenzia. */
  apri(token: string): Promise<SessioneOspite> {
    return firstValueFrom(
      this.http.post<SessioneOspite>(
        '/api/sessione/ospite',
        { token },
        { context: new HttpContext().set(RICHIESTA_DI_ACCESSO, true) },
      ),
    );
  }
}
