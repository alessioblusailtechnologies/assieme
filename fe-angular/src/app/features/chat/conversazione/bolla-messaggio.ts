import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Accordion } from '@shared/ui/accordion/accordion';
import { Citazione, RiferimentoDocumento } from '@core/models';
import { ChipCitazione } from '@shared/ui/citazione/chip-citazione';
import { Icona } from '@shared/ui/icona/icona';
import { MessaggioInStream } from '../chat-store';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';
import { htmlRisposta } from '@shared/testi/testo-risposta';

/**
 * Un messaggio del filo: domanda dell'utente o risposta dell'assistente.
 *
 * La risposta porta con sé tutto ciò che la rende verificabile e
 * spiegabile — citazioni (RF-C-04), provenienze (RF-D-05/15, RF-G-03),
 * dichiarazione di non-copertura (RF-C-08) — e i suoi stati transitori:
 * streaming in corso, interrotta, caduta a metà.
 */
@Component({
  selector: 'app-bolla-messaggio',
  imports: [Accordion, ChipCitazione, Icona, RouterLink, Suggerimento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bolla-messaggio.html',
  styleUrl: './bolla-messaggio.scss',
  host: {
    '[class.is-utente]': 'messaggio().autore === "utente"',
    '[class.is-assistente]': 'messaggio().autore === "assistente"',
  },
})
export class BollaMessaggio {
  readonly messaggio = input.required<MessaggioInStream>();

  /**
   * Il contesto della conversazione, per dare un titolo ai documenti
   * referenziati nel messaggio: il messaggio porta i soli id (contratto), i
   * titoli stanno nel contesto. Un documento rimosso dal contesto dopo
   * l'invio non si risolve più e il suo chip non compare: il filo mostra il
   * contesto di oggi, non la storia di ieri.
   */
  readonly contesto = input<RiferimentoDocumento[]>([]);

  readonly apriCitazione = output<Citazione>();

  protected readonly html = computed(() => htmlRisposta(this.messaggio().testo));

  protected readonly referenziati = computed(() => {
    const perId = new Map(this.contesto().map((d) => [d.id, d]));
    return this.messaggio()
      .documentiReferenziati.map((id) => perId.get(id))
      .filter((d): d is RiferimentoDocumento => !!d);
  });

  /** Da chiuso l'accordion delle fonti deve già dire quanto e da dove. */
  protected readonly riepilogoFonti = computed(() => {
    const citazioni = this.messaggio().citazioni;
    const documenti = new Set(citazioni.map((c) => c.documentoId)).size;
    const passaggi = citazioni.length === 1 ? '1 passaggio' : `${citazioni.length} passaggi`;
    const fonti = documenti === 1 ? '1 documento' : `${documenti} documenti`;
    return `${passaggi} in ${fonti}`;
  });

  /** RF-C-10: la copia rapida resta sempre disponibile, accanto all'esportazione. */
  protected readonly copiato = signal(false);

  protected copia(): void {
    void navigator.clipboard.writeText(this.messaggio().testo).then(() => {
      this.copiato.set(true);
      setTimeout(() => this.copiato.set(false), 2000);
    });
  }

  protected readonly etichetteProvenienza: Record<string, string> = {
    regola: 'Regola',
    'documento-riferimento': 'Documento di riferimento',
    memoria: 'Ricordo',
  };

  /** Dove si governa ciascun segnale: il ricordo in Memoria, il resto nelle Istruzioni. */
  protected readonly percorsiProvenienza: Record<string, string> = {
    regola: '/impostazioni/istruzioni',
    'documento-riferimento': '/impostazioni/istruzioni',
    memoria: '/memoria',
  };
}
