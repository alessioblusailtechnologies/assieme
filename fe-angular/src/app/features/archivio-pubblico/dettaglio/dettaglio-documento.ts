import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Breadcrumb } from 'primeng/breadcrumb';
import { ButtonDirective } from 'primeng/button';
import { MenuItem } from 'primeng/api';

import { Badge } from '@shared/ui/badge/badge';
import { DettaglioDocumento as Dettaglio, DocumentiApi } from '@core/api/documenti-api';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { etichettaTipologia } from '@shared/testi/etichette';

/**
 * Scheda di un documento dell'Archivio Pubblico.
 *
 * RF-A-02 (metadati strutturati), RF-A-04 (edizioni multiple con evidenza
 * della corrente), RF-A-07 (freschezza dei contenuti per compagnia).
 *
 * Il visualizzatore PDF è ancora un segnaposto: arriva in Fase 3, dove serve
 * davvero, perché RF-C-05 chiede di aprire il documento **posizionato sul
 * passaggio citato**. Costruirlo qui significherebbe costruirlo due volte.
 */
@Component({
  selector: 'app-dettaglio-documento',
  imports: [
    Badge,
    Breadcrumb,
    ButtonDirective,
    DatePipe,
    Icona,
    RouterLink,
    Scheletro,
    StatoVuoto,
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
   * L'ultima briciola porta il titolo del documento, non un'etichetta fissa:
   * arrivando da un collegamento condiviso è la sola cosa che dice dove si è
   * finiti. Finché il documento non è caricato resta un segnaposto neutro,
   * per non far saltare la riga quando arriva.
   */
  protected readonly briciole = computed<MenuItem[]>(() => [
    { label: 'Archivi' },
    { label: 'Pubblico', routerLink: '/archivio/pubblico' },
    { label: this.documento()?.titolo ?? 'Documento' },
  ]);

  /** Le altre edizioni dello stesso documento, esclusa quella aperta. */
  protected readonly altreEdizioni = computed(
    () => this.documento()?.edizioni.filter((e) => e.documentoId !== this.id()) ?? [],
  );

  protected riprova(): void {
    this.risorsa.reload();
  }
}
