import { Routes } from '@angular/router';

/**
 * Rotte delle Impostazioni (Modulo D).
 *
 * La sezione ha una shell propria con la navigazione secondaria: cinque
 * sottosezioni, ciascuna in lazy loading. La visibilità differenziata per
 * ruolo (RF-D-01) è a due livelli: la voce Utenti compare solo a chi ha il
 * permesso, e comunque il server risponde 403 a chi non lo ha — la seconda
 * linea non si affida mai alla prima.
 *
 * `mcp` è la superficie FE del Modulo F (Fase 7): piccola per scelta — il
 * valore del modulo sta nel backend.
 */
export const IMPOSTAZIONI_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./sezione/sezione-impostazioni').then((m) => m.SezioneImpostazioni),
    children: [
      { path: '', redirectTo: 'modello', pathMatch: 'full' },
      {
        path: 'modello',
        loadComponent: () => import('./modello/modello').then((m) => m.Modello),
        title: 'Modello AI — Velia',
      },
      {
        path: 'istruzioni',
        loadComponent: () => import('./istruzioni/istruzioni').then((m) => m.Istruzioni),
        title: 'Istruzioni — Velia',
      },
      {
        path: 'template',
        loadComponent: () =>
          import('./template/template-output').then((m) => m.TemplateOutputSezione),
        title: 'Template di output — Velia',
      },
      {
        path: 'utenti',
        loadComponent: () => import('./utenti/utenti').then((m) => m.Utenti),
        title: 'Utenti — Velia',
      },
      {
        path: 'crediti',
        loadComponent: () => import('./crediti/crediti').then((m) => m.Crediti),
        title: 'Crediti — Velia',
      },
      {
        /* Fase 7 — costruita. Il valore del Modulo F resta tutto nel backend. */
        path: 'mcp',
        loadComponent: () => import('./mcp/accesso-mcp').then((m) => m.AccessoMcp),
        title: 'Accesso MCP — Velia',
      },
      {
        /* L'unica sottosezione che non tocca il server: il tema è una
           preferenza della postazione, non dell'agenzia. */
        path: 'aspetto',
        loadComponent: () => import('./aspetto/aspetto').then((m) => m.Aspetto),
        title: 'Aspetto — Velia',
      },
    ],
  },
];
