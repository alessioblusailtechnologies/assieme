import { httpResource } from '@angular/common/http';
import { Injectable, computed } from '@angular/core';

import { environment } from '@env';
import { Permesso, Sessione } from '@core/models';

/**
 * Sessione dell'utente corrente.
 *
 * In questa fase l'autenticazione è finta: il server mock restituisce un
 * utente in base all'header `X-Assieme-Ruolo` che il pannello di sviluppo
 * imposta. Quando arriverà l'autenticazione vera cambierà **solo** cosa
 * risponde `GET /api/sessione` — il resto dell'applicazione interroga già
 * `puo()` e non sa da dove venga la risposta.
 *
 * Usa `httpResource`: caricamento, errore e ricarica sono signal, senza una
 * riga di gestione manuale dello stato.
 */
@Injectable({ providedIn: 'root' })
export class SessioneStore {
  private readonly risorsa = httpResource<Sessione>(() => `${environment.apiBase}/sessione`);

  /**
   * `risorsa.value()` **solleva un'eccezione** quando la risorsa è in stato
   * d'errore. Letto direttamente in un template, il fallimento della
   * chiamata di sessione farebbe saltare la rilevazione delle modifiche e
   * l'utente resterebbe davanti a una pagina bianca — nel momento peggiore,
   * cioè quando qualcosa è già andato storto.
   *
   * `hasValue()` è falso sia in caricamento sia in errore: qui la sessione
   * diventa semplicemente `undefined`, e chi la usa gestisce già quel caso
   * perché è lo stesso del primo caricamento.
   */
  readonly sessione = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : undefined));
  readonly inCaricamento = this.risorsa.isLoading;
  readonly errore = this.risorsa.error;

  readonly utente = computed(() => this.sessione()?.utente);
  readonly tenant = computed(() => this.sessione()?.tenant);
  readonly ruolo = computed(() => this.sessione()?.utente.ruolo);

  /** Iniziali per l'avatar, es. "MR". */
  readonly iniziali = computed(() => {
    const u = this.utente();
    return u ? `${u.nome[0] ?? ''}${u.cognome[0] ?? ''}`.toUpperCase() : '';
  });

  /**
   * L'unico modo ammesso di decidere cosa mostrare.
   *
   * Mai `ruolo() === 'amministratore'` nei template: il modello dei ruoli è
   * ancora aperto nell'analisi dei requisiti, e quando arriverà quello
   * definitivo — con più ruoli o permessi per singola area — deve cambiare
   * questo file e nient'altro.
   */
  puo(permesso: Permesso): boolean {
    return this.sessione()?.permessi.includes(permesso) ?? false;
  }

  /** Il pannello di sviluppo la chiama dopo aver cambiato ruolo simulato. */
  ricarica(): void {
    this.risorsa.reload();
  }
}
