import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { ChatClientiApi } from '@core/api/chat-clienti-api';
import { TokenStore } from '@core/auth/token-store';
import type { SessioneOspite } from '@core/models';
import { ChatStore } from '@features/chat/chat-store';
import { Conversazione } from '@features/chat/conversazione/conversazione';

/**
 * La chat che il cliente dell'agenzia apre dal link.
 *
 * **È la chat di sempre.** Stesso `ChatStore`, stessa `Conversazione`,
 * stesso flusso SSE, stesso pannello del ragionamento: cambia chi entra e
 * che cosa il motore può leggere, e quelle due cose le decide il server. Qui
 * cambia solo la cornice — niente barra laterale, niente archivi, niente
 * impostazioni: è una porta, non una stanza.
 *
 * Lo store è fornito qui e non su una rotta padre perché questa pagina è
 * sola: non si passa da una conversazione all'altra, ce n'è una.
 */
@Component({
  selector: 'app-chat-cliente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Conversazione],
  providers: [ChatStore],
  templateUrl: './chat-cliente.html',
  styleUrl: './chat-cliente.scss',
})
export class ChatCliente {
  private readonly api = inject(ChatClientiApi);
  private readonly token = inject(TokenStore);
  private readonly rotta = inject(ActivatedRoute);

  protected readonly sessione = signal<SessioneOspite | undefined>(undefined);
  protected readonly errore = signal<string | undefined>(undefined);
  protected readonly inCorso = signal(true);

  constructor() {
    const token = this.rotta.snapshot.paramMap.get('token') ?? '';
    void this.apri(token);
  }

  private async apri(token: string): Promise<void> {
    try {
      /* Il token si mette in archivio **prima** di chiedere: da qui in poi
         ogni chiamata parte con lo schema `Ospite`, compresa quella dello
         stream, che passa dallo stesso interceptor. */
      this.token.impostaOspite(token);
      this.sessione.set(await this.api.apri(token));
    } catch {
      this.token.pulisciOspite();
      /*
       * Un solo messaggio per tutte le ragioni — sospeso, scaduto, domande
       * finite, mai esistito — perché è quello che risponde anche il
       * server: chi ha in mano un link revocato non deve poter distinguere
       * «non è mai esistito» da «è scaduto ieri».
       */
      this.errore.set('Questo collegamento non è più valido.');
    } finally {
      this.inCorso.set(false);
    }
  }
}
