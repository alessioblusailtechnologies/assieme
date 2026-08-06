import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { AgentePredefinito, AgenteRiepilogo, LimitiAgenti, Paginato } from '@core/models';
import { AgentiApi } from '@core/api/agenti-api';
import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { ComponenteStatoEsecuzione } from '../stato-esecuzione';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { etichettaPianificazione } from '../pianificazione';

/**
 * Agenti — elenco (RF-E-01).
 *
 * È la plancia dell'automazione: per ogni agente si vede se è attivo, quando
 * corre e com'è andata l'ultima volta — la domanda con cui si apre la
 * sezione. I limiti del piano (RF-E-09) stanno in testata, dichiarati prima
 * che diventino un errore.
 *
 * Sotto l'elenco, la libreria dei predefiniti (RF-E-10): «Parti da questo»
 * apre la creazione già compilata, e ciò che ne nasce è un agente del tenant
 * come gli altri.
 */
@Component({
  selector: 'app-elenco-agenti',
  imports: [
    Badge,
    Bottone,
    Briciole,
    ComponenteStatoEsecuzione,
    DatePipe,
    Icona,
    RouterLink,
    Scheletro,
    StatoVuoto,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-agenti.html',
  styleUrl: './elenco-agenti.scss',
})
export class ElencoAgenti {
  private readonly api = inject(AgentiApi);

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Agenti' },
  ];

  private readonly risorsa = httpResource<Paginato<AgenteRiepilogo>>(() => this.api.urlElenco());

  protected readonly agenti = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().elementi : [],
  );
  protected readonly totale = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().totale : 0,
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  private readonly risorsaLimiti = httpResource<LimitiAgenti>(() => this.api.urlLimiti());
  protected readonly limiti = computed(() =>
    this.risorsaLimiti.hasValue() ? this.risorsaLimiti.value() : undefined,
  );

  private readonly risorsaPredefiniti = httpResource<AgentePredefinito[]>(() =>
    this.api.urlPredefiniti(),
  );
  protected readonly predefiniti = computed(() =>
    this.risorsaPredefiniti.hasValue() ? this.risorsaPredefiniti.value() : [],
  );

  protected riprova(): void {
    this.risorsa.reload();
  }

  protected readonly etichettaPianificazione = etichettaPianificazione;
}
