import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Avviso } from '@shared/ui/avviso/avviso';
import { Badge } from '@shared/ui/badge/badge';
import { Icona } from '@shared/ui/icona/icona';
import type { NomeIcona } from '@shared/ui/icona/registro-icone';

/**
 * Canali — da dove arrivano le richieste dei clienti.
 *
 * La chat non è l'unica porta: l'agenzia riceve su WhatsApp e sulla casella
 * di posta, e lì valgono le stesse istruzioni (regole di giudizio e
 * documenti di riferimento) che valgono in chat. Questa pagina mostra i
 * canali collegati e che cosa VELIA ci fa.
 *
 * **È un'anteprima**: il collegamento vero (WhatsApp Business API da un
 * lato, la casella IMAP dall'altro) non esiste ancora, e i numeri qui sotto
 * sono d'esempio. Sta scritto anche a schermo, perché una spia «collegato»
 * che non collega niente sarebbe una bugia all'agenzia. Quando il modulo
 * esisterà, questa costante lascia il posto a `GET /api/canali` e il resto
 * della pagina resta com'è.
 */
interface CanaleCollegato {
  id: string;
  icona: NomeIcona;
  nome: string;
  /** L'identità del canale: il numero, la casella. */
  recapito: string;
  /** Com'è collegato, detto come lo direbbe l'agenzia. */
  collegamento: string;
  /** Che cosa VELIA fa di ciò che arriva. */
  comportamento: string;
  ultimaSincronizzazione: string;
  richiesteMese: number;
  rispostePreparate: number;
}

const CANALI_ANTEPRIMA: CanaleCollegato[] = [
  {
    id: 'canale-whatsapp',
    icona: 'whatsapp',
    nome: 'WhatsApp Business',
    recapito: '+39 011 475 0182',
    collegamento: 'WhatsApp Business API, numero verificato',
    comportamento:
      'I messaggi dei clienti entrano come conversazioni. VELIA prepara la risposta con le regole e i documenti di riferimento dell’agenzia, e aspetta il tuo via prima di inviarla.',
    ultimaSincronizzazione: '2 minuti fa',
    richiesteMese: 47,
    rispostePreparate: 39,
  },
  {
    id: 'canale-email',
    icona: 'email',
    nome: 'Posta dell’agenzia',
    recapito: 'assistenza@assicurazionimeridiana.it',
    collegamento: 'Casella IMAP, lettura e risposta dallo stesso indirizzo',
    comportamento:
      'Ogni email con una domanda sulle polizze diventa una conversazione con gli allegati già letti. La bozza cita i documenti d’archivio, e resta in attesa finché non la approvi.',
    ultimaSincronizzazione: '5 minuti fa',
    richiesteMese: 128,
    rispostePreparate: 96,
  },
];

@Component({
  selector: 'app-canali',
  imports: [Avviso, Badge, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './canali.html',
  styleUrl: './canali.scss',
})
export class Canali {
  protected readonly canali = CANALI_ANTEPRIMA;
}
