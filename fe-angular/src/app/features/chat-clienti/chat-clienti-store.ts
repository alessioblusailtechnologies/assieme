import { Injectable, computed, inject, signal } from '@angular/core';

import { ChatClientiApi } from '@core/api/chat-clienti-api';
import type { ChatCliente, Id } from '@core/models';

/**
 * Le chat per i clienti, dal lato dell'agenzia: quello che serve alla scheda
 * di una chat per leggerla, modificarla, sospenderla e rigenerarne il link.
 *
 * Un negozio piccolo e senza `httpResource`: l'elenco cambia solo per
 * gesti dell'utente, e dopo ogni gesto si ricarica. Attivarne una non passa
 * più di qui (13/09/2026): si fa dalla scheda del cliente, che parla con
 * l'API direttamente, e il link si rilegge dalla chat stessa.
 */
@Injectable()
export class ChatClientiStore {
  private readonly api = inject(ChatClientiApi);

  readonly chat = signal<ChatCliente[]>([]);
  readonly inCaricamento = signal(false);
  readonly errore = signal<string | undefined>(undefined);

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

  async modifica(id: Id, modifiche: Record<string, unknown>): Promise<void> {
    await this.api.modifica(id, modifiche);
    await this.ricarica();
  }

  /** Il link precedente muore all'istante; quello nuovo si rilegge dalla chat. */
  async rigeneraLink(id: Id): Promise<void> {
    await this.api.rigeneraLink(id);
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
