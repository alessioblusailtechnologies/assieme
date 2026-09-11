import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import type { JSONContent } from '@tiptap/core';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { ErroreApi, Intestazione, IntestazioneSalvata } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { IntestazioneApi } from '@core/api/intestazione-api';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { scaricaBlob } from '@shared/esportazione/scarica-blob';
import { EditorIntestazione } from './editor-intestazione';
import { fasciaDaEditor, limiteSuperato } from './normalizza';

/** La stessa forma che esce dall'editor: così «modificata» confronta cose confrontabili. */
function normalizzata(intestazione: Intestazione): Intestazione {
  return {
    intestazione: fasciaDaEditor(intestazione.intestazione as JSONContent),
    piede: fasciaDaEditor(intestazione.piede as JSONContent),
  };
}

const uguali = (a: Intestazione, b: Intestazione): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Prima scheda di Impostazioni > Template di output (11/09/2026):
 * intestazione e piè di pagina dell'agenzia, su ogni documento che esce da
 * VELIA.
 *
 * L'anteprima si fa col contenuto che si sta scrivendo, non con quello
 * salvato: è il motore vero (`POST /api/intestazione/anteprima`) su un
 * documento d'esempio di tre pagine, per vedere i numeri di pagina girare.
 */
@Component({
  selector: 'app-scheda-intestazione',
  imports: [
    Bottone,
    Cassetto,
    DatePipe,
    EditorIntestazione,
    Icona,
    Scheletro,
    StatoVuoto,
    VisualizzatorePdf,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scheda-intestazione.html',
  styleUrl: './scheda-intestazione.scss',
})
export class SchedaIntestazione {
  private readonly api = inject(IntestazioneApi);
  private readonly sessione = inject(SessioneStore);

  private readonly risorsa = httpResource<IntestazioneSalvata>(() => this.api.url());

  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly erroreCaricamento = this.risorsa.error;
  protected readonly puoGestire = computed(() => this.sessione.puo('template.gestisci'));

  private readonly salvata = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : undefined,
  );
  protected readonly aggiornataIl = computed(() => this.salvata()?.aggiornataIl);

  /** Ciò che si dà all'editor: cambia al caricamento e ad «Annulla», non a ogni tasto. */
  protected readonly contenuto = signal<Intestazione | undefined>(undefined);
  /** Ciò che c'è nell'editor adesso. */
  private readonly bozza = signal<Intestazione | undefined>(undefined);

  protected readonly modificata = computed(() => {
    const bozza = this.bozza();
    const salvata = this.salvata();
    return !!bozza && !!salvata && !uguali(bozza, normalizzata(salvata));
  });

  /** Il primo tetto dello schema superato, detto a parole: col server che dice di no, meglio saperlo prima. */
  protected readonly limite = computed(() => {
    const bozza = this.bozza();
    if (!bozza) return undefined;
    const testa = limiteSuperato(bozza.intestazione);
    if (testa) return `Intestazione: ${testa}.`;
    const piede = limiteSuperato(bozza.piede);
    return piede ? `Piè di pagina: ${piede}.` : undefined;
  });

  protected readonly salvataggio = signal(false);
  protected readonly erroreSalvataggio = signal<string | undefined>(undefined);

  constructor() {
    /* Al caricamento, e dopo un salvataggio solo se il server ha cambiato qualcosa: rimettere lo stesso contenuto sposterebbe il cursore. */
    effect(() => {
      const salvata = this.salvata();
      if (!salvata) return;
      untracked(() => {
        const nuova = normalizzata(salvata);
        const bozza = this.bozza();
        if (bozza && uguali(bozza, nuova)) return;
        this.contenuto.set({ intestazione: salvata.intestazione, piede: salvata.piede });
        this.bozza.set(nuova);
      });
    });

    inject(DestroyRef).onDestroy(() => this.chiudiAnteprima());
  }

  protected cambiato(intestazione: Intestazione): void {
    this.bozza.set(intestazione);
    this.erroreSalvataggio.set(undefined);
  }

  protected riprova(): void {
    this.risorsa.reload();
  }

  protected salva(): void {
    const bozza = this.bozza();
    if (!bozza || this.salvataggio() || this.limite()) return;
    this.salvataggio.set(true);
    this.erroreSalvataggio.set(undefined);
    this.api.salva(bozza).subscribe({
      next: (salvata) => {
        this.salvataggio.set(false);
        this.risorsa.set(salvata);
      },
      error: (err: HttpErrorResponse) => {
        this.salvataggio.set(false);
        this.erroreSalvataggio.set(
          (err.error as ErroreApi | null)?.messaggio ?? 'Salvataggio non riuscito.',
        );
      },
    });
  }

  protected annulla(): void {
    const salvata = this.salvata();
    if (!salvata) return;
    /* Un oggetto nuovo, anche se uguale: l'editor ricarica solo quando il segnale cambia. */
    this.contenuto.set({ intestazione: salvata.intestazione, piede: salvata.piede });
    this.bozza.set(normalizzata(salvata));
    this.erroreSalvataggio.set(undefined);
  }

  // --- Anteprima --------------------------------------------------------------

  protected readonly urlAnteprima = signal<string | undefined>(undefined);
  protected readonly anteprimaInCorso = signal<'pdf' | 'docx' | undefined>(undefined);
  protected readonly erroreAnteprima = signal<string | undefined>(undefined);

  protected anteprima(formato: 'pdf' | 'docx'): void {
    const bozza = this.bozza();
    if (!bozza || this.anteprimaInCorso() || this.limite()) return;
    this.anteprimaInCorso.set(formato);
    this.erroreAnteprima.set(undefined);
    this.api.anteprima(bozza, formato).subscribe({
      next: (blob) => {
        this.anteprimaInCorso.set(undefined);
        if (formato === 'docx') {
          scaricaBlob(blob, 'Anteprima intestazione.docx');
          return;
        }
        this.chiudiAnteprima();
        this.urlAnteprima.set(URL.createObjectURL(blob));
      },
      error: () => {
        this.anteprimaInCorso.set(undefined);
        this.erroreAnteprima.set('Anteprima non riuscita. Riprova fra poco.');
      },
    });
  }

  protected chiudiAnteprima(): void {
    const url = this.urlAnteprima();
    if (url) URL.revokeObjectURL(url);
    this.urlAnteprima.set(undefined);
  }
}
