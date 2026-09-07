import { Injectable, computed, inject, signal } from '@angular/core';

import { ChatClientiApi } from '@core/api/chat-clienti-api';
import type { ChatCliente, Id, LinkChatCliente } from '@core/models';

/**
 * Le chat per i clienti, dal lato dell'agenzia.
 *
 * Un negozio piccolo e senza `httpResource`: l'elenco cambia solo per
 * gesti dell'utente (crea, modifica, sospendi, elimina), non da solo, e
 * dopo ogni gesto si ricarica. Non c'è niente che arrivi dal server senza
 * che qualcuno l'abbia chiesto.
 */
@Injectable()
export class ChatClientiStore {
  private readonly api = inject(ChatClientiApi);

  readonly chat = signal<ChatCliente[]>([]);
  readonly inCaricamento = signal(false);
  readonly errore = signal<string | undefined>(undefined);

  /**
   * Il link appena creato o rigenerato.
   *
   * Vive qui e non nell'elenco perché **si vede una volta sola**: il server
   * ne conserva solo l'impronta, e ricaricando la pagina non c'è più nulla
   * da mostrare. Tenerlo in una schermata che si può ricaricare farebbe
   * credere il contrario.
   */
  readonly linkAppenaCreato = signal<LinkChatCliente | undefined>(undefined);

  readonly conta = computed(() => this.chat().length);

  async ricarica(): Promise<void> {
    this.inCaricamento.set(true);
    this.errore.set(undefined);
    try {
      this.chat.set(await this.api.elenco());
    } catch {
      this.errore.set('Non è stato possibile caricare le chat dei clienti.');
    } finally {
      this.inCaricamento.set(false);
    }
  }

  async crea(dati: Parameters<ChatClientiApi['crea']>[0]): Promise<LinkChatCliente> {
    const link = await this.api.crea(dati);
    this.linkAppenaCreato.set(link);
    await this.ricarica();
    return link;
  }

  async modifica(id: Id, modifiche: Record<string, unknown>): Promise<void> {
    await this.api.modifica(id, modifiche);
    await this.ricarica();
  }

  async rigeneraLink(id: Id): Promise<void> {
    this.linkAppenaCreato.set(await this.api.rigeneraLink(id));
    await this.ricarica();
  }

  async elimina(id: Id): Promise<void> {
    await this.api.elimina(id);
    await this.ricarica();
  }

  perId(id: Id): ChatCliente | undefined {
    return this.chat().find((c) => c.id === id);
  }
}
