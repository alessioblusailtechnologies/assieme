import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { Icona } from '@shared/ui/icona/icona';
import { PosizioneDocumento } from '@core/models';
import { Scheletro } from '@shared/ui/scheletro/scheletro';

/*
 * pdf.js si carica alla prima resa, non all'importazione del componente: 400
 * KB che pesano solo su chi apre davvero un documento, e le schermate che
 * importano il visualizzatore senza mostrarlo non li pagano. Interpreta i
 * PDF in un worker, così il filo principale resta libero; worker e font di
 * base sono copiati fra gli asset dalla configurazione di build
 * (`angular.json`).
 */
let caricamentoPdfjs: Promise<typeof import('pdfjs-dist')> | undefined;

function pdfjs(): Promise<typeof import('pdfjs-dist')> {
  caricamentoPdfjs ??= import('pdfjs-dist').then(
    (modulo) => {
      modulo.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return modulo;
    },
    (errore: unknown) => {
      /* Una promessa rifiutata non va lasciata in cache: al prossimo
         tentativo — magari a rete tornata — si riprova da capo. */
      caricamentoPdfjs = undefined;
      throw errore;
    },
  );
  return caricamentoPdfjs;
}

/**
 * Visualizzatore PDF (RF-C-05).
 *
 * Nasce per le citazioni, e la differenza si vede: si apre **sulla pagina
 * citata**, con il passaggio evidenziato da un riquadro in coordinate
 * normalizzate — indipendenti dallo zoom e dalla risoluzione di resa.
 * Le schede degli archivi lo usano senza posizione, come semplice anteprima.
 *
 * Una pagina alla volta, non scorrimento continuo: chi arriva da una
 * citazione deve leggere *quel* passaggio, non orientarsi in un rotolo di
 * quaranta pagine — e la resa di una sola pagina resta leggera anche sui
 * portatili d'agenzia.
 */
@Component({
  selector: 'ui-visualizzatore-pdf',
  imports: [Icona, Scheletro],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visualizzatore-pdf.html',
  styleUrl: './visualizzatore-pdf.scss',
})
export class VisualizzatorePdf {
  private readonly http = inject(HttpClient);

  readonly fileUrl = input.required<string>();
  /** Dove aprirsi: pagina ed eventuale riquadro da evidenziare. */
  readonly posizione = input<PosizioneDocumento>();

  private readonly contenitore = viewChild.required<ElementRef<HTMLElement>>('contenitore');
  private readonly tela = viewChild<ElementRef<HTMLCanvasElement>>('tela');

  protected readonly documento = signal<PDFDocumentProxy | undefined>(undefined);
  protected readonly errore = signal(false);
  protected readonly numeroPagine = computed(() => this.documento()?.numPages ?? 0);

  /** Riparte dalla pagina citata ogni volta che cambia la citazione. */
  protected readonly paginaCorrente = linkedSignal(() => this.posizione()?.pagina ?? 1);

  /** Cambia al ridimensionamento del contenitore: la resa insegue la misura. */
  private readonly misura = signal(0);

