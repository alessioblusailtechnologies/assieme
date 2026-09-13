import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { ChatClientiApi } from '@core/api/chat-clienti-api';
import type { Cliente, ErroreApi } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';

/**
 * Attivare la chat di un cliente.
 *
 * Si fa dalla scheda del cliente, e solo da lì (13/09/2026): l'elenco
 * d'insieme delle chat non c'è più, e un cliente ha al più una chat. Il
 * cliente quindi si sa sempre, e la tendina per sceglierlo se n'è andata
 * con l'elenco.
 *
 * Il cono non si chiede: è il cliente, e il resto sono scostamenti che si
 * decidono dopo, nella scheda della chat, dove c'è lo spazio per guardarli.
 */
@Component({
  selector: 'app-creazione-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Bottone, Campo, FormsModule],
  templateUrl: './creazione-chat.html',
  styleUrl: './creazione-chat.scss',
})
export class CreazioneChat {
  /* L'API e non lo store: lo store è della scheda della chat, e questo
     modulo vive dentro la scheda del cliente. */
  private readonly api = inject(ChatClientiApi);

  readonly cliente = input.required<Cliente>();

  readonly creata = output<string>();
  readonly annullata = output<void>();

  protected readonly titolo = signal('');
  protected readonly nome = signal('');
  protected readonly cognome = signal('');
  protected readonly inCorso = signal(false);
  protected readonly errore = signal<string | undefined>(undefined);

  constructor() {
    /* I campi partono compilati dal cliente: nove volte su dieci l'ospite è
       lui, e riscriverne il nome è lavoro che il sistema può fare da sé.
       Restano correggibili. */
    effect(() => {
      const c = this.cliente();
      if (!this.titolo().trim()) this.titolo.set(c.nome);
      if (!this.nome().trim() && !this.cognome().trim()) this.dividi(c.nome);
    });
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

  protected readonly puoCreare = computed(() =>
    Boolean(this.titolo().trim() && this.nome().trim() && this.cognome().trim()),
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
        clienteId: this.cliente().id,
      });
      this.creata.emit(link.chatId);
    } catch (err) {
      /* Il motivo del server, quando c'è: «ha già la sua chat» dice che cosa
         fare, «non è stato possibile» no. */
      const api = err instanceof HttpErrorResponse ? (err.error as ErroreApi | null) : null;
      this.errore.set(api?.messaggio ?? 'Non è stato possibile attivare la chat.');
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
