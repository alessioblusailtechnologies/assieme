import { Injectable, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { Conversazione, Id, Paginato } from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';

/**
 * Lo storico delle conversazioni (RF-C-01), la più recente in cima.
 *
 * Vive in `core` e non nella funzionalità chat perché ha due lettori con
 * cicli di vita diversi: la **barra laterale**, che lo mostra sotto la voce
 * Chat ed esiste per tutta la sessione, e lo store della chat, che vive
 * quanto la permanenza nella sezione. Se stesse nella funzionalità, il
 * layout dovrebbe importare da `features/` — ed è esattamente la dipendenza
 * che la struttura del progetto vieta di creare.
 */
@Injectable({ providedIn: 'root' })
export class StoricoConversazioni {
  private readonly api = inject(ConversazioniApi);

  private readonly risorsa = httpResource<Paginato<Conversazione>>(() => this.api.urlElenco());

  readonly conversazioni = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().elementi : [],
  );
  readonly inCaricamento = this.risorsa.isLoading;
  readonly errore = this.risorsa.error;

  /* --- Chi sta rispondendo (01/09/2026) ---------------------------------
     Le risposte sono lavori del server: sopravvivono a un refresh, a un
     cambio di pagina, a un'altra finestra. Chi le sta producendo si sa da
     due parti, e servono entrambe: il server lo dice sull'elenco — è l'unico
     a sapere dei lavori partiti prima — e questa sessione lo sa di ciò che
     ha appena avviato, senza aspettare il prossimo ricaricamento. */

  private readonly qui = signal<ReadonlySet<Id>>(new Set());

  /** Gli id delle conversazioni con una risposta in volo. */
  readonly inRisposta = computed<ReadonlySet<Id>>(() => {
    const ids = new Set(this.qui());
    for (const c of this.conversazioni()) if (c.rispostaInCorso) ids.add(c.id);
    return ids;
  });

  /** Lo store della chat annuncia qui ciò che avvia e ciò che conclude. */
  segnalaRisposta(id: Id, inCorso: boolean): void {
    this.qui.update((precedenti) => {
      if (precedenti.has(id) === inCorso) return precedenti;
      const aggiornati = new Set(precedenti);
      if (inCorso) aggiornati.add(id);
      else aggiornati.delete(id);
      return aggiornati;
    });
  }

  ricarica(): void {
    this.risorsa.reload();
  }

  /* Rinomina ed eliminazione vivono qui con l'elenco (RF-C-01): chi le
     invoca — la barra laterale — si iscrive e decide il dopo (es. navigare
     via dalla conversazione eliminata); l'elenco si ricarica da solo. */

  rinomina(id: Id, titolo: string): Observable<Conversazione> {
    return this.api.rinomina(id, titolo.trim()).pipe(tap(() => this.ricarica()));
  }

  elimina(id: Id): Observable<void> {
    return this.api.elimina(id).pipe(tap(() => this.ricarica()));
  }
}
