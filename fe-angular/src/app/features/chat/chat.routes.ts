import { Routes } from '@angular/router';

import { ChatStore } from './chat-store';

/**
 * Rotte della Chat.
 *
 * Lo store è fornito sulla rotta padre: lo streaming di una risposta e la
 * bozza in composizione sopravvivono al passaggio fra conversazioni, ma
 * uscendo dalla sezione si riparte puliti.
 *
 * Non c'è un componente contenitore: lo storico delle conversazioni sta
 * nella barra laterale dell'applicazione, sotto la voce Chat, e la sezione è
 * la conversazione stessa. `/chat` e `/chat/:id` caricano lo stesso
 * componente — la schermata «nuova conversazione» è una conversazione senza
 * id, con lo stesso composer.
 */
export const CHAT_ROUTES: Routes = [
  {
    path: '',
    providers: [ChatStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./conversazione/conversazione').then((m) => m.Conversazione),
        title: 'Chat — Velia',
      },
      {
        path: ':id',
        loadComponent: () => import('./conversazione/conversazione').then((m) => m.Conversazione),
        title: 'Conversazione — Velia',
      },
    ],
  },
];
