import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { ChatClientiApi } from '@core/api/chat-clienti-api';
import { ClientiApi } from '@core/api/clienti-api';
import type { Cliente, Paginato } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Select } from '@shared/ui/select/select';

/**
 * Aprire una chat per un cliente.
 *
 * Sta in un componente suo perché si fa da due posti — dalla scheda del
 * cliente (dove il cliente si sa già) e dall'elenco delle chat (dove va
 * scelto) — e due moduli gemelli avrebbero cominciato a divergere al primo
 * campo aggiunto.
 *
 * Il cono non si chiede: è il cliente, e il resto sono scostamenti che si
 * decidono dopo, nella scheda della chat, dove c'è lo spazio per guardarli.
 */
@Component({
  selector: 'app-creazione-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Bottone, Campo, FormsModule, Select],
  templateUrl: './creazione-chat.html',
  styleUrl: './creazione-chat.scss',
})
export class CreazioneChat {
  /* L'API e non lo store: lo store è della sezione delle chat, e questo
     modulo vive anche dentro la scheda di un cliente. */
  private readonly api = inject(ChatClientiApi);
  private readonly clientiApi = inject(ClientiApi);

  /** Quando è già noto (scheda del cliente), la tendina non compare nemmeno. */
  readonly cliente = input<Cliente | undefined>(undefined);

  readonly creata = output<string>();
  readonly annullata = output<void>();

  protected readonly titolo = signal('');
  protected readonly nome = signal('');
  protected readonly cognome = signal('');
  protected readonly clienteId = signal<string | undefined>(undefined);
  protected readonly inCorso = signal(false);
  protected readonly errore = signal<string | undefined>(undefined);

  private readonly risorsaClienti = httpResource<Paginato<Cliente>>(() =>
    this.cliente() ? undefined : this.clientiApi.url(),
  );

  protected readonly clienti = computed<Cliente[]>(() =>
    this.risorsaClienti.hasValue() ? this.risorsaClienti.value().elementi : [],
  );

  constructor() {
    /* Col cliente già noto i campi partono compilati: nove volte su dieci
       l'ospite è lui, e riscriverne il nome è lavoro che il sistema può
       fare da sé. Restano correggibili. */
    effect(() => {
      const c = this.cliente();
      if (!c) return;
      this.clienteId.set(c.id);
      if (!this.titolo().trim()) this.titolo.set(c.nome);
      if (!this.nome().trim() && !this.cognome().trim()) this.dividi(c.nome);
    });
  }

  protected scegliCliente(id: string | undefined): void {
    this.clienteId.set(id);
    const scelto = this.clienti().find((c) => c.id === id);
    if (!scelto) return;
    if (!this.titolo().trim()) this.titolo.set(scelto.nome);
    if (!this.nome().trim() && !this.cognome().trim()) this.dividi(scelto.nome);
  }

  /**
   * «Rossi Mario» → cognome «Rossi», nome «Mario»: in anagrafica si scrive
   * così, e con due parole non c'è ambiguità.
   *
   * Con tre o più **non si indovina**: «De Vincentis Alessio» diventerebbe
   * cognome «De», e il cliente si vedrebbe chiamare per nome sbagliato dal
   * primo messaggio. Meglio due campi vuoti da riempire che due campi pieni
   * da correggere, perché i secondi non li rilegge nessuno.
   */
  private dividi(nomeCompleto: string): void {
    const parti = nomeCompleto.trim().split(/\s+/);
    if (parti.length !== 2) return;
    this.cognome.set(parti[0]!);
    this.nome.set(parti[1]!);
  }

  protected readonly puoCreare = computed(
    () =>
      Boolean(this.titolo().trim() && this.nome().trim() && this.cognome().trim()) &&
      Boolean(this.clienteId()),
  );

  protected async crea(): Promise<void> {
    if (!this.puoCreare() || this.inCorso()) return;
    this.inCorso.set(true);
    this.errore.set(undefined);
    try {
      const link = await this.api.crea({
        titolo: this.titolo().trim(),
        nome: this.nome().trim(),
        cognome: this.cognome().trim(),
        clienteId: this.clienteId()!,
      });
      this.creata.emit(link.chatId);
    } catch {
      this.errore.set('Non è stato possibile creare la chat.');
    } finally {
      this.inCorso.set(false);
    }
  }

  protected annulla(): void {
    this.titolo.set('');
    this.nome.set('');
    this.cognome.set('');
    this.errore.set(undefined);
    this.annullata.emit();
  }
}
