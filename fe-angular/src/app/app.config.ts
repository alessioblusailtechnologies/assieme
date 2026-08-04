import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { AssiemePreset } from '../styles/theme/assieme-preset';
import { environment } from '@env';
import { erroreInterceptor } from '@core/interceptors/errore.interceptor';
import { routes } from './app.routes';
import { sviluppoInterceptor } from '@core/interceptors/sviluppo.interceptor';

/*
 * L'interceptor di sviluppo entra nella catena solo dove ha senso. In
 * produzione la catena contiene il solo `erroreInterceptor`, e quando
 * arriverà l'autenticazione vera si aggiungerà qui il suo.
 */
const interceptors: HttpInterceptorFn[] = environment.devTools
  ? [sviluppoInterceptor, erroreInterceptor]
  : [erroreInterceptor];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      /* I parametri di rotta arrivano ai componenti come input a signal:
         niente `ActivatedRoute` iniettato per leggere un `:id`. */
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),

    /*
     * `withFetch` invece di XMLHttpRequest: è il default consigliato e — cosa
     * che qui conta — è il trasporto su cui si appoggia lo streaming della
     * chat. Il backend XHR è inoltre deprecato e verrà rimosso in Angular 23.
     */
    provideHttpClient(withFetch(), withInterceptors(interceptors)),

    /* Le notifiche sono un servizio globale: l'interceptor degli errori le
       usa senza che nessuna schermata debba fornirle. */
    MessageService,

    providePrimeNG({
      /*
       * Finché è stringa vuota, PrimeNG la ignora (`find(Boolean)` nel suo
       * inizializzatore) e mostra il banner di licenza non valida. Basta
       * incollare la chiave in `environment.ts` perché sparisca.
       */
      license: environment.primeuiLicense,
      theme: {
        preset: AssiemePreset,
        options: {
          /* ASSIEME è solo chiara. `false` disattiva il selettore di modalità
             scura; il resto lo fa `color-scheme: light` in `_base.scss`. */
          darkModeSelector: false,
          /*
           * I livelli CSS mettono il tema PrimeNG sotto ai nostri stili:
           * senza, le regole di `_primeng-overrides.scss` dovrebbero
           * rincorrere la specificità di PrimeNG a colpi di `!important`.
           */
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        },
      },
      ripple: false, // effetto Material, estraneo al design
    }),
  ],
};
