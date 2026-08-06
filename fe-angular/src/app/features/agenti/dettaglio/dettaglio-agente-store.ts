import { httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import {
  Agente,
  EsecuzioneRiepilogo,
  Id,
  Paginato,
  StatoEsecuzione,
} from '@core/models';
import { AgentiApi } from '@core/api/agenti-api';
import { NotificheStore } from '@core/notifiche/notifiche-store';

/** Ogni quanto si richiede lo storico mentre un'esecuzione lavora. */
const MS_INTERROGAZIONE = 1500;

/**
 * Stato dell'agente aperto.
 *
 * Fornito sul componente di dettaglio: vive con l'agente e muore con lui,
 * interrogazione periodica compresa. Lo schema è quello delle tabelle: finché
 * nello storico c'è un'esecuzione `in-coda` o `in-corso` lo storico si
 * richiede a intervalli, e il polling **si ferma da solo**.
 *
 * RF-E-07 (notifiche in applicazione): l'assestarsi di un'esecuzione
 * osservata — da in corso a completata o fallita — produce una notifica.
 * È il polling stesso a vederla passare di stato, non un canale in più.
 */
@Injectable()
export class DettaglioAgenteStore {
  private readonly api = inject(AgentiApi);
  private readonly notifiche = inject(NotificheStore);
  private readonly router = inject(Router);

  readonly id = signal<Id | undefined>(undefined);

  private readonly risorsa = httpResource<Agente>(() => {
    const id = this.id();
    return id ? this.api.urlDettaglio(id) : undefined;
  });

  readonly agente = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : undefined));
  readonly inCaricamento = this.risorsa.isLoading;
  readonly errore = this.risorsa.error;

  private readonly risorsaEsecuzioni = httpResource<Paginato<EsecuzioneRiepilogo>>(() => {
    const id = this.id();
    return id ? this.api.urlEsecuzioni(id) : undefined;
  });

  readonly esecuzioni = computed(() =>
    this.risorsaEsecuzioni.hasValue() ? this.risorsaEsecuzioni.value().elementi : [],
  );

  readonly inLavoro = computed(() =>
    this.esecuzioni().some((e) => e.stato === 'in-coda' || e.stato === 'in-corso'),
  );

  /** Gli stati già visti, per riconoscere le transizioni da notificare. */
  private statiVisti = new Map<Id, StatoEsecuzione>();

  constructor() {
    effect((pulizia) => {
      if (!this.inLavoro()) return;
      const battito = setInterval(() => this.risorsaEsecuzioni.reload(), MS_INTERROGAZIONE);
      pulizia(() => clearInterval(battito));
    });

    /* Un id nuovo azzera la memoria delle transizioni: le esecuzioni di un
       altro agente non devono produrre notifiche postume. */
    effect(() => {
      this.id();
      this.statiVisti = new Map();
    });

    effect(() => {
      const nome = this.agente()?.nome ?? 'L’agente';
      for (const esecuzione of this.esecuzioni()) {
        const visto = this.statiVisti.get(esecuzione.id);
        this.statiVisti.set(esecuzione.id, esecuzione.stato);
        /* Notifica solo ciò che si è visto lavorare: lo storico caricato la
           prima volta è storia, non novità. */
        if (visto !== 'in-coda' && visto !== 'in-corso') continue;
        if (esecuzione.stato === 'completata') {
          this.notifiche.aggiungi({
            gravita: 'successo',
            titolo: `${nome}: esecuzione completata`,
            dettaglio: 'L’esito è consultabile nello storico.',
          });
        } else if (esecuzione.stato === 'fallita') {
          this.notifiche.aggiungi({
            gravita: 'errore',
            titolo: `${nome}: esecuzione fallita`,
            dettaglio: esecuzione.errore,
          });
        }
      }
    });
  }

  apri(id: Id | undefined): void {
    if (id !== this.id()) this.id.set(id);
  }

  riprova(): void {
    this.risorsa.reload();
    this.risorsaEsecuzioni.reload();
  }

  private applica = (agente: Agente): void => {
    this.risorsa.set(agente);
  };

  // --- Esecuzione (RF-E-03/05) --------------------------------------------

  /** L'esecuzione appare subito in cima allo storico; il polling fa il resto. */
  esegui(parametri?: Record<string, string>): void {
    const id = this.id();
    if (!id) return;
    this.api.esegui(id, parametri && Object.keys(parametri).length ? { parametri } : {}).subscribe({
      next: () => this.risorsaEsecuzioni.reload(),
    });
  }

  // --- Governo (RF-E-01, RF-E-04) -----------------------------------------

  attiva(attivo: boolean): void {
    const id = this.id();
    if (!id) return;
    this.api.modifica(id, { attivo }).subscribe({ next: this.applica });
  }

  sospendiPianificazione(sospesa: boolean): void {
    const id = this.id();
    const pianificazione = this.agente()?.pianificazione;
    if (!id || !pianificazione) return;
    this.api.modifica(id, { pianificazione: { ...pianificazione, sospesa } }).subscribe({
      next: this.applica,
    });
  }

  duplica(): void {
    const id = this.id();
    if (!id) return;
    this.api.duplica(id).subscribe({
      next: (copia) => void this.router.navigate(['/agenti', copia.id]),
    });
  }

  elimina(): void {
    const id = this.id();
    if (!id) return;
    this.api.elimina(id).subscribe({
      next: () => void this.router.navigate(['/agenti']),
    });
  }
}
