import { Injectable, signal } from '@angular/core';

export type GravitaNotifica = 'errore' | 'successo' | 'informazione';

export interface Notifica {
  id: number;
  gravita: GravitaNotifica;
  titolo: string;
  dettaglio?: string;
}

/** Quanto resta a schermo una notifica prima di andarsene da sola. */
const MS_PERMANENZA = 6000;

/**
 * Notifiche dell'applicazione.
 *
 * Un segnale con l'elenco corrente e nient'altro: l'interceptor degli errori
 * le aggiunge, `ui-notifiche` (nella shell) le mostra, il tempo o l'utente
 * le tolgono. Nessun servizio di terze parti in mezzo.
 */
@Injectable({ providedIn: 'root' })
export class NotificheStore {
  private progressivo = 0;

  readonly elenco = signal<Notifica[]>([]);

  aggiungi(notifica: Omit<Notifica, 'id'>): void {
    const id = ++this.progressivo;
    this.elenco.update((e) => [...e, { ...notifica, id }]);
    setTimeout(() => this.rimuovi(id), MS_PERMANENZA);
  }

  rimuovi(id: number): void {
    this.elenco.update((e) => e.filter((n) => n.id !== id));
  }
}
