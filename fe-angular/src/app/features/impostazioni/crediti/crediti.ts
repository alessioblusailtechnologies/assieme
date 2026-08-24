import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Icona } from '@shared/ui/icona/icona';
import { ImpostazioniApi } from '@core/api/impostazioni-api';
import { MovimentoCrediti, OperazioneCrediti, RiepilogoCrediti } from '@core/models';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';

/** Come si chiamano le operazioni nell'interfaccia. */
const OPERAZIONI: { chiave: OperazioneCrediti; etichetta: string }[] = [
  { chiave: 'risposta', etichetta: 'Risposte in chat' },
  { chiave: 'tabella', etichetta: 'Tabelle di analisi' },
  { chiave: 'agente', etichetta: 'Agenti' },
  { chiave: 'conversione', etichetta: 'Documenti convertiti' },
];

/**
 * I crediti dell'agenzia: quanto resta, come si consuma, cosa pesa ogni
 * operazione. È la pagina che rende leggibile il listino: il cliente vede
 * il saldo come vede il credito del telefono, e capisce perché una
 * risposta con Opus costa 10 e una con un modello open 2.
 *
 * Niente scrittura qui: i pacchetti li accredita il gestore (a mano, poi
 * con il pagamento online), gli addebiti li fa il sistema a fine lavoro.
 */
@Component({
  selector: 'app-crediti',
  imports: [Bottone, DatePipe, DecimalPipe, Icona, Scheletro, StatoVuoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crediti.html',
  styleUrl: './crediti.scss',
})
export class Crediti {
  private readonly api = inject(ImpostazioniApi);

  private readonly risorsa = httpResource<RiepilogoCrediti>(() => this.api.urlCrediti());

  protected readonly riepilogo = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : undefined));
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected readonly operazioni = OPERAZIONI;

  /** Quanto degli inclusi del mese è stato usato, in percentuale (per la barra). */
  protected readonly quotaInclusi = computed(() => {
    const s = this.riepilogo()?.saldo;
    if (!s || !s.inclusi) return 0;
    return Math.min(100, Math.round((s.inclusiUsati / s.inclusi) * 100));
  });

  /** Quanto resta dei pacchetti comprati. */
  protected readonly pacchettiResidui = computed(() => {
    const s = this.riepilogo()?.saldo;
    return s ? s.acquistati - s.acquistatiUsati : 0;
  });

  /** Sotto il 20% del totale si avvisa: una domanda in più non deve essere una sorpresa. */
  protected readonly inRiserva = computed(() => {
    const s = this.riepilogo()?.saldo;
    if (!s) return false;
    const totale = s.inclusi + (s.acquistati - s.acquistatiUsati);
    return totale > 0 && s.disponibili / totale < 0.2;
  });

  protected readonly esauriti = computed(() => (this.riepilogo()?.saldo.disponibili ?? 1) <= 0);

  protected readonly totaleMese = computed(() => {
    const m = this.riepilogo()?.meseCorrente;
    return m ? Object.values(m).reduce((a, b) => a + b, 0) : 0;
  });

  protected riprova(): void {
    this.risorsa.reload();
  }

  protected etichettaMovimento(m: MovimentoCrediti): string {
    if (m.tipo === 'pacchetto') return 'Pacchetto';
    if (m.tipo === 'rettifica') return 'Rettifica';
    return OPERAZIONI.find((o) => o.chiave === m.operazione)?.etichetta ?? 'Addebito';
  }
}
