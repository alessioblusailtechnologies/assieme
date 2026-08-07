import { Routes } from '@angular/router';

import { Shell } from '@layout/shell';

/**
 * Mappa delle rotte.
 *
 * I percorsi sono in italiano: l'utente li vede nella barra degli indirizzi
 * e li incolla ai colleghi, e il dominio di questo prodotto è italiano.
 *
 * Le sezioni sono nate come segnaposto che dichiaravano fase e requisiti, e
 * sono state sostituite una alla volta dal `loadComponent`/`loadChildren`
 * della funzionalità vera. Con la Fase 7 l'ultima è stata costruita: la
 * roadmap che viveva qui è ora storia del piano di sviluppo.
 */
export const routes: Routes = [
  {
    /* Fuori dalla shell: è una porta, non una stanza. Contro il mock e
       nella demo non serve mai — nessuna rotta 401 e nessun redirect. */
    path: 'accesso',
    loadComponent: () => import('@features/accesso/accesso').then((m) => m.Accesso),
  },
  {
    path: '',
    component: Shell,
    children: [
      { path: '', redirectTo: 'chat', pathMatch: 'full' },

      {
        /* Fase 3 — costruita. */
        path: 'chat',
        loadChildren: () => import('@features/chat/chat.routes').then((m) => m.CHAT_ROUTES),
      },
      {
        /* Fase 4 — costruita. */
        path: 'tabelle',
        loadChildren: () => import('@features/tabelle/tabelle.routes').then((m) => m.TABELLE_ROUTES),
      },
      {
        /* Fase 1 — costruita. Le rotte della sezione stanno nella
           funzionalità, così l'elenco e la scheda possono condividere lo
           store dei filtri senza che questo file sappia come. */
        path: 'archivio/pubblico',
        loadChildren: () =>
          import('@features/archivio-pubblico/archivio-pubblico.routes').then(
            (m) => m.ARCHIVIO_PUBBLICO_ROUTES,
          ),
      },
      {
        /* Fase 2 — costruita. */
        path: 'archivio/privato',
        loadChildren: () =>
          import('@features/archivio-privato/archivio-privato.routes').then(
            (m) => m.ARCHIVIO_PRIVATO_ROUTES,
          ),
      },
      {
        /* Fase 6 — costruita. */
        path: 'agenti',
        loadChildren: () => import('@features/agenti/agenti.routes').then((m) => m.AGENTI_ROUTES),
      },
      {
        /* Fase 7 — costruita. Pagina sola: niente file di rotte per un pannello. */
        path: 'memoria',
        loadComponent: () =>
          import('@features/memoria/pannello-memoria').then((m) => m.PannelloMemoria),
        title: 'Memoria — Velia',
      },
      {
        /* Fase 5 — costruita; il figlio `mcp` è arrivato con la Fase 7. */
        path: 'impostazioni',
        loadChildren: () =>
          import('@features/impostazioni/impostazioni.routes').then((m) => m.IMPOSTAZIONI_ROUTES),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
