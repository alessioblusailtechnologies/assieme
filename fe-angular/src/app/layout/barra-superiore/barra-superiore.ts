import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { Icona } from '@shared/ui/icona/icona';
import { SessioneStore } from '@core/auth/sessione-store';

/**
 * Barra superiore: contesto a sinistra, data e identità a destra.
 *
 * Il nome del tenant è sempre in vista di proposito. RF-B-01 fonda il
 * prodotto sull'isolamento fra agenzie, e in una sessione condivisa o in
 * demo la domanda "di chi sono questi documenti?" deve avere risposta a
 * colpo d'occhio, non dopo un clic.
 */
@Component({
  selector: 'app-barra-superiore',
  imports: [DatePipe, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contesto">
      @if (sessione.tenant(); as tenant) {
        <ui-icon name="compagnia" [size]="16" />
        <span class="contesto__nome">{{ tenant.nome }}</span>
      } @else if (sessione.inCaricamento()) {
        <span class="scheletro" aria-hidden="true"></span>
        <span class="visually-hidden">Caricamento della sessione in corso</span>
      }
    </div>

    <div class="lato">
      <time class="mono orologio" [attr.datetime]="adesso().toISOString()">
        {{ adesso() | date: 'dd/MM/yyyy HH:mm' }}
      </time>

      @if (sessione.utente(); as utente) {
        <span class="separatore" aria-hidden="true"></span>

        <span class="identita">
          <span class="identita__nome">{{ nomeBreve() }}</span>
          <span class="identita__ruolo mono">{{ utente.ruolo }}</span>
        </span>

        <!--
          L'avatar porta le iniziali e non un'immagine: non c'è una foto da
          mostrare, e due lettere si riconoscono a colpo d'occhio meglio di
          una sagoma generica uguale per tutti. Il nome per esteso resta nel
          title e nell'etichetta accessibile.
        -->
        <span
          class="avatar"
          role="img"
          [title]="utente.nome + ' ' + utente.cognome"
          [attr.aria-label]="'Utente collegato: ' + utente.nome + ' ' + utente.cognome"
        >
          {{ sessione.iniziali() }}
        </span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-4);
      height: var(--topbar-h);
      flex: none;
      padding: 0 var(--sp-4);
      background: var(--c-surface);
      border-bottom: 1px solid var(--c-line);
    }

    .contesto {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      min-width: 0;
      color: var(--c-text-2);
    }

    .contesto__nome {
      font-size: var(--t-body);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .lato {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
      flex: none;
    }

    /*
     * Cifre a larghezza fissa: senza, l'orologio si allarga e si stringe al
     * cambio di minuto e trascina con sé tutto ciò che ha accanto.
     */
    .orologio {
      color: var(--c-text-3);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .separatore {
      width: 1px;
      height: 18px;
      background: var(--c-line);
    }

    .identita {
      display: flex;
      align-items: baseline;
      gap: var(--sp-2);
      white-space: nowrap;
    }

    .identita__nome {
      font-size: var(--t-sm);
      color: var(--c-text);
    }

    .identita__ruolo {
      color: var(--c-text-3);
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: none;
      background: var(--c-accent-soft);
      color: var(--c-accent);
      font-size: var(--t-xs);
      /* Le iniziali sono due maiuscole senza discendenti: interlinea a 1 le
         tiene centrate nel quadrato senza correzioni. */
      line-height: 1;
      letter-spacing: 0.02em;
      user-select: none;
    }

    /* Scheletro invece di spinner: occupa lo spazio che occuperà il
       contenuto, così la barra non sussulta quando la sessione arriva. */
    .scheletro {
      display: block;
      width: 160px;
      height: 12px;
      background: var(--c-page-alt);
    }
  `,
})
export class BarraSuperiore {
  protected readonly sessione = inject(SessioneStore);

  protected readonly adesso = signal(new Date());

  /** Forma `m.ferrero`: la stessa con cui l'utente si riconosce nella posta. */
  protected readonly nomeBreve = computed(() => {
    const u = this.sessione.utente();
    return u ? `${u.nome.charAt(0)}.${u.cognome}`.toLowerCase() : '';
  });

  constructor() {
    /*
     * Il segnale si aggiorna solo al cambio di minuto.
     *
     * L'orologio non mostra i secondi: scriverlo ogni secondo farebbe
     * ridisegnare la barra sessanta volte al minuto senza che un pixel
     * cambi. Il controllo al secondo serve solo a cogliere il passaggio
     * appena avviene, invece di aspettare fino a un minuto.
     */
    const battito = setInterval(() => {
      const ora = new Date();
      if (ora.getMinutes() !== this.adesso().getMinutes()) {
        this.adesso.set(ora);
      }
    }, 1000);

    inject(DestroyRef).onDestroy(() => clearInterval(battito));
  }
}
