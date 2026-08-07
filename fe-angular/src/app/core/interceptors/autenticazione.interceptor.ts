import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import { AccessoApi, RICHIESTA_DI_ACCESSO } from '@core/auth/accesso-api';
import { TokenStore } from '@core/auth/token-store';

/**
 * L'interceptor di sessione — il punto previsto fin dalla Fase 0 del FE
 * («quando arriverà l'autenticazione vera si aggiungerà qui il suo»).
 *
 * Tre responsabilità, tutte qui:
 *
 * 1. **Allega il Bearer** a ogni richiesta, streaming della chat compreso
 *    (passa da `HttpClient`, quindi passa da qui).
 * 2. **Sul 401 rinnova e riprova una volta.** Il rinnovo è condiviso: dieci
 *    richieste che scadono insieme producono un solo giro di refresh.
 * 3. **Se il rinnovo fallisce, si esce**: token puliti e rotta `/accesso`.
 *
 * Senza token in archivio non fa nulla: contro il mock e nella demo
 * self-contained — dove l'autenticazione non esiste — la catena resta
 * trasparente e l'applicazione funziona come sempre.
 */
export const autenticazioneInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenStore);
  const accesso = inject(AccessoApi);
  const router = inject(Router);

  if (req.context.get(RICHIESTA_DI_ACCESSO)) return next(req);

  const conBearer = (r: HttpRequest<unknown>): HttpRequest<unknown> => {
    const t = token.tokenAccesso();
    return t ? r.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : r;
  };

  return next(conBearer(req)).pipe(
    catchError((errore: HttpErrorResponse) => {
      if (errore.status !== 401) {
        return throwError(() => errore);
      }
      // 401 senza nemmeno un token da rinnovare: si va alla porta. Contro il
      // mock e nella demo non succede mai — lì i 401 non esistono.
      if (!token.tokenAggiornamento()) {
        token.pulisci();
        void router.navigate(['/accesso']);
        return throwError(() => errore);
      }
      return from(rinnovaCondiviso(token, accesso)).pipe(
        switchMap((riuscito): Observable<never> | ReturnType<typeof next> => {
          if (riuscito) return next(conBearer(req));
          token.pulisci();
          void router.navigate(['/accesso']);
          return throwError(() => errore);
        }),
      );
    }),
  );
};

/** Il rinnovo in corso, condiviso fra tutte le richieste che incrociano il 401. */
let rinnovoInCorso: Promise<boolean> | undefined;

function rinnovaCondiviso(token: TokenStore, accesso: AccessoApi): Promise<boolean> {
  rinnovoInCorso ??= (async () => {
    try {
      const aggiornamento = token.tokenAggiornamento();
      if (!aggiornamento) return false;
      const nuovi = await firstValueFrom(accesso.aggiorna(aggiornamento));
      token.imposta(nuovi.tokenAccesso, nuovi.tokenAggiornamento);
      return true;
    } catch {
      return false;
    } finally {
      rinnovoInCorso = undefined;
    }
  })();
  return rinnovoInCorso;
}
