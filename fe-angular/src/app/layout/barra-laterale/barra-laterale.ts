import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { GruppoNavigazione, NAVIGAZIONE } from '../navigazione';
import { Icona } from '@shared/ui/icona/icona';
import { SessioneStore } from '@core/auth/sessione-store';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';

/**
 * Barra laterale di navigazione.
 *
 * Comprimibile: su un confronto fra polizze la larghezza dello schermo è
 * spazio di lettura, e 232px recuperati si vedono. Da compressa restano le
 * sole icone, con il titolo nel `title` — è il motivo per cui il registro
 * delle icone usa nomi di dominio e non di disegno.
 *
 * La voce Chat è l'unica con un sotto-elenco: lo **storico delle
 * conversazioni** (RF-C-01) sta qui e non dentro la sezione, così è
 * raggiungibile da qualunque punto dell'applicazione e la conversazione
 * aperta tiene tutta la larghezza per sé. Rinomina ed eliminazione vivono
 * SOLO qui, al passaggio sulla voce: la testata della conversazione è
 * lettura, la lista è governo.
 */
@Component({
  selector: 'app-barra-laterale',
  imports: [Icona, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barra-laterale.html',
  styleUrl: './barra-laterale.scss',
  host: {
    '[class.is-compressa]': 'compressa()',
  },
})
export class BarraLaterale {
  private readonly sessione = inject(SessioneStore);
  private readonly router = inject(Router);
  protected readonly storico = inject(StoricoConversazioni);

  readonly compressa = model(false);

  /** Lo storico si ripiega senza uscire dalla chat: è una preferenza, non navigazione. */
  protected readonly conversazioniEspanse = signal(true);

  // --- Rinomina ed eliminazione dalla lista (RF-C-01) ----------------------

  /** L'id della voce in rinomina, se ce n'è una. */
  protected readonly inRinomina = signal<string | undefined>(undefined);
  protected readonly titoloBozza = signal('');

  /** Conferma a due passi: il primo clic arma il cestino, il secondo esegue. */
  protected readonly eliminazioneArmata = signal<string | undefined>(undefined);

  private readonly campoRinomina = viewChild<ElementRef<HTMLInputElement>>('campoRinomina');

  constructor() {
    /* Il campo di rinomina compare su richiesta: quando c'è, il fuoco è suo. */
    afterRenderEffect(() => {
      this.campoRinomina()?.nativeElement.focus();
    });
  }

  protected avviaRinomina(id: string, titolo: string): void {
    this.eliminazioneArmata.set(undefined);
    this.titoloBozza.set(titolo);
    this.inRinomina.set(id);
  }

  protected confermaRinomina(): void {
    const id = this.inRinomina();
    const titolo = this.titoloBozza().trim();
    if (id && titolo) this.storico.rinomina(id, titolo).subscribe();
    this.inRinomina.set(undefined);
  }

  protected elimina(id: string): void {
    if (this.eliminazioneArmata() !== id) {
      this.eliminazioneArmata.set(id);
      return;
    }
    this.eliminazioneArmata.set(undefined);
    this.storico.elimina(id).subscribe({
      next: () => {
        /* Se era la conversazione aperta, si torna alla schermata nuova. */
        if (this.router.url.startsWith(`/chat/${id}`)) void this.router.navigate(['/chat']);
      },
    });
  }

  protected disarma(): void {
    this.eliminazioneArmata.set(undefined);
  }

  /**
   * Le voci senza permesso sono per tutti; quelle con permesso compaiono
   * solo a chi ce l'ha. Filtriamo qui e non nel template perché un gruppo
   * rimasto senza voci non deve lasciare in pagina la propria intestazione.
   */
  readonly gruppi = computed<GruppoNavigazione[]>(() =>
    NAVIGAZIONE.map((g) => ({
      ...g,
      voci: g.voci.filter((v) => !v.permesso || this.sessione.puo(v.permesso)),
    })).filter((g) => g.voci.length > 0),
  );
}
