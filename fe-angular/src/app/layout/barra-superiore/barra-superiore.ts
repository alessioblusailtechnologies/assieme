import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { Icona } from '@shared/ui/icona/icona';
import { SessioneStore } from '@core/auth/sessione-store';
import { TokenStore } from '@core/auth/token-store';

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
    <!-- Sotto i 768px la barra laterale è un cassetto: questo lo apre. -->
    <button
      type="button"
      class="menu"
      (click)="menu.emit()"
      [attr.aria-expanded]="menuAperto()"
      aria-controls="navigazione"
      [attr.aria-label]="menuAperto() ? 'Chiudi il menu' : 'Apri il menu'"
    >
      <ui-icon [name]="menuAperto() ? 'chiudi' : 'menu'" [size]="18" />
    </button>

    <div class="contesto">
      <!-- La voce del prodotto, sempre presente: è lei che parla in chat. -->
      <span class="saluto serif">Ciao, sono Velia.</span>

      @if (sessione.tenant(); as tenant) {
        <span class="separatore" aria-hidden="true"></span>
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

        <!--
          Ordine di lettura: chi sei (icona + nome), cosa puoi (ruolo).
          Il nome per esteso resta nel title e nell'etichetta accessibile.
        -->
        <span
          class="avatar"
          role="img"
          [title]="utente.nome + ' ' + utente.cognome"
          [attr.aria-label]="'Utente collegato: ' + utente.nome + ' ' + utente.cognome"
        >
          <ui-icon name="utente" [size]="15" />
        </span>

        <span class="identita">
          <span class="identita__nome">{{ nomeBreve() }}</span>
          <span class="identita__ruolo mono">{{ utente.ruolo }}</span>
        </span>

        <!-- Solo con una sessione autenticata vera: contro il mock e nella
             demo non ci sono token, e non c'è nulla da cui uscire. -->
        @if (autenticato()) {
          <button class="esci" type="button" title="Esci" (click)="esci()">
            <ui-icon name="esci" [size]="15" />
            <span class="visually-hidden">Esci</span>
          </button>
        }
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

    .menu {
      display: none;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-left: calc(var(--sp-2) * -1);
      flex: none;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--c-text-2);
      cursor: pointer;
    }

    .menu:hover,
    .menu:focus-visible {
      background: var(--c-page-alt);
      color: var(--c-text);
    }

    @media (max-width: 768px) {
      :host {
        gap: var(--sp-2);
        padding-inline: calc(var(--sp-3) + var(--safe-left)) calc(var(--sp-3) + var(--safe-right));
        padding-top: var(--safe-top);
        height: calc(var(--topbar-h) + var(--safe-top));
      }

      .menu {
        display: grid;
      }

    }

    /* La voce del prodotto e il ruolo: belli, ma sotto i 900px non ci
       stanno. Il nome del tenant resta, è l'informazione che RF-B-01 vuole
       sempre in vista. */
    @media (max-width: 900px) {
      .saluto,
      .saluto + .separatore,
      .identita__ruolo {
        display: none;
      }

      .contesto {
        flex: 1;
      }

      .contesto ui-icon {
        flex: none;
      }
    }

    @media (max-width: 600px) {
      .orologio,
      .orologio + .separatore,
      .identita {
        display: none;
      }
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

    .saluto {
      font-size: var(--t-body);
      color: var(--c-text);
      white-space: nowrap;
      flex: none;
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
      border-radius: var(--radius-pieno);
      background: var(--c-page-alt);
      color: var(--c-text-2);
      user-select: none;
    }

    .esci {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      flex: none;
      border: 0;
      border-radius: var(--radius-pieno);
      background: transparent;
      color: var(--c-text-3);
      cursor: pointer;
    }

    .esci:hover {
      background: var(--c-page-alt);
      color: var(--c-text);
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
  /** Sotto i 768px: lo stato del cassetto, per l'icona e l'aria-expanded. */
  readonly menuAperto = input(false);
  /** Il tocco sul menu: la shell apre o chiude il cassetto. */
  readonly menu = output<void>();

  protected readonly sessione = inject(SessioneStore);
  private readonly token = inject(TokenStore);
  private readonly router = inject(Router);

  protected readonly adesso = signal(new Date());

  protected readonly autenticato = computed(() => Boolean(this.token.tokenAccesso()));

  protected esci(): void {
    this.token.pulisci();
    this.sessione.ricarica();
    void this.router.navigate(['/accesso']);
  }

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
