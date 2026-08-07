import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { environment } from '@env';
import { autenticazioneInterceptor } from '@core/interceptors/autenticazione.interceptor';
import { erroreInterceptor } from '@core/interceptors/errore.interceptor';
import { routes } from './app.routes';
import { sviluppoInterceptor } from '@core/interceptors/sviluppo.interceptor';

/*
 * L'interceptor di sviluppo entra nella catena solo dove ha senso. In
 * produzione la catena è autenticazione + errori.
 *
 * L'ordine conta: l'autenticazione sta prima degli errori, così un 401
 * recuperato dal rinnovo del token non arriva mai al gestore che notifica
 * (che comunque i 401 li ignora — sono suoi solo gli errori definitivi).
 */
const interceptors: HttpInterceptorFn[] = environment.devTools
  ? [sviluppoInterceptor, autenticazioneInterceptor, erroreInterceptor]
  : [autenticazioneInterceptor, erroreInterceptor];

/*
 * Locale italiana registrata all'avvio.
 *
 * Angular parte da `en-US`: senza questa riga, date e numeri formattati
 * senza schema esplicito uscirebbero all'americana — 8/4/2026 per il 4
 * agosto. In un prodotto per il mercato italiano è il genere di dettaglio
 * che non si nota finché non causa un fraintendimento su una data di
 * decorrenza.
 */
registerLocaleData(localeIt);

/*
 * Nessuna libreria di componenti: l'interfaccia è il design system di
 * VELIA — le classi in `styles/_ui.scss` e i componenti in `shared/ui`.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'it-IT' },

    provideBrowserGlobalErrorListeners(),

    provideRouter(
      routes,
      /* I parametri di rotta arrivano ai componenti come input a signal:
         niente `ActivatedRoute` iniettato per leggere un `:id`. */
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),

    /* `withFetch`: il trasporto su cui si appoggia anche lo streaming della
       chat. Il backend XHR è deprecato e verrà rimosso in Angular 23. */
    provideHttpClient(withFetch(), withInterceptors(interceptors)),
  ],
};
