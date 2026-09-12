import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ClientiApi } from '@core/api/clienti-api';
import type { ChatCliente, Cliente, Paginato } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
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
  imports: [Bottone, Campo, FormsModule, Icona, RouterLink, Scheletro, Select, StatoVuoto],
  templateUrl: './elenco-chat-clienti.html',
  styleUrl: './elenco-chat-clienti.scss',
})
export class ElencoChatClienti {
  protected readonly store = inject(ChatClientiStore);
  private readonly router = inject(Router);
  private readonly clientiApi = inject(ClientiApi);

  protected readonly inCreazione = signal(false);
  protected readonly titolo = signal('');
  protected readonly nome = signal('');
  protected readonly cognome = signal('');
  protected readonly clienteId = signal<string | undefined>(undefined);
  protected readonly salvataggioInCorso = signal(false);
  protected readonly erroreCreazione = signal<string | undefined>(undefined);

  /**
   * L'anagrafica, per scegliere di chi è la chat.
   *
   * Non è un dettaglio del modulo: **è il cono**. Senza cliente la chat non
   * avrebbe niente da leggere, ed è per questo che il pulsante resta spento
   * finché non se ne sceglie uno.
   */
  private readonly risorsaClienti = httpResource<Paginato<Cliente>>(() => this.clientiApi.url());

  protected readonly clienti = computed<Cliente[]>(() =>
    this.risorsaClienti.hasValue() ? this.risorsaClienti.value().elementi : [],
  );

  protected readonly puoCreare = computed(
    () =>
      Boolean(this.titolo().trim() && this.nome().trim() && this.cognome().trim()) &&
      Boolean(this.clienteId()),
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
    this.clienteId.set(undefined);
  }

  /**
   * Scegliendo il cliente si riempiono nome e cognome dell'ospite, se sono
   * ancora vuoti: nove volte su dieci sono gli stessi, e riscriverli è
   * lavoro che il sistema può fare da sé. Se l'agenzia li cambia, restano
   * cambiati.
   */
  protected scegliCliente(id: string | undefined): void {
    this.clienteId.set(id);
    const cliente = this.clienti().find((c) => c.id === id);
    if (!cliente) return;
    if (!this.titolo().trim()) this.titolo.set(cliente.nome);
    if (!this.nome().trim() && !this.cognome().trim()) {
      const parti = cliente.nome.trim().split(/\s+/);
      this.cognome.set(parti.length > 1 ? parti[0]! : cliente.nome);
      this.nome.set(parti.slice(1).join(' ') || cliente.nome);
    }
  }

  /**
   * Si crea con il minimo e si prosegue nella scheda.
   *
   * Il cono non si compone più: è il cliente, e si sceglie qui perché senza
   * di lui la chat non saprebbe rispondere a niente. Nella scheda restano
   * gli scostamenti — un documento in più, uno da non mostrare — e le
   * istruzioni.
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
        clienteId: this.clienteId()!,
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
