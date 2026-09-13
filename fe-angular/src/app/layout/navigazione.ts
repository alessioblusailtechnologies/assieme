import { NomeIcona } from '@shared/ui/icona/registro-icone';
import { Permesso } from '@core/models';

export interface VoceNavigazione {
  percorso: string;
  etichetta: string;
  icona: NomeIcona;
  /** Se presente, la voce compare solo a chi ha il permesso. */
  permesso?: Permesso;
}

export interface GruppoNavigazione {
  etichetta: string;
  voci: VoceNavigazione[];
}

/**
 * Navigazione principale.
 *
 * I gruppi non seguono i moduli dei requisiti ma **il lavoro dell'utente**:
 * chi apre VELIA al mattino vuole chiedere qualcosa o confrontare
 * qualcosa, non "accedere al Modulo C". Gli archivi vengono dopo, perché si
 * consultano quando serve; automazione e agenzia stanno in fondo, perché si
 * configurano una volta e si toccano di rado.
 *
 * I percorsi sono in italiano come il resto del dominio: l'utente li vede
 * nella barra degli indirizzi e li condivide con i colleghi.
 */
export const NAVIGAZIONE: GruppoNavigazione[] = [
  {
    etichetta: 'Lavoro',
    voci: [
      { percorso: '/chat', etichetta: 'Chat', icona: 'chat' },
      /* I clienti stanno nel lavoro di tutti i giorni e non fra gli archivi:
         un'agenzia non «consulta» i suoi clienti, ci lavora. */
      { percorso: '/clienti', etichetta: 'Clienti', icona: 'utente' },
      { percorso: '/tabelle', etichetta: 'Tabelle di analisi', icona: 'tabelle' },
    ],
  },
  {
    etichetta: 'Archivi',
    voci: [
      { percorso: '/archivio/pubblico', etichetta: 'Archivio pubblico', icona: 'archivio-pubblico' },
      { percorso: '/archivio/privato', etichetta: 'Archivio privato', icona: 'archivio-privato' },
    ],
  },
  {
    etichetta: 'Automazione',
    /*
     * Le chat per i clienti non stanno più qui (13/09/2026): una chat è di
     * un cliente, e il posto dove la si apre e la si guarda è la sua
     * scheda. Una voce di menù a parte chiedeva di ricordarsi che esiste un
     * secondo elenco delle stesse cose. Dal 13/09/2026 quell'elenco non c'è
     * più nemmeno come rotta: resta la scheda della singola chat
     * (`/chat-clienti/:id`), che si apre dal cliente, e ogni cliente ne ha
     * al più una.
     */
    voci: [{ percorso: '/agenti', etichetta: 'Agenti', icona: 'agente' }],
  },
  {
    etichetta: 'Agenzia',
    voci: [
      /*
       * La memoria sta al primo livello e non dentro Impostazioni: RF-G-03 la
       * descrive come pannello dedicato ed è uno dei tre pilastri del DNA
       * d'Agenzia. Sepolta fra le configurazioni non la aprirebbe nessuno, e
       * una personalizzazione che non si vede non genera la fiducia che
       * dovrebbe generare. Scelta di prodotto, da confermare.
       */
      { percorso: '/memoria', etichetta: 'Memoria', icona: 'memoria' },
      { percorso: '/impostazioni', etichetta: 'Impostazioni', icona: 'impostazioni' },
    ],
  },
];
