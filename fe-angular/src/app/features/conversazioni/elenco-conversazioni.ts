import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaApri } from '@shared/griglia/cella-apri';
import { Icona } from '@shared/ui/icona/icona';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';
import { Tag } from '@shared/ui/tag/tag';

const PER_PAGINA = 20;

/**
 * Tutte le conversazioni, in tabella.
 *
 * La barra laterale mostra solo le più recenti (RF-C-01): chi ne ha
 * centinaia le ritrova qui, per titolo e per data. La sorgente è lo stesso
 * storico della barra — l'API lo consegna intero, in una pagina sola — e
 * ricerca e paginazione si fanno in memoria: nessuna chiamata in più, e
 * rinominare o eliminare dalla barra si riflette qui all'istante.
 *
 * Rinomina ed eliminazione restano nella barra, al passaggio sulla voce:
 * questa è una pagina di lettura e di ritrovamento.
 */
@Component({
  selector: 'app-elenco-conversazioni',
  imports: [
    Bottone,
    Briciole,
    Campo,
    CellaApri,
    DatePipe,
    Icona,
    Paginazione,
    RouterLink,
    Scheletro,
    StatoVuoto,
    Tag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-conversazioni.html',
  styleUrl: './elenco-conversazioni.scss',
})
export class ElencoConversazioni {
  protected readonly storico = inject(StoricoConversazioni);

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Conversazioni' },
  ];

  protected readonly perPagina = PER_PAGINA;
  protected readonly ricerca = signal('');
  protected readonly pagina = signal(1);

  protected readonly filtrate = computed(() => {
    const testo = this.ricerca().trim().toLocaleLowerCase('it');
    const tutte = this.storico.conversazioni();
    if (!testo) return tutte;
    return tutte.filter((c) => c.titolo.toLocaleLowerCase('it').includes(testo));
  });

  protected readonly totale = computed(() => this.filtrate().length);

  /* La pagina chiesta può non esistere più — un'eliminazione dalla barra
     accorcia l'elenco sotto i piedi: si resta sull'ultima che c'è. */
  protected readonly paginaCorrente = computed(() => {
    const ultima = Math.max(1, Math.ceil(this.totale() / PER_PAGINA));
    return Math.min(this.pagina(), ultima);
  });

  protected readonly visibili = computed(() => {
    const inizio = (this.paginaCorrente() - 1) * PER_PAGINA;
    return this.filtrate().slice(inizio, inizio + PER_PAGINA);
  });

  protected cerca(testo: string): void {
    this.ricerca.set(testo);
    this.pagina.set(1);
  }
}
