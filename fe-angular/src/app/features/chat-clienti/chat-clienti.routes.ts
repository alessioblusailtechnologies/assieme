import { Routes } from '@angular/router';

import { ChatClientiStore } from './chat-clienti-store';

/**
 * Le chat per i clienti dell'agenzia (Fase 2 del piano).
 *
 * Lo store sta sulla rotta padre: passando dall'elenco alla scheda e
 * viceversa non si ricarica tutto da capo, e soprattutto **il link appena
 * creato sopravvive al passaggio** — si vede una volta sola, e perderlo
 * navigando sarebbe il modo più stupido di doverlo rigenerare.
 */
export const CHAT_CLIENTI_ROUTES: Routes = [
  {
    path: '',
    providers: [ChatClientiStore],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./elenco/elenco-chat-clienti').then((m) => m.ElencoChatClienti),
        title: 'Chat per i clienti - Velia',
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./dettaglio/dettaglio-chat-cliente').then((m) => m.DettaglioChatCliente),
        title: 'Chat cliente - Velia',
      },
    ],
  },
];
