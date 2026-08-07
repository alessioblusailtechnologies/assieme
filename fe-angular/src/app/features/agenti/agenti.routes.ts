import { Routes } from '@angular/router';

/**
 * Rotte degli agenti (RF-E-01…E-13).
 *
 * L'editor serve sia la creazione sia la modifica: la differenza è un id in
 * più, e tenere due componenti significherebbe tenere due form identici che
 * divergono. `nuovo` accetta `?predefinito=` per partire da un agente della
 * libreria (RF-E-10) già compilato.
 */
export const AGENTI_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./elenco/elenco-agenti').then((m) => m.ElencoAgenti),
    title: 'Agenti — Velia',
  },
  {
    path: 'nuovo',
    loadComponent: () => import('./editor/editor-agente').then((m) => m.EditorAgente),
    title: 'Nuovo agente — Velia',
  },
  {
    path: ':id/modifica',
    loadComponent: () => import('./editor/editor-agente').then((m) => m.EditorAgente),
    title: 'Modifica agente — Velia',
  },
  {
    path: ':id/esecuzioni/:esecuzioneId',
    loadComponent: () =>
      import('./esecuzione/esecuzione-agente').then((m) => m.EsecuzioneAgentePagina),
    title: 'Esito esecuzione — Velia',
  },
  {
    path: ':id',
    loadComponent: () => import('./dettaglio/dettaglio-agente').then((m) => m.DettaglioAgente),
    title: 'Agente — Velia',
  },
];
