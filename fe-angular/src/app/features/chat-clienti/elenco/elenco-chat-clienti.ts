import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { ChatCliente } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { CreazioneChat } from '../creazione/creazione-chat';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { ChatClientiStore } from '../chat-clienti-store';

/**
 * Le chat per i clienti dell'agenzia: **la vista d'insieme**.
 *
 * L'elenco dice tre cose per riga, e sono le tre che si guardano davvero: di
 * chi è la chat, se il link è ancora aperto, e quanto è costata. Quello che
 * una chat legge non si compone qui — è il suo cliente — e le istruzioni
 * stanno nella scheda, dove c'è lo spazio per pensarci.
 */
@Component({
  selector: 'app-elenco-chat-clienti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Bottone, CreazioneChat, Icona, RouterLink, Scheletro, StatoVuoto],
  templateUrl: './elenco-chat-clienti.html',
  styleUrl: './elenco-chat-clienti.scss',
})
export class ElencoChatClienti {
  protected readonly store = inject(ChatClientiStore);
  private readonly router = inject(Router);

  protected readonly inCreazione = signal(false);

  constructor() {
    void this.store.ricarica();
  }

  protected apriCreazione(): void {
    this.inCreazione.set(true);
  }

  /**
   * Appena creata si entra nella sua scheda: è lì che c'è il link da
   * mandare, e ciò che il cliente vedrà in più o in meno.
   */
  protected async apriChat(id: string): Promise<void> {
    this.inCreazione.set(false);
    await this.store.ricarica();
    await this.router.navigate(['/chat-clienti', id]);
  }

  protected etichettaStato(c: ChatCliente): string {
    if (c.stato === 'sospesa') return 'sospesa';
    if (c.scadeIl && new Date(c.scadeIl) <= new Date()) return 'scaduta';
    if (c.tettoDomande && c.domandeFatte >= c.tettoDomande) return 'domande finite';
    return 'attiva';
  }

  /**
   * Che cosa legge questa chat, in una riga.
   *
   * Il cono è il cliente — i suoi documenti, che il server calcola a ogni
   * domanda — quindi qui si dice il cliente, e accanto solo gli
   * scostamenti: quello che è stato aggiunto e quello che è stato tolto a
   * mano.
   */
  protected coperturaCono(c: ChatCliente): string {
    const parti: string[] = [`i documenti di ${c.clienteNome}`];
    if (c.aggiunti.length) parti.push(`+${c.aggiunti.length}`);
    if (c.esclusi.length) parti.push(`−${c.esclusi.length}`);
    return parti.join(' · ');
  }

  protected readonly copiato = signal<string | undefined>(undefined);

  protected async copia(c: ChatCliente): Promise<void> {
    if (!c.url) return;
    try {
      await navigator.clipboard.writeText(c.url);
      this.copiato.set(c.id);
      setTimeout(() => this.copiato.set(undefined), 2000);
    } catch {
      /* Appunti negati: il link resta nella scheda, si copia a mano. */
    }
  }
}
