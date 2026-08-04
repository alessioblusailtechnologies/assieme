import { Injectable, signal } from '@angular/core';

import { Ruolo } from '@core/models';

/** Errori che il pannello di sviluppo sa forzare. */
export type ErroreSimulato = 'nessuno' | '500' | '403' | '429' | 'timeout';

/**
 * Tipografia in uso e sua alternativa in valutazione.
 * Vedi `styles/_prova-font.scss`.
 */
export type ProvaFont =
  | 'attuale'
  | 'professionale'
  | 'solo-serif'
  | 'solo-mono'
  | 'solo-sistema';

export const PROVE_FONT: { valore: ProvaFont; etichetta: string }[] = [
  { valore: 'attuale', etichetta: 'attuale — Newsreader + DM Mono (261 KB)' },
  { valore: 'solo-serif', etichetta: 'solo serif — via DM Mono (213 KB)' },
  { valore: 'solo-mono', etichetta: 'solo mono — via Newsreader (48 KB)' },
  { valore: 'solo-sistema', etichetta: 'solo sistema — nessuno scaricato (0 KB)' },
  { valore: 'professionale', etichetta: 'alternativa — Source Serif + Source Sans' },
];

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

  /** Tipografia: quella in uso, o l'alternativa in valutazione. */
  readonly provaFont = signal<ProvaFont>('attuale');

  consumaErrore(): ErroreSimulato {
    const e = this.erroreProssimaChiamata();
    if (e !== 'nessuno') this.erroreProssimaChiamata.set('nessuno');
    return e;
  }
}
