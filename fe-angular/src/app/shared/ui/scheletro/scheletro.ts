import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Scheletro di caricamento.
 *
 * Occupa lo spazio che occuperà il contenuto, invece di uno spinner al
 * centro dello schermo. Due motivi, entrambi pratici: la pagina non sussulta
 * quando i dati arrivano, e chi guarda capisce già la forma di ciò che sta
 * per leggere.
 *
 * Non usiamo `p-skeleton` di PrimeNG perché qui serve una sola cosa
 * — un rettangolo della giusta misura — e un componente nostro costa meno
 * del negoziare i suoi token con quelli del design.
 */
@Component({
  selector: 'ui-scheletro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (riga of righe(); track $index) {
      <span class="barra" [style.width]="larghezza($index)"></span>
    }
  `,
  host: {
    'aria-hidden': 'true',
  },
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
      width: 100%;
    }

    .barra {
      display: block;
      height: var(--altezza, 12px);
      background: var(--c-page-alt);
      /* Pulsazione lenta e appena percettibile: il caricamento deve
         segnalare "sto lavorando", non attirare lo sguardo. */
      animation: respiro 1.6s var(--ease-brand) infinite;
    }

    @keyframes respiro {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.45;
      }
    }
  `,
})
export class Scheletro {
  readonly numeroRighe = input(3);

  /**
   * Larghezze diverse riga per riga: un blocco di barre tutte uguali legge
   * come una tabella, non come testo in arrivo.
   */
  private readonly proporzioni = ['100%', '82%', '91%', '74%', '96%'];

  protected righe = () => Array.from({ length: this.numeroRighe() });
  protected larghezza = (i: number) => this.proporzioni[i % this.proporzioni.length];
}
