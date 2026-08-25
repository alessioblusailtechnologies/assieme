import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { environment } from '@env';
import { TokenStore } from './token-store';

/**
 * La porta prima della shell: senza token si va a `/accesso`, subito, senza
 * caricare nulla. Il rinnovo e il 401 restano all'interceptor (un token
 * scaduto si scopre solo chiamando l'API); qui si decide solo se c'è una
 * sessione da cui partire.
 *
 * Contro il mock e nella demo senza autenticazione il guard si spegne con
 * `window.veliaSenzaAccesso = true` in `public/config.js`.
 */
export const accessoGuard: CanMatchFn = () => {
  if (!environment.accessoObbligatorio) return true;
  const token = inject(TokenStore);
  return token.tokenAccesso() ? true : inject(Router).createUrlTree(['/accesso']);
};

/** La porta al contrario: chi ha già una sessione non vede la pagina di accesso. */
export const giaDentroGuard: CanMatchFn = () => {
  if (!environment.accessoObbligatorio) return true;
  const token = inject(TokenStore);
  return token.tokenAccesso() ? inject(Router).createUrlTree(['/']) : true;
};
