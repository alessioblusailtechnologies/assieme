import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { httpResource } from '@angular/common/http';

import { Bottone } from '@shared/ui/bottone/bottone';
import { CartelleApi } from '@core/api/cartelle-api';
import { Convenzione } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';

/**
 * Come è organizzato l'Archivio Privato — osservato, non configurato.
 *
 * Questa pagina non è un modulo da compilare. Un'agenzia non arriva mai
 * senza documenti: arriva con la sua cartellazione, fatta in anni di lavoro,
 * e il sistema la guarda e la scrive. Qui la si legge e, se ha capito male,
 * la si corregge in una riga.
 *
 * La correzione umana vince sempre e non viene mai sovrascritta dal
 * ricalcolo; svuotarla restituisce la parola all'osservazione. È la stessa
 * regola che governa la classificazione (RF-B-03) e la descrizione delle
 * cartelle: il generato è una proposta finché un umano non lo tocca.
 */
@Component({
  selector: 'app-impostazioni-archivio',
  imports: [Bottone, DatePipe, FormsModule, Icona, Scheletro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="testa">
      <h2>Come è organizzato l'archivio</h2>
      <p class="spiega">
        Nessuno ha configurato questa struttura: è quella che avete, letta dalle vostre cartelle.
        VELIA la usa per decidere dove mettere i documenti che arrivano e per orientarsi quando
        cerca. Se ha capito male, correggila: la tua versione vince sempre.
      </p>
    </header>

    @if (risorsa.isLoading() && !convenzione()) {
      <ui-scheletro [numeroRighe]="6" />
    } @else if (convenzione(); as c) {
      <section class="riquadro">
        <div class="riquadro__testa">
          <span class="mono">Osservata</span>
          @if (c.calcolataIl) {
            <span class="quando mono">letta il {{ c.calcolataIl | date: 'dd/MM/yyyy HH:mm' }}</span>
          }
          @if (c.daRicalcolare) {
            <span class="quando mono">· da rileggere</span>
          }
        </div>
        <pre class="osservata">{{ c.testo || 'Non c’è ancora niente da osservare: l’archivio non ha cartelle.' }}</pre>
      </section>

      <section class="riquadro">
        <div class="riquadro__testa">
          <span class="mono">La tua versione</span>
          @if (c.testoUtente) {
            <span class="quando mono">· è questa che viene usata</span>
          }
        </div>
        @if (puoCorreggere()) {
          <textarea
            class="correzione"
            rows="6"
            [(ngModel)]="bozza"
            name="correzione"
            placeholder="Es. «I documenti stanno per cliente, poi per anno, poi per ramo. In Utils ci sono i moduli in bianco.»"
            aria-label="Correzione della convenzione"
          ></textarea>
          <div class="azioni">
            <button
              uiBottone
              variante="primario"
              type="button"
              [disabled]="!modificato() || salvataggio()"
              (click)="salva()"
            >
              <span>{{ salvataggio() ? 'Salvataggio…' : 'Salva' }}</span>
            </button>
            @if (c.testoUtente) {
              <button uiBottone variante="testo" type="button" (click)="ripristina()">
                <ui-icon name="riprova" [size]="14" />
                <span>Torna a quella osservata</span>
              </button>
            }
          </div>
        } @else {
          <p class="sola-lettura">
            {{ c.testoUtente || 'Nessuna correzione: vale quella osservata.' }}
          </p>
          <p class="spiega">La correzione è dell'amministratore.</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sp-5);
      max-width: 46rem;
    }

    .testa h2 {
      margin: 0 0 var(--sp-2);
      font-size: 1.125rem;
    }

    .spiega {
      margin: 0;
      color: var(--c-text-3);
      font-size: 0.875rem;
      line-height: 1.6;
    }

    .riquadro {
      display: flex;
      flex-direction: column;
      gap: var(--sp-3);
      padding: var(--sp-4);
      border: 1px solid var(--c-line);
      border-radius: var(--radius);
    }

    .riquadro__testa {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
    }

    .quando {
      color: var(--c-text-3);
      font-size: 0.75rem;
    }

    /* Il testo osservato si mostra com'è: è quello che legge il modello, e
       vederlo diverso da com'è servirebbe solo a fidarsi meno. */
    .osservata {
      margin: 0;
      overflow-x: auto;
      color: var(--c-text-2);
      font-family: var(--f-mono);
      font-size: 0.8125rem;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .correzione {
      width: 100%;
      padding: var(--sp-3);
      border: 1px solid var(--c-line);
      border-radius: var(--radius);
      background: var(--c-surface);
      color: var(--c-text);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.6;
      resize: vertical;
    }

    .azioni {
      display: flex;
      gap: var(--sp-2);
    }

    .sola-lettura {
      margin: 0;
      color: var(--c-text-2);
      font-size: 0.875rem;
      line-height: 1.6;
    }
  `,
})
export class ImpostazioniArchivio {
  private readonly api = inject(CartelleApi);
  private readonly sessione = inject(SessioneStore);

  protected readonly risorsa = httpResource<Convenzione>(() => this.api.urlConvenzione());
  protected readonly convenzione = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : undefined,
  );

  /* Come per il modello AI: la scelta è del tenant e la fa l'amministratore,
     ma leggerla non è un privilegio — sapere come lavora il sistema serve a
     tutti quelli che lo usano. */
  protected readonly puoCorreggere = computed(() =>
    this.sessione.puo('archivio-privato.organizza'),
  );

  protected readonly bozza = signal('');
  protected readonly salvataggio = signal(false);

  protected readonly modificato = computed(
    () => this.bozza().trim() !== (this.convenzione()?.testoUtente ?? ''),
  );

  constructor() {
    /* Copia di lavoro, non legatura diretta: chi sta scrivendo non deve
       vedersi sostituire il testo da una risposta arrivata nel frattempo.
       Si riempie una volta sola, alla prima lettura. */
    let riempita = false;
    effect(() => {
      const c = this.convenzione();
      if (!c || riempita) return;
      riempita = true;
      this.bozza.set(c.testoUtente ?? '');
    });
  }

  protected salva(): void {
    this.salvataggio.set(true);
    this.api.correggiConvenzione(this.bozza().trim() || null).subscribe({
      next: () => {
        this.salvataggio.set(false);
        this.risorsa.reload();
      },
      error: () => this.salvataggio.set(false),
    });
  }

  protected ripristina(): void {
    this.bozza.set('');
    this.salva();
  }
}