  /** L'evidenza si mostra solo sulla pagina a cui appartiene. */
  protected readonly evidenzia = computed(() => {
    const posizione = this.posizione();
    return posizione?.evidenzia && this.paginaCorrente() === posizione.pagina
      ? posizione.evidenzia
      : undefined;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect((pulizia) => {
      const url = this.fileUrl();
      this.documento.set(undefined);
      this.errore.set(false);

      let superato = false;
      let compito: PDFDocumentLoadingTask | undefined;

      /* Il PDF si scarica con HttpClient, non col fetch interno di pdf.js:
         così attraversa gli interceptor come ogni altra chiamata — il
         Bearer dell'autenticazione (senza, il backend vero risponde 401) e
         il pannello di sviluppo. A pdf.js arrivano i byte, non l'URL. */
      const sottoscrizione = this.http.get(url, { responseType: 'arraybuffer' }).subscribe({
        next: (dati) => {
          if (superato) return;
          pdfjs()
            .then((modulo) => {
              if (superato) return;
              compito = modulo.getDocument({
                data: new Uint8Array(dati),
                standardFontDataUrl: '/pdfjs/standard-fonts/',
              });
              return compito.promise.then((doc) => {
                if (!superato) this.documento.set(doc);
              });
            })
            .catch(() => {
              if (!superato) this.errore.set(true);
            });
        },
        error: () => {
          if (!superato) this.errore.set(true);
        },
      });

      pulizia(() => {
        superato = true;
        sottoscrizione.unsubscribe();
        void compito?.destroy();
      });
    });

    afterRenderEffect(() => this.rendi());

    /* Assente in jsdom: nei test la resa non insegue il ridimensionamento,
       e va bene così — lì non c'è niente da ridimensionare. */
    if (typeof ResizeObserver !== 'undefined') {
      const osservatore = new ResizeObserver(() =>
        this.misura.set(this.contenitore().nativeElement.clientWidth),
      );
      afterRenderEffect(() => osservatore.observe(this.contenitore().nativeElement));
      destroyRef.onDestroy(() => osservatore.disconnect());
    }
  }

  /** Cresce a ogni resa avviata: una resa superata non tocca più la tela. */
  private generazioneResa = 0;

  /**
   * La resa in corso, da annullare prima di avviarne un'altra. Due rese
   * concorrenti sulla stessa tela disegnano entrambe, e la seconda eredita
   * la matrice di trasformazione della prima: la pagina compare due volte,
   * di cui una capovolta. Con `canvas: null` pdf.js non può più rilevare il
   * conflitto da sé — l'annullamento esplicito è nostro compito.
   */
  private resaInCorso: RenderTask | undefined;

  private rendi(): void {
    const doc = this.documento();
    const tela = this.tela()?.nativeElement;
    this.misura();
    const pagina = Math.min(Math.max(this.paginaCorrente(), 1), this.numeroPagine() || 1);
    if (!doc || !tela) return;

    const generazione = ++this.generazioneResa;

    void doc.getPage(pagina).then((pdfPagina) => {
      if (generazione !== this.generazioneResa) return;

      const larghezza = this.contenitore().nativeElement.clientWidth;
      if (!larghezza) return;

      /* La densità dello schermo entra NELLA scala del viewport, non in un
         transform a parte: pdf.js 6, quando riceve `canvasContext`, vuole
         `canvas: null` esplicito — altrimenti deriva la tela dal contesto e
         applica la propria gestione di scala sopra la nostra, e la pagina
         esce ribaltata e in miniatura. Un solo sistema di coordinate:
         viewport = pixel fisici della tela, il CSS la riporta a misura. */
      const dpr = window.devicePixelRatio || 1;
      const base = pdfPagina.getViewport({ scale: 1 });
      const viewport = pdfPagina.getViewport({ scale: (larghezza / base.width) * dpr });

      tela.width = Math.floor(viewport.width);
      tela.height = Math.floor(viewport.height);
      tela.style.width = `${Math.floor(viewport.width / dpr)}px`;
      tela.style.height = `${Math.floor(viewport.height / dpr)}px`;

      const contesto = tela.getContext('2d');
      if (!contesto) return;

      this.resaInCorso?.cancel();
      const resa = pdfPagina.render({ canvas: null, canvasContext: contesto, viewport });
      this.resaInCorso = resa;
      void resa.promise
        .catch(() => {
          /* Resa annullata da una più recente: non è un errore. */
        })
        .finally(() => {
          if (this.resaInCorso === resa) this.resaInCorso = undefined;
        });
    });
  }

  protected vai(differenza: number): void {
    const nuova = this.paginaCorrente() + differenza;
    if (nuova >= 1 && nuova <= this.numeroPagine()) this.paginaCorrente.set(nuova);
  }

  protected vaiA(valore: string): void {
    const pagina = Number(valore);
    if (Number.isInteger(pagina) && pagina >= 1 && pagina <= this.numeroPagine()) {
      this.paginaCorrente.set(pagina);
    }
  }
}
