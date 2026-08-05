import { Injectable, signal } from '@angular/core';

import { Ruolo } from '@core/models';

/** Errori che il pannello di sviluppo sa forzare. */
export type ErroreSimulato = 'nessuno' | '500' | '403' | '429' | 'timeout';

/**
 * Stato del pannello di sviluppo.
 *
 * Non è un vezzo: gli stati che rompono un'interfaccia — latenza alta,
 * permessi mancanti, quota superata — sono precisamente quelli che non si
 * incontrano mai sviluppando su dati finti e istantanei. Poterli richiamare
 * in due clic è la differenza fra scoprirli adesso e scoprirli in
 * produzione.
 *
 * Le impostazioni viaggiano come header HTTP verso Mockoon, che ha regole di
 * risposta corrispondenti. Il vantaggio: **nessun ramo condizionale nel
 * codice applicativo**. È il server a comportarsi male, non il client a
 * fingere che il server si comporti male.
 */
@Injectable({ providedIn: 'root' })
export class SviluppoStore {
  /** Ruolo simulato: serve a verificare cosa vede l'operatore e cosa l'amministratore. */
  readonly ruolo = signal<Ruolo>('amministratore');

  /** Millisecondi aggiunti da Mockoon. 0 = latenza naturale dell'ambiente. */
  readonly latenzaExtra = signal(0);

  /** Applicato alla prossima richiesta, poi si azzera da solo. */
  readonly erroreProssimaChiamata = signal<ErroreSimulato>('nessuno');

  readonly pannelloAperto = signal(false);

  consumaErrore(): ErroreSimulato {
    const e = this.erroreProssimaChiamata();
    if (e !== 'nessuno') this.erroreProssimaChiamata.set('nessuno');
    return e;
  }
}
