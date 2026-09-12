import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import type { ChatCliente } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { ChatClientiStore } from '../chat-clienti-store';

/**
 * Le chat per i clienti dell'agenzia.
 *
 * L'elenco dice tre cose per riga, e sono le tre che si guardano davvero:
 * di chi è la chat, se il link è ancora aperto, e quanto è costata. Il cono
 * di lettura si compone nella scheda, dove c'è lo spazio per sbagliare meno.
 */
@Component({
  selector: 'app-elenco-chat-clienti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Bottone, Campo, FormsModule, Icona, RouterLink, Scheletro, StatoVuoto],
  templateUrl: './elenco-chat-clienti.html',
  styleUrl: './elenco-chat-clienti.scss',
})
export class ElencoChatClienti {
  protected readonly store = inject(ChatClientiStore);
  private readonly router = inject(Router);

  protected readonly inCreazione = signal(false);
  protected readonly titolo = signal('');
  protected readonly nome = signal('');
  protected readonly cognome = signal('');
  protected readonly salvataggioInCorso = signal(false);
  protected readonly erroreCreazione = signal<string | undefined>(undefined);

  protected readonly puoCreare = computed(
    () => Boolean(this.titolo().trim() && this.nome().trim() && this.cognome().trim()),
  );

  constructor() {
    void this.store.ricarica();
  }

  protected apriCreazione(): void {
    this.inCreazione.set(true);
    this.erroreCreazione.set(undefined);
  }

  protected annulla(): void {
    this.inCreazione.set(false);
    this.titolo.set('');
    this.nome.set('');
    this.cognome.set('');
  }

  /**
   * Si crea con il minimo e si prosegue nella scheda.
   *
   * Il cono non si chiede qui: comporlo è il gesto che conta, e chiederlo
   * in una finestrella insieme al nome porterebbe a spedirlo com'è. Appena
   * creata, la chat **non ha ancora nulla nel cono** — il cliente non
   * vedrebbe niente — e la scheda si apre proprio lì.
   */
  protected async crea(): Promise<void> {
    if (!this.puoCreare() || this.salvataggioInCorso()) return;
    this.salvataggioInCorso.set(true);
    this.erroreCreazione.set(undefined);
    try {
      const link = await this.store.crea({
        titolo: this.titolo().trim(),
        nome: this.nome().trim(),
        cognome: this.cognome().trim(),
        cartelle: [],
        documenti: [],
      });
      this.annulla();
      await this.router.navigate(['/chat-clienti', link.chatId]);
    } catch {
      this.erroreCreazione.set('Non è stato possibile creare la chat.');
    } finally {
      this.salvataggioInCorso.set(false);
    }
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

  /**
   * Copia il link negli appunti.
   *
   * Il riscontro dura due secondi e sta sulla riga: chi copia un link deve
   * sapere che è successo prima di incollarlo altrove, o lo copia due volte.
   */
  protected readonly copiato = signal<string | undefined>(undefined);

  protected async copia(c: ChatCliente): Promise<void> {
    if (!c.url) return;
    try {
      await navigator.clipboard.writeText(c.url);
      this.copiato.set(c.id);
      setTimeout(() => {
        if (this.copiato() === c.id) this.copiato.set(undefined);
      }, 2000);
    } catch {
      /* Appunti negati (contesto non sicuro, permesso rifiutato): il link
         resta visibile nella scheda, da selezionare a mano. */
    }
  }
}
