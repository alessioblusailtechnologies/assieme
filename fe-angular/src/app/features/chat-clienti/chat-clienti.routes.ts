import { Routes } from '@angular/router';

import { ChatClientiStore } from './chat-clienti-store';

/**
 * La scheda della chat di un cliente.
 *
 * L'elenco d'insieme delle chat non c'è più (13/09/2026): una chat è di un
 * cliente, ce n'è al più una, e la si apre dalla sua scheda. Dal menù
 * l'elenco non si raggiungeva già da un giorno, e ci si finiva solo dal
 * link «indietro» della chat. Chi arriva a `/chat-clienti` senza id torna ai
 * clienti.
 *
 * Lo store resta sulla rotta padre: è quello con cui la scheda della chat
 * legge, modifica, sospende e rigenera il link.
 */
export const CHAT_CLIENTI_ROUTES: Routes = [
  {
    path: '',
    providers: [ChatClientiStore],
    children: [
      { path: '', pathMatch: 'full', redirectTo: '/clienti' },
      {
        path: ':id',
        loadComponent: () =>
          import('./dettaglio/dettaglio-chat-cliente').then((m) => m.DettaglioChatCliente),
        title: 'Chat cliente - Velia',
      },
    ],
  },
];
