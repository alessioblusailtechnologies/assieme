import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { EsecuzioneRiepilogo, RiferimentoRichiesta } from '@core/models';
import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { ComponenteStatoEsecuzione } from '../stato-esecuzione';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { DettaglioAgenteStore } from './dettaglio-agente-store';
import { Icona } from '@shared/ui/icona/icona';
import type { NomeIcona } from '@shared/ui/icona/registro-icone';
import { PianoAgenteScheda } from './piano-agente';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';
import { segmenti } from '@shared/ui/barra-richiesta/riferimenti-in-linea';
import { etichettaPianificazione } from '../pianificazione';

/** Un pezzo della richiesta come si mostra: parole, o un riferimento risolto (o sparito). */
type ParteRichiesta =
  | { tipo: 'testo'; testo: string }
  | { tipo: 'riferimento'; riferimento: RiferimentoRichiesta | undefined };

/**
 * Un agente (RF-E-01…E-06).
 *
 * In alto il piano, perché è la cosa da confermare; sotto la richiesta com'è
 * stata scritta, coi riferimenti al loro posto, e quando corre. Accanto lo
 * storico delle esecuzioni, che è il motivo per cui si torna sulla pagina.
 * «Esegui ora» parte solo col piano confermato; un'esecuzione avviata
 * compare subito in cima e la pagina la segue da sola (RF-E-07).
 */
@Component({
  selector: 'app-dettaglio-agente',
  providers: [DettaglioAgenteStore],
  imports: [
    Badge,
    Bottone,
    Briciole,
    ComponenteStatoEsecuzione,
    DatePipe,
    Icona,
    PianoAgenteScheda,
    RouterLink,
    Scheletro,
    StatoVuoto,
    Suggerimento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dettaglio-agente.html',
  styleUrl: './dettaglio-agente.scss',
})
export class DettaglioAgente {
  protected readonly store = inject(DettaglioAgenteStore);
  private readonly conferme = inject(ConfermeStore);

  /** Dalla rotta `/agenti/:id`. */
  readonly id = input.required<string>();

  constructor() {
    effect(() => this.store.apri(this.id()));
  }

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Agenti', percorso: '/agenti' },
    { etichetta: this.store.agente()?.nome ?? 'Agente' },
  ]);

  protected readonly etichettaPianificazione = etichettaPianificazione;

  /** La richiesta com'è stata scritta, coi riferimenti al loro posto. */
  protected readonly parti = computed<ParteRichiesta[]>(() => {
    const agente = this.store.agente();
    if (!agente) return [];
    return segmenti(agente.richiesta).map(
      (s): ParteRichiesta =>
        'tipo' in s
          ? {
              tipo: 'riferimento',
              riferimento: agente.riferimenti.find((r) => r.tipo === s.tipo && r.chiave === s.chiave),
            }
          : { tipo: 'testo', testo: s.testo },
    );
  });

  protected icona(riferimento: RiferimentoRichiesta): NomeIcona {
    if (riferimento.tipo === 'cliente') return 'utente';
    if (riferimento.tipo === 'prodotto') return 'archivio-pubblico';
    return riferimento.archivio === 'pubblico' ? 'archivio-pubblico' : 'documento';
  }

  // --- Eliminazione (la finestra di conferma, come ovunque) ----------------

  protected async elimina(nome: string): Promise<void> {
    const conferma = await this.conferme.chiedi({
      titolo: `Eliminare «${nome}»?`,
      dettaglio:
        'L’agente sparisce con la sua pianificazione e con lo storico delle esecuzioni. Non si torna indietro.',
    });
    if (conferma) this.store.elimina();
  }

  // --- Storico (RF-E-06) --------------------------------------------------

  /** Durata leggibile, es. `1 min 12 s`. Vuota finché l'esecuzione corre. */
  protected durata(esecuzione: EsecuzioneRiepilogo): string {
    if (!esecuzione.conclusaIl) return '';
    const ms = new Date(esecuzione.conclusaIl).getTime() - new Date(esecuzione.avviataIl).getTime();
    const secondi = Math.max(Math.round(ms / 1000), 0);
    if (secondi < 60) return `${secondi} s`;
    return `${Math.floor(secondi / 60)} min ${secondi % 60} s`;
  }
}
