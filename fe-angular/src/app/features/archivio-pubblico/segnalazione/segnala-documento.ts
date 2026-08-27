import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { DocumentoPubblico, TipoSegnalazione } from '@core/models';
import { NotificheStore } from '@core/notifiche/notifiche-store';
import { SegnalazioniApi } from '@core/api/segnalazioni-api';
import { Select } from '@shared/ui/select/select';

/**
 * Segnalazione sull'Archivio Pubblico (RF-A-08).
 *
 * Un innesco discreto e un cassetto col modulo: il tipo di problema e due
 * righe di spiegazione. Nella scheda di un documento arriva col documento
 * già riferito (errore, edizione superata); nell'elenco viaggia senza
 * riferimento — è il canale per «manca un set informativo».
 *
 * Niente stati né cronologia lato utente: la segnalazione la legge il
 * gestore della piattaforma, e la conferma è una notifica, non una pagina.
 */
@Component({
  selector: 'app-segnala-documento',
  imports: [Bottone, Campo, Cassetto, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button uiBottone variante="testo" dimensione="piccolo" type="button" (click)="apri()">
      {{ documento() ? 'Segnala un problema' : 'Segnalacelo' }}
    </button>

    <ui-cassetto [(aperto)]="aperto" titolo="Segnala all'archivio" larghezza="min(480px, 94vw)">
      <form class="modulo" (submit)="invia($event)">
        @if (documento(); as doc) {
          <p class="riferimento">
            {{ doc.titolo }} - {{ doc.compagnia.nome }}, {{ doc.edizione.etichetta }}
          </p>
        }

        <!-- La tendina non è un controllo nativo: l'etichetta per gli
             screen reader viaggia in ariaLabel, il testo visibile è testo. -->
        <div class="voce">
          <span class="voce__nome" aria-hidden="true">Che cosa non torna?</span>
          <ui-select
            [(valore)]="tipo"
            [opzioni]="tipi"
            campoEtichetta="etichetta"
            campoValore="valore"
            ariaLabel="Che cosa non torna?"
          />
        </div>

        <label class="voce">
          <span class="voce__nome">Racconta in due righe</span>
          <textarea
            uiCampo
            rows="5"
            [value]="messaggio()"
            (input)="messaggio.set($any($event.target).value)"
            maxlength="2000"
            placeholder="Es.: la tabella dei massimali a pag. 12 è incompleta…"
          ></textarea>
        </label>

        <button
          uiBottone
          variante="primario"
          type="submit"
          [disabled]="!messaggio().trim() || inInvio()"
        >
          {{ inInvio() ? 'Invio…' : 'Invia la segnalazione' }}
        </button>
      </form>
    </ui-cassetto>
  `,
  styles: `
    .modulo {
      display: flex;
      flex-direction: column;
      gap: var(--sp-4);
    }

    .riferimento {
      padding: var(--sp-3);
      background: var(--c-page-alt);
      border-radius: var(--radius-sm);
      font-size: var(--t-sm);
      color: var(--c-text-3);
    }

    .voce {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

    .voce__nome {
      font-size: var(--t-sm);
      font-weight: 500;
    }

    textarea {
      resize: vertical;
    }
  `,
})
export class SegnalaDocumento {
  private readonly api = inject(SegnalazioniApi);
  private readonly notifiche = inject(NotificheStore);

  /** Assente nell'elenco: lì si segnala ciò che in archivio non c'è. */
  readonly documento = input<DocumentoPubblico>();

  protected readonly aperto = signal(false);
  protected readonly tipo = signal<TipoSegnalazione>('mancante');
  protected readonly messaggio = signal('');
  protected readonly inInvio = signal(false);

  protected readonly tipi = [
    { valore: 'mancante', etichetta: 'Manca un documento' },
    { valore: 'obsoleto', etichetta: 'È superato: esiste un’edizione più recente' },
    { valore: 'errato', etichetta: 'Contiene un errore' },
  ];

  protected apri(): void {
    this.tipo.set(this.documento() ? 'errato' : 'mancante');
    this.aperto.set(true);
  }

  protected invia(evento: Event): void {
    evento.preventDefault();
    const messaggio = this.messaggio().trim();
    if (!messaggio || this.inInvio()) return;

    this.inInvio.set(true);
    const documentoId = this.documento()?.id;
    this.api
      .invia({ tipo: this.tipo(), messaggio, ...(documentoId && { documentoId }) })
      .pipe(finalize(() => this.inInvio.set(false)))
      .subscribe({
        next: () => {
          this.aperto.set(false);
          this.messaggio.set('');
          this.notifiche.aggiungi({
            gravita: 'successo',
            titolo: 'Segnalazione inviata',
            dettaglio: 'Grazie: chi cura l’archivio la leggerà a breve.',
          });
        },
        // L'errore lo racconta l'interceptor, con la stessa voce di tutto
        // il resto dell'applicazione: qui non c'è nulla da aggiungere.
        error: () => undefined,
      });
  }
}
