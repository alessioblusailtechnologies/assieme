import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { ChatStore } from '../chat-store';
import { Icona } from '@shared/ui/icona/icona';
import { RiferimentoDocumento } from '@core/models';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import { menzioneAlCursore } from './menzione';

/** Oltre questa altezza il campo smette di crescere e scorre. */
const ALTEZZA_MASSIMA_PX = 168;

/**
 * Composizione del messaggio: testo, referenziazione `@`, invio.
 *
 * Il selettore si apre digitando `@` o col pulsante di allegato — che non è
 * una seconda modalità: inserisce una `@` nel testo, e da lì in poi i due
 * gesti sono lo stesso gesto (RF-C-02). Mentre il selettore è aperto la
 * tastiera naviga i risultati senza che il fuoco lasci il campo di testo; il
 * documento scelto diventa un chip sopra il campo, non un token dentro il
 * testo — il messaggio resta testo semplice, il contratto resta semplice.
 */
@Component({
  selector: 'app-composer',
  imports: [Icona, SelettoreDocumenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
})
export class Composer {
  protected readonly store = inject(ChatStore);

  /** Documenti da non riproporre nel selettore: già nel contesto. */
  readonly giaInContesto = input<string[]>([]);

  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');
  private readonly selettore = viewChild(SelettoreDocumenti);

  /*
   * La posizione del cursore è stato a tutti gli effetti: la menzione attiva
   * dipende da dove si sta scrivendo, non solo da cosa c'è scritto.
   */
  private readonly cursore = signal(0);

  /** Menzione chiusa con Esc: resta chiusa finché si resta su quella `@`. */
  private readonly soppressaDa = signal<number | undefined>(undefined);

  protected readonly menzione = computed(() => menzioneAlCursore(this.store.bozza(), this.cursore()));

  protected readonly selettoreAperto = computed(() => {
    const menzione = this.menzione();
    return !!menzione && menzione.inizio !== this.soppressaDa();
  });

  protected readonly esclusi = computed(() => [
    ...this.giaInContesto(),
    ...this.store.riferimentiBozza().map((r) => r.id),
  ]);

  protected readonly idOpzioneAttiva = computed(() =>
    this.selettoreAperto() ? this.selettore()?.idOpzioneAttiva() : undefined,
  );

  protected aggiorna(evento: Event): void {
    const area = evento.target as HTMLTextAreaElement;
    this.store.bozza.set(area.value);
    this.aggiornaCursore();
    this.ridimensiona(area);
  }

  protected aggiornaCursore(): void {
    this.cursore.set(this.area().nativeElement.selectionStart ?? 0);
    /* Uscire dalla menzione azzera la soppressione: la prossima `@` deve
       aprire il selettore anche se nasce nello stesso punto del testo. */
    if (!this.menzione()) this.soppressaDa.set(undefined);
  }

  protected suTasto(evento: KeyboardEvent): void {
    if (this.selettoreAperto()) {
      const consumato = this.selettore()?.gestisciTasto(evento);
      if (consumato) {
        evento.preventDefault();
        return;
      }
    }
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.invia();
    }
  }

  protected chiudiSelettore(): void {
    const menzione = this.menzione();
    if (menzione) this.soppressaDa.set(menzione.inizio);
  }

  /**
   * Documento scelto: via la `@query` dal testo, dentro il chip. Il fuoco
   * non si è mai mosso dal campo; il cursore torna dove stava la menzione.
   */
  protected referenzia(documento: RiferimentoDocumento): void {
    const menzione = this.menzione();
    if (menzione) {
      const testo = this.store.bozza();
      const dopo = testo.slice(this.cursore());
      this.store.bozza.set((testo.slice(0, menzione.inizio) + dopo).replace(/ {2,}/g, ' '));

      const area = this.area().nativeElement;
      /* Il modello è già nuovo ma il DOM non ancora: il cursore si posiziona
         al prossimo giro, quando il valore è stato riversato nel campo. */
      setTimeout(() => {
        area.setSelectionRange(menzione.inizio, menzione.inizio);
        this.aggiornaCursore();
        this.ridimensiona(area);
      });
    }
    this.store.aggiungiRiferimento(documento);
    this.area().nativeElement.focus();
  }

  /**
   * RF-C-02: un file allegato dal disco. Non entra negli archivi — vive con
   * la conversazione; appena caricato compare come riferimento del contesto.
   */
  protected allegaFile(evento: Event): void {
    const ingresso = evento.target as HTMLInputElement;
    this.store.allega([...(ingresso.files ?? [])]);
    /* Lo stesso file deve poter essere riallegato: l'input si azzera. */
    ingresso.value = '';
    this.area().nativeElement.focus();
  }

  /** Il pulsante di referenziazione è la stessa `@`, per chi non la conosce. */
  protected apriDaPulsante(): void {
    const area = this.area().nativeElement;
    const testo = this.store.bozza();
    const cursore = area.selectionStart ?? testo.length;
    const prefisso = testo.slice(0, cursore);
    const inserto = !prefisso || /[\s([{]$/.test(prefisso) ? '@' : ' @';

    this.store.bozza.set(prefisso + inserto + testo.slice(cursore));
    this.soppressaDa.set(undefined);
    area.focus();
    setTimeout(() => {
      area.setSelectionRange(cursore + inserto.length, cursore + inserto.length);
      this.aggiornaCursore();
    });
  }

  protected invia(): void {
    if (this.store.inRisposta() || !this.store.bozza().trim()) return;
    this.store.invia();
    const area = this.area().nativeElement;
    setTimeout(() => this.ridimensiona(area));
  }

  private ridimensiona(area: HTMLTextAreaElement): void {
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, ALTEZZA_MASSIMA_PX)}px`;
  }
}
