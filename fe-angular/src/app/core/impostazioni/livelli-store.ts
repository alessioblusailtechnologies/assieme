import { Injectable, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { Id, ModelloAI } from '@core/models';
import { ImpostazioniApi } from '@core/api/impostazioni-api';
import { SessioneStore } from '@core/auth/sessione-store';
import { TokenStore } from '@core/auth/token-store';

/**
 * I livelli AI e quello scelto dall'agenzia (RF-D-02), in un posto solo.
 *
 * Vive in `core` perché ha due lettori: la pagina Modello AI delle
 * Impostazioni, che lo cambia, e la chat, che lo mostra nel composer e lo
 * segue finché nella conversazione non se ne sceglie un altro. Prima
 * ciascuno se lo leggeva per conto suo, e lo store della chat (fornito
 * sulla rotta, quindi vivo per tutta la sessione) restava col livello
 * della prima visita: si sceglieva Boost nelle Impostazioni e la chat
 * continuava a dire Medio.
 *
 * Le richieste portano l'id del tenant: cambiando account si rileggono,
 * invece di mostrare i livelli di chi c'era prima. L'ospite di una chat
 * cliente non ne ha bisogno, e non le fa.
 */
@Injectable({ providedIn: 'root' })
export class LivelliStore {
  private readonly api = inject(ImpostazioniApi);
  private readonly sessione = inject(SessioneStore);
  private readonly token = inject(TokenStore);

  private readonly tenantId = computed(() =>
    this.token.tokenOspite() ? undefined : this.sessione.tenant()?.id,
  );

  private readonly risorsaLivelli = httpResource<ModelloAI[]>(() =>
    this.tenantId() ? { url: this.api.urlModelli() } : undefined,
  );
  private readonly risorsaAgenzia = httpResource<ModelloAI>(() =>
    this.tenantId() ? { url: this.api.urlModelloAttivo() } : undefined,
  );

  /** I livelli che si possono scegliere, nell'ordine del server. */
  readonly livelli = computed(() =>
    this.risorsaLivelli.hasValue() ? (this.risorsaLivelli.value() ?? []).filter((l) => l.disponibile) : [],
  );

  /** Il livello dell'agenzia: quello con cui lavora chi non ne sceglie un altro in chat. */
  readonly agenzia = computed(() => (this.risorsaAgenzia.hasValue() ? this.risorsaAgenzia.value() : undefined));

  readonly inCaricamento = this.risorsaLivelli.isLoading;
  readonly errore = this.risorsaLivelli.error;

  /** Si rilegge entrando in una schermata che li mostra: un altro amministratore può averlo cambiato. */
  ricarica(): void {
    this.risorsaLivelli.reload();
    this.risorsaAgenzia.reload();
  }

  /** La scelta dell'agenzia: appena il server la conferma, la vede anche la chat. */
  scegli(id: Id): Observable<ModelloAI> {
    return this.api.scegliModello(id).pipe(tap((attivo) => this.risorsaAgenzia.set(attivo)));
  }
}
