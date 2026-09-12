import { Routes } from '@angular/router';

/**
 * I clienti (`PIANO-CLIENTI.md`, Fase 4).
 *
 * Due schermate: l'elenco, che è il modo in cui si cerca qualcuno, e la
 * scheda, che è il posto dove sta tutto quello che lo riguarda —
 * anagrafica, documenti, chat. La scheda ha l'id nell'indirizzo perché è un
 * posto: si manda a un collega, e il tasto Indietro funziona.
 */
export const CLIENTI_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./elenco/elenco-clienti').then((m) => m.ElencoClienti),
    title: 'Clienti - Velia',
  },
  {
    path: ':id',
    loadComponent: () => import('./dettaglio/dettaglio-cliente').then((m) => m.DettaglioCliente),
    title: 'Cliente - Velia',
  },
];
