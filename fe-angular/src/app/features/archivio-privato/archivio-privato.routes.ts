import { Routes } from '@angular/router';

import { ArchivioPrivatoStore } from './archivio-privato-store';

/**
 * Rotte dell'Archivio Privato.
 *
 * Lo store è fornito sulla rotta padre: filtri e coda di caricamento
 * sopravvivono al viaggio verso la scheda di un documento e ritorno — che è
 * il gesto più frequente della sezione — ma uscendo si riparte puliti.
 */
export const ARCHIVIO_PRIVATO_ROUTES: Routes = [
  {
    path: '',
    providers: [ArchivioPrivatoStore],
    children: [
      {
        path: '',
        loadComponent: () => import('./elenco/elenco-privati').then((m) => m.ElencoPrivati),
        title: 'Archivio privato — Assieme',
      },
      {
        path: ':id',
        loadComponent: () => import('./dettaglio/dettaglio-privato').then((m) => m.DettaglioPrivato),
        title: 'Documento — Assieme',
      },
    ],
  },
];
