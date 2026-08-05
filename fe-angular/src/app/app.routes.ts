import { Routes } from '@angular/router';

import { Shell } from '@layout/shell';

/**
 * Mappa delle rotte.
 *
 * I percorsi sono in italiano: l'utente li vede nella barra degli indirizzi
 * e li incolla ai colleghi, e il dominio di questo prodotto è italiano.
 *
 * Ogni sezione è oggi un segnaposto che dichiara la fase in cui verrà
 * costruita e i requisiti che coprirà. Tenere la roadmap qui, accanto ai
 * percorsi, la rende difficile da dimenticare: quando una fase parte si
 * sostituisce `segnaposto` con il `loadComponent` della funzionalità vera, e
 * il resto del file non cambia.
 */
const segnaposto = () => import('@shared/segnaposto/segnaposto-fase').then((m) => m.SegnapostoFase);

export const routes: Routes = [
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
        path: 'agenti',
        loadComponent: segnaposto,
        data: {
          titolo: 'Agenti',
          fase: 6,
          descrizione:
            'Task AI definiti una volta ed eseguibili su richiesta o su pianificazione ricorrente, con storico delle esecuzioni, log ed esito. È la base che abilita le automazioni verticali future.',
          requisiti: ['RF-E-01 … RF-E-13'],
        },
      },
      {
        path: 'memoria',
        loadComponent: segnaposto,
        data: {
          titolo: 'Memoria',
          fase: 7,
          descrizione:
            "Ciò che l'assistente ha imparato dal lavoro dell'agenzia: consultabile, modificabile e cancellabile ricordo per ricordo. Le istruzioni esplicite prevalgono sempre sui ricordi appresi.",
          requisiti: ['RF-G-01 … RF-G-07'],
        },
      },
      {
        path: 'impostazioni',
        loadComponent: segnaposto,
        data: {
          titolo: 'Impostazioni',
          fase: 5,
          descrizione:
            "Provider e modello AI; le Istruzioni, con le due schede Regole e Documenti di riferimento — le prime condizionano il giudizio, i secondi forniscono fonti citabili; libreria dei template di output; credenziali MCP. Visibilità e permessi differenziati per ruolo.",
          requisiti: ['RF-D-01 … RF-D-16', 'RF-F-02', 'RF-F-04'],
        },
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
