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
        path: 'chat',
        loadComponent: segnaposto,
        data: {
          titolo: 'Chat',
          fase: 3,
          descrizione:
            'Il cuore del prodotto: conversazione in linguaggio naturale, referenziazione dei documenti con “@” su entrambi gli archivi, citazioni verificabili con apertura sul passaggio, dichiarazione esplicita quando la risposta non è supportata dai documenti.',
          requisiti: ['RF-C-01 … RF-C-10'],
        },
      },
      {
        path: 'tabelle',
        loadComponent: segnaposto,
        data: {
          titolo: 'Tabelle di analisi',
          fase: 4,
          descrizione:
            'Confronto strutturato multi-documento su AG Grid: documenti in riga, criteri in colonna, una citazione per ogni cella e “non presente” dichiarato dove il dato manca. La griglia si popola progressivamente, cella per cella.',
          requisiti: ['RF-C-11 … RF-C-15'],
        },
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
        path: 'archivio/privato',
        loadComponent: segnaposto,
        data: {
          titolo: 'Archivio privato',
          fase: 2,
          descrizione:
            "Documenti dell'agenzia: caricamento singolo e multiplo, coda di elaborazione con stato visibile, cartelle ed etichette, classificazione assistita correggibile. Isolato da ogni altro tenant.",
          requisiti: ['RF-B-01 … RF-B-05', 'RF-B-07'],
        },
      },
      {
        path: 'archivio/privato/kb',
        loadComponent: segnaposto,
        data: {
          titolo: 'Knowledge base di agenzia',
          fase: 2,
          descrizione:
            "Convenzioni, note tecniche, casistica e testi tipo: contesto permanente, consultato automaticamente dall'AI in ogni conversazione ed esecuzione senza bisogno di referenziarlo. Uno dei tre pilastri del DNA d'Agenzia.",
          requisiti: ['RF-B-09', 'RF-B-10'],
        },
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
            'Provider e modello AI, istruzioni personalizzate che governano il ragionamento, libreria dei template di output, credenziali MCP. Visibilità e permessi differenziati per ruolo.',
          requisiti: ['RF-D-01 … RF-D-13', 'RF-F-02', 'RF-F-04'],
        },
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
