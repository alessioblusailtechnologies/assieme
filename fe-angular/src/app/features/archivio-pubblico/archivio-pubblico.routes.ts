import { Routes } from '@angular/router';

import { ArchivioPubblicoStore } from './archivio-pubblico-store';

/**
 * Rotte dell'Archivio Pubblico.
 *
 * Lo store è fornito qui, sulla rotta padre, e non a livello di
 * applicazione: i filtri sopravvivono al viaggio verso la scheda di un
 * documento e ritorno — che è il gesto più frequente di questa sezione — ma
 * uscendo dall'archivio si riparte puliti, senza portarsi dietro una ricerca
 * dimenticata da mezz'ora prima.
 */
export const ARCHIVIO_PUBBLICO_ROUTES: Routes = [
  {
    path: '',
    providers: [ArchivioPubblicoStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./elenco/elenco-documenti').then((m) => m.ElencoDocumenti),
        title: 'Archivio pubblico — Assieme',
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./dettaglio/dettaglio-documento').then((m) => m.DettaglioDocumento),
        title: 'Documento — Assieme',
      },
    ],
  },
];
