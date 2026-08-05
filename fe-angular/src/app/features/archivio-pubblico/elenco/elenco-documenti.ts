import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaApri } from '@shared/griglia/cella-apri';
import { CellaEdizione } from './celle/cella-edizione';
import { CellaTipologia } from '@shared/griglia/cella-tipologia';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { DocumentoPubblico } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { TIPOLOGIE_PUBBLICHE } from '@shared/testi/etichette';

/**
 * Archivio Pubblico — elenco dei documenti.
 *
 * Una riga per documento: prodotto, tipologia, compagnia, ramo ed edizione,
 * con l'azione per aprirne la scheda. La tipologia sta subito dopo il
 * prodotto perché è ciò che distingue le righe dello stesso prodotto — DIP,
 * DIP Aggiuntivo, Condizioni, Glossario — quindi il titolo per esteso non
 * serve e lascia spazio alle colonne che si confrontano davvero.
 *
 * La tabella è HTML semantico con le classi del design system. Niente
 * ordinamento: la paginazione è lato server, e ordinare la sola pagina
 * corrente farebbe credere di aver ordinato tutto l'archivio.
 *
 * RF-A-03: navigazione per compagnia, ramo e prodotto, e ricerca per parola
 * chiave su titolo e metadati. RF-A-05: in sola lettura per i tenant.
 */
@Component({
  selector: 'app-elenco-documenti',
  imports: [
    Bottone,
    Briciole,
    Campo,
    CellaApri,
    CellaEdizione,
    CellaTipologia,
    Checkbox,
    Icona,
    Paginazione,
    Scheletro,
    Select,
    StatoVuoto,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-documenti.html',
  styleUrl: './elenco-documenti.scss',
})
export class ElencoDocumenti {
  protected readonly store = inject(ArchivioPubblicoStore);
  protected readonly tipologie = TIPOLOGIE_PUBBLICHE;

  /**
   * Le etichette sono le stesse della barra laterale.
   *
   * Se la voce di menu dice "Archivio pubblico", il percorso deve dire
   * "Archivio pubblico": chiamare in due modi la stessa schermata è il tipo
   * di incoerenza che nessuno segnala e tutti notano.
   */
  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Archivio pubblico' },
  ];

  protected readonly documenti = computed(() => this.store.documenti() as DocumentoPubblico[]);
}
