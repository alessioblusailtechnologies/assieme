import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { CellaApri } from '@shared/griglia/cella-apri';
import { Icona } from '@shared/ui/icona/icona';
import { Paginato, TabellaRiepilogo } from '@core/models';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { TabelleApi } from '@core/api/tabelle-api';
import { Tag } from '@shared/ui/tag/tag';

/**
 * Tabelle di analisi — elenco (RF-C-14: salvate e riapribili).
 *
 * Compaiono anche le tabelle condivise dai colleghi (RF-C-15), riconoscibili
 * dal tag: si aprono in sola lettura e si duplicano dal dettaglio per
 * proseguirci sopra.
 */
@Component({
  selector: 'app-elenco-tabelle',
  imports: [Badge, Bottone, Briciole, CellaApri, DatePipe, Icona, RouterLink, Scheletro, StatoVuoto, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-tabelle.html',
  styleUrl: './elenco-tabelle.scss',
})
export class ElencoTabelle {
  private readonly api = inject(TabelleApi);

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Tabelle di analisi' },
  ];

  private readonly risorsa = httpResource<Paginato<TabellaRiepilogo>>(() => this.api.urlElenco());

  protected readonly tabelle = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().elementi : [],
  );
  protected readonly totale = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().totale : 0,
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected riprova(): void {
    this.risorsa.reload();
  }
}
