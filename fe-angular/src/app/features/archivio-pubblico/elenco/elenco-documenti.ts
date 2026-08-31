import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaApri } from '@shared/griglia/cella-apri';
import { CellaEdizione } from './celle/cella-edizione';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { Icona } from '@shared/ui/icona/icona';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SegnalaDocumento } from '../segnalazione/segnala-documento';
import { Select } from '@shared/ui/select/select';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { etichettaTipologia } from '@shared/testi/etichette';

/**
 * Archivio Pubblico — l'elenco per set informativi, a righe espandibili.
 *
 * Una riga per set: il prodotto in una sua edizione, con quanti documenti
 * lo compongono. La riga si espande sui documenti — DIP, DIP Aggiuntivo,
 * Condizioni, Glossario, nell'ordine di lettura — ognuno con le sue pagine
 * e l'azione per aprirne la scheda. È l'unità con cui un intermediario
 * ragiona: l'elenco per singolo documento ripeteva lo stesso prodotto tre o
 * quattro righe di fila, e cambiava solo la tipologia.
 *
 * La stella marca il set intero (RF-A-09 resta per-documento sotto il
 * cofano). Il filtro per tipologia non c'è più: a livello di set quasi ogni
 * riga ha DIP e Condizioni, e non distingueva più nulla.
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
    Checkbox,
    Icona,
    Paginazione,
    Scheletro,
    SegnalaDocumento,
    Select,
    StatoVuoto,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-documenti.html',
  styleUrl: './elenco-documenti.scss',
})
export class ElencoDocumenti {
  protected readonly store = inject(ArchivioPubblicoStore);
  protected readonly etichettaTipologia = etichettaTipologia;

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

  /**
   * Le righe aperte, per chiave di set: più set possono restare aperti
   * insieme (si confrontano due prodotti tenendoli entrambi espansi), e
   * l'apertura sopravvive alla ricarica dell'elenco — la chiave è stabile.
   */
  protected readonly espansi = signal<ReadonlySet<string>>(new Set());

  protected espanso(chiave: string): boolean {
    return this.espansi().has(chiave);
  }

  protected alternaEspansione(chiave: string): void {
    this.espansi.update((prima) => {
      const dopo = new Set(prima);
      if (!dopo.delete(chiave)) dopo.add(chiave);
      return dopo;
    });
  }
}
