import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { ButtonDirective } from 'primeng/button';

import { Icona } from '@shared/ui/icona/icona';

/**
 * Zona di caricamento: trascinamento più selezione da finestra.
 *
 * Sta in `shared/` e non nella funzionalità perché la Fase 5 la riusa per i
 * documenti di riferimento delle Istruzioni. Due implementazioni della stessa
 * macchina divergono sempre: una gestisce il trascinamento sull'intera
 * pagina, l'altra no; una accetta le cartelle, l'altra no. Meglio una sola.
 *
 * Non sa nulla di come i file vengono inviati: emette `scelti` e basta. Chi
 * la usa decide cosa farne.
 */
@Component({
  selector: 'ui-zona-caricamento',
  imports: [ButtonDirective, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      #campo
      type="file"
      multiple
      [accept]="formati()"
      (change)="daFinestra($event)"
      hidden
    />

    <div class="zona" [class.is-sopra]="trascinamentoSopra()">
      <ui-icon name="carica" [size]="22" />

      <p class="invito">
        Trascina qui i documenti
        <span class="oppure">oppure</span>
      </p>

      <button pButton type="button" severity="secondary" [outlined]="true" (click)="campo.click()">
        <span>Scegli dal computer</span>
      </button>

      <p class="mono limiti">{{ descrizioneLimiti() }}</p>
    </div>
  `,
  /*
   * Il trascinamento si ascolta sull'host e non sul riquadro interno: chi
   * lascia un file lo lascia dove capita, e una zona che si accende solo se
   * si colpisce il bersaglio esatto sembra rotta.
   *
   * `dragover` va annullato, altrimenti il browser apre il file al posto
   * nostro — ed è il difetto più comune di questa funzione.
   */
  host: {
    '(dragenter)': 'entra($event)',
    '(dragover)': 'entra($event)',
    '(dragleave)': 'esce($event)',
    '(drop)': 'lasciati($event)',
  },
  styles: `
    :host {
      display: block;
    }

    .zona {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-6);
      background: var(--c-surface);
      /* Tratteggio: dice "qui si può lasciare qualcosa" senza bisogno di
         scriverlo, ed è l'unica linea tratteggiata di tutta l'interfaccia. */
      border: 1px dashed var(--c-line);
      color: var(--c-text-3);
      transition:
        border-color var(--dur-fast) var(--ease-brand),
        background var(--dur-fast) var(--ease-brand);
    }

    .zona.is-sopra {
      border-color: var(--c-accent);
      border-style: solid;
      background: var(--c-accent-soft);
      color: var(--c-accent);
    }

    .invito {
      font-size: var(--t-body);
      color: var(--c-text-2);
    }

    .oppure {
      color: var(--c-text-3);
    }

    .limiti {
      margin-top: var(--sp-1);
    }
  `,
})
export class ZonaCaricamento {
  /** Estensioni ammesse, per il filtro della finestra di scelta. */
  readonly formati = input('.pdf,.docx,.doc,.png,.jpg,.jpeg');

  /** Misura massima del singolo file, per scriverla sotto al riquadro. */
  readonly limiteFileByte = input<number>();

  readonly scelti = output<File[]>();

  protected readonly trascinamentoSopra = signal(false);

  protected descrizioneLimiti(): string {
    const mb = this.limiteFileByte();
    const misura = mb ? ` · massimo ${Math.round(mb / 1024 / 1024)} MB per file` : '';
    return `PDF, DOCX, immagini${misura}`;
  }

  protected entra(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.trascinamentoSopra.set(true);
  }

  protected esce(e: DragEvent): void {
    e.preventDefault();
    /*
     * `relatedTarget` nullo significa che il puntatore è uscito davvero
     * dall'elemento; passando sopra un figlio arriva comunque un `dragleave`
     * e senza questo controllo il riquadro lampeggerebbe.
     */
    if (!e.relatedTarget) this.trascinamentoSopra.set(false);
  }

  protected lasciati(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.trascinamentoSopra.set(false);

    const file = Array.from(e.dataTransfer?.files ?? []);
    if (file.length) this.scelti.emit(file);
  }

  protected daFinestra(e: Event): void {
    const campo = e.target as HTMLInputElement;
    const file = Array.from(campo.files ?? []);
    if (file.length) this.scelti.emit(file);
    /* Azzerare il campo permette di ricaricare lo stesso file due volte di
       fila: senza, il secondo tentativo non emette nessun evento. */
    campo.value = '';
  }
}
