import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

import { environment } from '@env';
import { TokenStore } from '@core/auth/token-store';

/**
 * Precarica le sezioni quando il browser non ha altro da fare.
 *
 * Ogni sezione dell'app è in lazy loading: il suo codice arriva al primo
 * clic sulla voce di menu. Senza precaricamento quel clic paga il download
 * (sei o sette file per sezione, per via dei pezzi condivisi del design
 * system) e la navigazione parte solo dopo: da locale sono un centinaio di
 * millisecondi, su una connessione lenta è l'attesa che si nota - si clicca,
 * non succede niente, poi la pagina appare.
 *
 * La strategia di Angular (`PreloadAllModules`) scarica tutto subito dopo la
 * prima navigazione, e va a contendere la rete alle chiamate della pagina
 * appena aperta, che sono ciò che l'utente sta guardando. Questa aspetta che
 * il browser sia a riposo e poi scarica: quando il clic arriva, il codice è
 * già lì e la navigazione è immediata.
 *
 * Due riguardi: se il browser dichiara «risparmio dati» o una rete lenta non
 * si precarica niente (il traffico lo paga l'utente), e un precaricamento
 * fallito non è un errore per nessuno - la navigazione vera riproverà, e
 * semmai sarà lei a dirlo.
 */

/** `requestIdleCallback` non c'è su Safari vecchi: lì si aspetta un attimo. */
function aRiposo(azione: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => azione(), { timeout: 4000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(azione, 1500);
  return () => clearTimeout(id);
}

interface ConnessioneRete {
  saveData?: boolean;
  effectiveType?: string;
}

function reteDaRisparmiare(): boolean {
  const connessione = (navigator as Navigator & { connection?: ConnessioneRete }).connection;
  if (!connessione) return false;
  return Boolean(connessione.saveData) || /2g/.test(connessione.effectiveType ?? '');
}

@Injectable({ providedIn: 'root' })
export class PrecaricaARiposo implements PreloadingStrategy {
  private readonly token = inject(TokenStore);

  preload(_rotta: Route, carica: () => Observable<unknown>): Observable<unknown> {
    if (reteDaRisparmiare()) return of(null);
    /* Sulla pagina di accesso non si scarica l'applicazione intera: chi non
       è entrato potrebbe non entrare mai. Il preloader di Angular ripassa a
       ogni navigazione conclusa, quindi appena la sessione c'è riparte. */
    if (environment.accessoObbligatorio && !this.token.tokenAccesso()) return of(null);

    return new Observable((osservatore) => {
      let annullato = false;
      const parti = (): void => {
        if (annullato) return;
        carica().subscribe({
          next: (valore) => osservatore.next(valore),
          error: () => osservatore.complete(),
          complete: () => osservatore.complete(),
        });
      };

      const annulla = aRiposo(parti);
      return () => {
        annullato = true;
        annulla();
      };
    });
  }
}
