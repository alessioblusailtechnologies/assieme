import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import {
  Agente,
  AgentePredefinito,
  FrequenzaPianificazione,
  Id,
  LimitiAgenti,
  Pianificazione,
} from '@core/models';
import { AgentiApi } from '@core/api/agenti-api';
import { BarraRichiesta } from '@shared/ui/barra-richiesta/barra-richiesta';
import type { RiferimentoBarra } from '@shared/ui/barra-richiesta/riferimenti-in-linea';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { Icona } from '@shared/ui/icona/icona';
import { Select } from '@shared/ui/select/select';
import { GIORNI_SETTIMANA, frequenzeAmmesse } from '../pianificazione';

/**
 * Editor dell'agente (RF-E-01/02): serve la creazione e la modifica, e la
 * creazione può partire da un predefinito della libreria (RF-E-10,
 * `?predefinito=`).
 *
 * Dal 14/09/2026 i campi sono tre: il nome, la richiesta scritta con la
 * stessa barra della chat («@» per documenti, prodotti e clienti) e quando
 * corre. Tutto il resto, che cosa leggere, quali file preparare, a chi
 * mandare le email, si scrive nella richiesta: al salvataggio Velia la legge
 * e ne scrive il piano, che si conferma nella pagina dell'agente.
 */
@Component({
  selector: 'app-editor-agente',
  imports: [BarraRichiesta, Bottone, Briciole, Campo, Checkbox, Icona, RouterLink, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-agente.html',
  styleUrl: './editor-agente.scss',
})
export class EditorAgente {
  private readonly api = inject(AgentiApi);
  private readonly router = inject(Router);

  /** Dalla rotta `/agenti/:id/modifica`; assente in creazione. */
  readonly id = input<Id | undefined>(undefined);
  /** Da `?predefinito=`: la richiesta della libreria da cui partire. */
  readonly predefinito = input<Id | undefined>(undefined);

  protected readonly inModifica = computed(() => !!this.id());

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Agenti', percorso: '/agenti' },
    { etichetta: this.inModifica() ? 'Modifica agente' : 'Nuovo agente' },
  ]);

  // --- Risorse di contorno ------------------------------------------------

  private readonly risorsaAgente = httpResource<Agente>(() => {
    const id = this.id();
    return id ? this.api.urlDettaglio(id) : undefined;
  });

  private readonly risorsaPredefiniti = httpResource<AgentePredefinito[]>(() =>
    this.predefinito() ? this.api.urlPredefiniti() : undefined,
  );

  private readonly risorsaLimiti = httpResource<LimitiAgenti>(() => this.api.urlLimiti());
  protected readonly limiti = computed(() =>
    this.risorsaLimiti.hasValue() ? this.risorsaLimiti.value() : undefined,
  );

  // --- Il modulo ----------------------------------------------------------

  protected readonly nome = signal('');
  /** Il testo coi riferimenti come marcatori: è quello che si salva. */
  protected readonly richiesta = signal('');
  protected readonly riferimenti = signal<RiferimentoBarra[]>([]);

  protected readonly pianificata = signal(false);
  protected readonly frequenza = signal<FrequenzaPianificazione>('giornaliera');
  protected readonly orario = signal('08:00');
  protected readonly giornoSettimana = signal(1);
  protected readonly giornoMese = signal(1);
  /** Conservata in modifica: sospendere non è compito dell'editor. */
  private readonly sospesa = signal(false);

  /* Il modulo si riempie una volta sola, quando la fonte dei dati arriva:
     l'agente in modifica, o il predefinito scelto in libreria. */
  private inizializzato = false;

  constructor() {
    effect(() => {
      if (this.inizializzato) return;
      if (this.inModifica()) {
        const agente = this.risorsaAgente.hasValue() ? this.risorsaAgente.value() : undefined;
        if (agente) this.compila(agente);
        return;
      }
      const idPredefinito = this.predefinito();
      if (!idPredefinito) return;
      const scelto = (this.risorsaPredefiniti.hasValue() ? this.risorsaPredefiniti.value() : []).find(
        (p) => p.id === idPredefinito,
      );
      if (scelto) this.compila(scelto);
    });
  }

  private compila(base: Agente | AgentePredefinito): void {
    this.inizializzato = true;
    this.nome.set(base.nome);
    /* Prima i riferimenti, poi il testo: la barra ricostruisce i chip dal
       testo e li vuole già risolti. */
    this.riferimenti.set('riferimenti' in base ? base.riferimenti : []);
    this.richiesta.set(base.richiesta);

    const pianificazione = 'creatoDa' in base ? base.pianificazione : base.pianificazioneSuggerita;
    if (pianificazione) {
      this.pianificata.set(true);
      this.frequenza.set(pianificazione.frequenza);
      this.orario.set(pianificazione.orario);
      this.giornoSettimana.set(pianificazione.giornoSettimana ?? 1);
      this.giornoMese.set(pianificazione.giornoMese ?? 1);
      /* La suggerita non ha `sospesa` (è un suggerimento, non uno stato). */
      this.sospesa.set((pianificazione as Partial<Pianificazione>).sospesa ?? false);
    }
  }

  // --- Pianificazione (RF-E-04, limiti RF-E-09) ---------------------------

  protected readonly opzioniFrequenza = computed(() =>
    frequenzeAmmesse(this.limiti()?.frequenzaMinima ?? 'giornaliera'),
  );

  protected readonly giorniSettimana = GIORNI_SETTIMANA;

  protected readonly giorniMese = Array.from({ length: 28 }, (_, i) => ({
    valore: i + 1,
    etichetta: `giorno ${i + 1}`,
  }));

  // --- Salvataggio --------------------------------------------------------

  protected readonly inSalvataggio = signal(false);

  protected readonly pronto = computed(() => !!this.nome().trim() && !!this.richiesta().trim());

  private componiPianificazione(): Pianificazione | undefined {
    if (!this.pianificata()) return undefined;
    const frequenza = this.frequenza();
    return {
      frequenza,
      orario: this.orario() || '08:00',
      ...(frequenza === 'settimanale' ? { giornoSettimana: this.giornoSettimana() } : {}),
      ...(frequenza === 'mensile' ? { giornoMese: this.giornoMese() } : {}),
      sospesa: this.sospesa(),
    };
  }

  /**
   * Salva e aspetta il piano: la risposta arriva quando Velia ha letto la
   * richiesta, e la pagina dell'agente lo mostra da confermare.
   */
  protected salva(): void {
    if (!this.pronto() || this.inSalvataggio()) return;
    this.inSalvataggio.set(true);

    const pianificazione = this.componiPianificazione();
    const comune = { nome: this.nome().trim(), richiesta: this.richiesta().trim() };

    const id = this.id();
    const richiesta = id
      ? this.api.modifica(id, { ...comune, pianificazione: pianificazione ?? null })
      : this.api.crea({ ...comune, ...(pianificazione ? { pianificazione } : {}) });

    richiesta.subscribe({
      next: (agente) => void this.router.navigate(['/agenti', agente.id]),
      /* Ad avvisare ha già pensato l'interceptor: qui si riabilita il
         pulsante, perché la bozza è tutta ancora in pagina. */
      error: () => this.inSalvataggio.set(false),
    });
  }
}
