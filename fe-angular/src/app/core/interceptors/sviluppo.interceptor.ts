import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { SviluppoStore } from '@core/sviluppo/sviluppo-store';

/**
 * Traduce le impostazioni del pannello di sviluppo in header HTTP.
 *
 * Registrato **solo** quando `environment.devTools` è vero: in produzione
 * questo interceptor non entra nella catena.
 *
 * Gli header non li legge il front-end: li legge Mockoon, che ha regole di
 * risposta corrispondenti (`mocks/assieme.json`). Il codice applicativo
 * riceve un 500 vero, con un `HttpErrorResponse` vero, e lo gestisce come
 * gestirebbe un 500 di produzione. È l'unico modo per sapere davvero se lo
 * gestisce.
 */
export const sviluppoInterceptor: HttpInterceptorFn = (req, next) => {
  const dev = inject(SviluppoStore);

  const headers: Record<string, string> = {
    'X-Assieme-Ruolo': dev.ruolo(),
  };

  const latenza = dev.latenzaExtra();
  if (latenza > 0) headers['X-Mock-Latenza'] = String(latenza);

  const errore = dev.consumaErrore();
  if (errore !== 'nessuno') headers['X-Mock-Errore'] = errore;

  return next(req.clone({ setHeaders: headers }));
};
