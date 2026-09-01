import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { ErroreApi } from '@core/models';
import { NotificheStore } from '@core/notifiche/notifiche-store';

/**
 * Messaggi d'errore per l'utente.
 *
 * RNF-06: l'utenza è non tecnica. "Errore 500" non dice nulla a chi sta
 * confrontando due polizze; dire cosa è successo e cosa può fare sì. Il
 * codice tecnico resta nella console per chi deve diagnosticare.
 */
function messaggioPerUtente(err: HttpErrorResponse): { titolo: string; dettaglio: string } {
  const api = err.error as ErroreApi | null;

  switch (err.status) {
    case 0:
      return {
        titolo: 'Connessione assente',
        dettaglio: 'Non riusciamo a raggiungere il server. Controlla la rete e riprova.',
      };
    case 403:
      return {
        titolo: 'Permesso mancante',
        dettaglio: "Questa operazione è riservata all'amministratore dell'agenzia.",
      };
    case 404:
      return {
        titolo: 'Contenuto non trovato',
        dettaglio: 'Potrebbe essere stato eliminato o spostato da un collega.',
      };
    case 429: {
      const attesa = api?.ritentaTraSecondi;
      return {
        titolo: 'Limite del piano raggiunto',
        dettaglio: attesa
          ? `Troppe richieste in poco tempo. Riprova fra ${attesa} secondi.`
          : 'Troppe richieste in poco tempo. Attendi qualche istante e riprova.',
      };
    }
    default:
      return {
        titolo: 'Qualcosa non ha funzionato',
        dettaglio:
          api?.messaggio ?? 'La richiesta non è andata a buon fine. Riprova fra qualche istante.',
      };
  }
}

/**
 * Notifica gli errori HTTP e li rilancia.
 *
 * **Rilancia sempre.** L'interceptor si occupa di avvisare l'utente, non di
 * decidere al posto del chiamante: una schermata può voler mostrare un
 * proprio stato d'errore in pagina, e ingoiare qui l'eccezione la
 * lascerebbe in attesa per sempre.
 *
 * Il 401 è escluso di proposito: quando arriverà l'autenticazione vera sarà
 * l'interceptor di sessione a gestirlo, con rinnovo del token e redirezione
 * al login. Segnalarlo qui come errore generico sarebbe rumore.
 */
/**
 * Le richieste che l'utente non ha chiesto.
 *
 * Il riaggancio alla risposta in volo parte da solo a ogni apertura di una
 * conversazione: se fallisce non è una notizia da dare a chi sta leggendo,
 * è un servizio che non c'è. Con questo contesto l'errore resta al
 * chiamante, che decide se e come dirlo.
 */
export const SENZA_AVVISO = new HttpContextToken(() => false);

export const erroreInterceptor: HttpInterceptorFn = (req, next) => {
  const notifiche = inject(NotificheStore);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 && !req.context.get(SENZA_AVVISO)) {
        const { titolo, dettaglio } = messaggioPerUtente(err);
        notifiche.aggiungi({ gravita: 'errore', titolo, dettaglio });
      }
      return throwError(() => err);
    }),
  );
};
