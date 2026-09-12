import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { Bottone } from '@shared/ui/bottone/bottone';
import { OperazioneArchivio, PropostaArchivio } from '@core/models';
import { ChatStore } from '../chat-store';

/**
 * Il riordino dell'Archivio Privato che l'assistente propone, sotto la
 * risposta che l'ha proposto.
 *
 * La scheda esiste perché il motore non può scrivere: legge l'archivio con
 * Read, Grep e Glob e nient'altro. Quando serve creare una cartella o
 * spostarci dentro un documento, lo **chiede**, e la scrittura parte dal clic
 * dell'utente, con le sue credenziali. Perciò la scheda dice per intero che
 * cosa succederebbe - ogni cartella, ogni documento, ogni destinazione -
 * prima che succeda: approvare alla cieca non sarebbe approvare.
 *
 * A decisione presa i pulsanti spariscono e resta il racconto: chi rilegge la
 * conversazione fra un mese deve capire che cosa è stato chiesto e che cosa
 * si è risposto.
 */
@Component({
  selector: 'app-proposta-riordino',
  imports: [Bottone, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './proposta-riordino.html',
  styleUrl: './proposta-riordino.scss',
  host: {
    '[class.is-decisa]': 'proposta().stato !== "proposta"',
  },
})
export class PropostaRiordino {
  readonly proposta = input.required<PropostaArchivio>();

  protected readonly store = inject(ChatStore);

  protected readonly daDecidere = computed(() => this.proposta().stato === 'proposta');
  protected readonly inCorso = computed(() => this.store.inDecisione(this.proposta().id));

  /** Il titolo dice subito a che punto è: una domanda aperta, o una cosa già fatta. */
  protected readonly titolo = computed(() => {
    switch (this.proposta().stato) {
      case 'applicata':
        return 'Modifica applicata';
      case 'annullata':
        return 'Modifica annullata';
      default:
        return 'Modifica proposta';
    }
  });

  /** Quante operazioni, per non doverle contare a occhio. */
  protected readonly riepilogo = computed(() => {
    const n = this.proposta().operazioni.length;
    return n === 1 ? '1 operazione' : `${n} operazioni`;
  });

  protected verbo(op: OperazioneArchivio): string {
    return op.azione === 'intesta-documento' ? 'Intesta' : 'Etichetta';
  }

  protected nome(op: OperazioneArchivio): string {
    return op.titolo;
  }

  /** Che cosa diventa: il cliente, oppure le etichette che cambiano. */
  protected dove(op: OperazioneArchivio): string {
    if (op.azione === 'intesta-documento') return op.cliente;
    return [
      op.aggiungi.length ? `+ ${op.aggiungi.join(', ')}` : '',
      op.togli.length ? `− ${op.togli.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('  ');
  }

  protected decidi(decisione: 'approva' | 'annulla'): void {
    this.store.decidiProposta(this.proposta(), decisione);
  }
}
