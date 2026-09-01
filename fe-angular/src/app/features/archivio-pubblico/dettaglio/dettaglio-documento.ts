import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { DettaglioDocumento as Dettaglio, DocumentiApi } from '@core/api/documenti-api';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SegnalaDocumento } from '../segnalazione/segnala-documento';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { etichettaTipologia } from '@shared/testi/etichette';

/**
 * Scheda di un documento dell'Archivio Pubblico.
 *
 * RF-A-02 (metadati strutturati), RF-A-04 (edizioni multiple con evidenza
 * della corrente), RF-A-07 (freschezza dei contenuti per compagnia).
 */
@Component({
  selector: 'app-dettaglio-documento',
  imports: [
    Badge,
    Bottone,
    Briciole,
    DatePipe,
    Icona,
    RouterLink,
    Scheletro,
    SegnalaDocumento,
    StatoVuoto,
    VisualizzatorePdf,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dettaglio-documento.html',
  styleUrl: './dettaglio-documento.scss',
})
export class DettaglioDocumento {
  private readonly api = inject(DocumentiApi);

  /** Arriva dalla rotta grazie a `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  private readonly risorsa = httpResource<Dettaglio>(() => this.api.urlDettaglio(this.id()));

  /* `value()` solleva un'eccezione in stato d'errore: qui diventa
     `undefined` e il template mostra lo stato d'errore vero e proprio. */
  protected readonly documento = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : undefined,
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected readonly etichettaTipologia = etichettaTipologia;

  /**
   * L'indirizzo del PDF lo compone il client, non il server: in produzione
   * l'app sta su un host e l'API su un altro, e un percorso relativo finirebbe
   * sul sito statico - che risponde `index.html` a qualunque rotta, quindi con
   * un 200 e l'anteprima che non si apre senza dire perché.
   */
  protected urlFile(id: string): string {
    return this.api.urlFile(id);
  }

  /**
   * L'ultima briciola porta il titolo del documento, non un'etichetta fissa:
   * arrivando da un collegamento condiviso è la sola cosa che dice dove si è
   * finiti. Finché il documento non è caricato resta un segnaposto neutro,
   * per non far saltare la riga quando arriva.
   */
  /**
   * Stesse etichette della barra laterale, e il percorso si ferma
   * all'archivio: il titolo del documento sta sulla stessa riga, subito
   * accanto e in grande, e ripeterlo a mezzo centimetro di distanza allunga
   * una riga già densa senza aggiungere nulla.
   */
  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Archivio pubblico', percorso: '/archivio/pubblico' },
  ];

  /** Le altre edizioni dello stesso documento, esclusa quella aperta. */
  protected readonly altreEdizioni = computed(
    () => this.documento()?.edizioni.filter((e) => e.documentoId !== this.id()) ?? [],
  );

  protected riprova(): void {
    this.risorsa.reload();
  }
}
