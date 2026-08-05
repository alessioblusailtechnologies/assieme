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
 * `mcp` resta un segnaposto: il Modulo F ha superficie FE minima e arriva
 * con la Fase 7.
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
        title: 'Modello AI — Assieme',
      },
      {
        path: 'istruzioni',
        loadComponent: () => import('./istruzioni/istruzioni').then((m) => m.Istruzioni),
        title: 'Istruzioni — Assieme',
      },
      {
        path: 'template',
        loadComponent: () =>
          import('./template/template-output').then((m) => m.TemplateOutputSezione),
        title: 'Template di output — Assieme',
      },
      {
        path: 'utenti',
        loadComponent: () => import('./utenti/utenti').then((m) => m.Utenti),
        title: 'Utenti — Assieme',
      },
      {
        path: 'mcp',
        loadComponent: () =>
          import('@shared/segnaposto/segnaposto-fase').then((m) => m.SegnapostoFase),
        title: 'Accesso MCP — Assieme',
        data: {
          titolo: 'Accesso MCP',
          fase: 7,
          descrizione:
            'Credenziali per collegare ASSIEME come strumento nei client AI esterni: generazione e revoca dei token, stato delle connessioni, istruzioni di configurazione. Il valore del modulo è tutto nel backend.',
          requisiti: ['RF-F-02', 'RF-F-04'],
        },
      },
    ],
  },
];
