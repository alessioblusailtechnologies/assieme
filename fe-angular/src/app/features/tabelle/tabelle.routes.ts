import { Routes } from '@angular/router';

/**
 * Rotte delle tabelle di analisi (RF-C-11…C-15).
 *
 * Nessuno store di sezione: l'elenco non ha filtri da far sopravvivere alla
 * navigazione, e il dettaglio ha uno stato tutto suo — vive con la tabella
 * aperta e muore con lei, polling compreso.
 */
export const TABELLE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./elenco/elenco-tabelle').then((m) => m.ElencoTabelle),
    title: 'Tabelle di analisi — Assieme',
  },
  {
    path: 'nuova',
    loadComponent: () =>
      import('./costruttore/costruttore-tabella').then((m) => m.CostruttoreTabella),
    title: 'Nuova tabella di analisi — Assieme',
  },
  {
    path: ':id',
    loadComponent: () => import('./dettaglio/dettaglio-tabella').then((m) => m.DettaglioTabella),
    title: 'Tabella di analisi — Assieme',
  },
];
