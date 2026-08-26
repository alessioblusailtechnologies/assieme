import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import {
  Documento,
  DocumentoPrivato,
  DocumentoPubblico,
  Id,
  Paginato,
  RiferimentoDocumento,
} from '@core/models';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { Icona } from '@shared/ui/icona/icona';
import { etichettaTipologiaBreve } from '@shared/testi/etichette';
import { ParteEvidenziata, evidenziaTermini } from '@shared/ui/evidenziato/evidenzia';
import { TestoEvidenziato } from '@shared/ui/evidenziato/testo-evidenziato';

/** Una voce del selettore, già pronta per la scelta e per la resa. */
export interface VoceSelettore {
  riferimento: RiferimentoDocumento;
  /** Riga secondaria: compagnia e prodotto, o tipologia ed etichette. */
  dettaglio: string;
  /** Edizione superata: referenziabile, ma va detto (RF-A-04). */
  storico: boolean;
  /** Titolo e dettaglio già spezzati sui termini cercati, per la resa. */
  titoloEvidenziato: ParteEvidenziata[];
  dettaglioEvidenziato: ParteEvidenziata[];
}

/** Quanto è alta l'etichetta appiccicata di un gruppo, in pixel. */
const ALTEZZA_ETICHETTA_GRUPPO = 26;

/** Quanto lasciare fra il pannello e il bordo alto della finestra. */
const RESPIRO_IN_ALTO = 64;
const ALTEZZA_MASSIMA = 420;
/** Sotto questa non si scende: meglio traboccare che mostrare due righe. */
const ALTEZZA_MINIMA = 220;

/** Quanti risultati per archivio: due gruppi corti si scorrono, venti no. */
const RISULTATI_PER_ARCHIVIO = 6;

/**
 * Selettore `@` di referenziazione documentale (RF-C-02).
 *
 * Cerca su **entrambi gli archivi** per titolo, compagnia e prodotto, e
 * presenta i risultati in due gruppi.
 *
 * In cima c'è una **barra di ricerca vera**, e il pannello se ne prende il
 * fuoco appena si apre: da lì in poi si scrive qui. La conseguenza è che nel
 * messaggio resta la sola `@` — il testo cercato non è testo del messaggio,
 * e finita la ricerca sparisce con lei. Chi ha aperto il pannello e cambia
 * idea preme Esc, o cancella all'indietro fino a togliere anche la `@`.
 *
 * Il chiamante non inoltra più tasti: il campo se li gestisce, e restituisce
 * il fuoco al composer quando ha finito (`scelto`, `chiuso`, `annullato`).
 *
 * Dei documenti privati si propongono **solo i pronti**: un documento in
 * elaborazione non è referenziabile (RF-B-05), e scoprirlo dopo l'invio è il
 * modo peggiore di apprenderlo.
 */
@Component({
  selector: 'ui-selettore-documenti',
  imports: [Icona, TestoEvidenziato],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selettore-documenti.html',
  styleUrl: './selettore-documenti.scss',
})
export class SelettoreDocumenti {
  private readonly apiPubblici = inject(DocumentiApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);

  /**
   * Che cosa cercare.
   *
   * Con `conRicerca` spento è **la** query, e la scrive il chiamante dal
   * proprio campo. Acceso è il seme: ciò che stava dopo la `@` all'apertura
   * — di solito nulla, ma incollare «@bonus» deve trovare il campo pieno —
   * e da lì in poi comanda il campo interno.
   */
  readonly query = input<string>('');

  /**
   * Se il pannello si porta dentro la propria barra di ricerca.
   *
   * Nella chat sì: si arriva qui da una `@` dentro un messaggio, e non c'è
   * nessun campo a cui appoggiarsi. Nel costruttore di tabelle e
   * nell'editor degli agenti no: lì il pannello è la tendina di un campo
   * che c'è già, ed è quello a comandare.
   */
  readonly conRicerca = input(false);

  /** Documenti da non riproporre: già referenziati o già nel contesto. */
  readonly esclusi = input<Id[]>([]);

  readonly scelto = output<RiferimentoDocumento>();
  readonly chiuso = output<void>();

  /** Ciò che si sta cercando: segue l'ingresso, e il campo interno lo riscrive. */
  protected readonly ricerca = linkedSignal(() => this.query());

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  /*
   * La ricerca parte poco dopo l'ultimo tasto, non a ogni tasto: lo stesso
   * ritmo dei filtri degli archivi. La prima interrogazione (query vuota,
   * all'apertura) passa subito perché il valore iniziale coincide.
   */
  private readonly queryAttesa = toSignal(
    toObservable(this.ricerca).pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: '' },
  );

  private readonly risorsaPubblici = httpResource<Paginato<DocumentoPubblico>>(() =>
    this.apiPubblici.urlElenco({ q: this.queryAttesa() || undefined, perPagina: RISULTATI_PER_ARCHIVIO }),
  );
  private readonly risorsaPrivati = httpResource<Paginato<DocumentoPrivato>>(() =>
    this.apiPrivati.urlElenco({
      q: this.queryAttesa() || undefined,
      stato: 'pronto',
      perPagina: RISULTATI_PER_ARCHIVIO,
    }),
  );

  protected readonly inCaricamento = computed(
    () => this.risorsaPubblici.isLoading() || this.risorsaPrivati.isLoading(),
  );

  protected readonly gruppi = computed(() => {
    const esclusi = new Set(this.esclusi());
    /* L'evidenziazione va fatta con la query **con cui i risultati sono
       stati cercati**, non con quella già digitata: fra il tasto e la
       risposta passano duecento millisecondi, e nel mezzo si segnerebbero
       termini per cui l'elenco non è ancora stato filtrato. */
    const query = this.queryAttesa();
    const gruppo = <T extends Documento>(etichetta: string, elenco: Paginato<T> | undefined) => ({
      etichetta,
      voci: (elenco?.elementi ?? []).filter((d) => !esclusi.has(d.id)).map((d) => voce(d, query)),
      /* Quanti ne ha in tutto l'archivio: senza, sei risultati su ottanta si
         leggono come «ce ne sono sei», e non si affina mai la ricerca. */
      totale: elenco?.totale ?? 0,
    });

    return [
      gruppo(
        'Archivio pubblico',
        this.risorsaPubblici.hasValue() ? this.risorsaPubblici.value() : undefined,
      ),
      gruppo(
        'Archivio privato',
        this.risorsaPrivati.hasValue() ? this.risorsaPrivati.value() : undefined,
      ),
    ].filter((g) => g.voci.length);
  });

  /** Le voci in un'unica sequenza, per la navigazione da tastiera. */
  protected readonly voci = computed(() => this.gruppi().flatMap((g) => g.voci));

  protected readonly indiceAttivo = signal(0);

  /** Vero se almeno un archivio ne ha più di quanti se ne mostrano. */
  protected readonly cePiuRoba = computed(() => this.gruppi().some((g) => g.totale > g.voci.length));

  private readonly areaRisultati = viewChild<ElementRef<HTMLElement>>('risultati');
  private readonly pannello = viewChild<ElementRef<HTMLElement>>('pannello');
  private readonly ospite = inject(ElementRef<HTMLElement>);

  constructor() {
    /* Il pannello nasce col fuoco dentro: da qui in poi si scrive qui, non
       più nel composer. */
    afterNextRender(() => this.campo()?.nativeElement.focus());
    /* Il campo esiste solo con `conRicerca`: dove il pannello è la tendina
       di un campo altrui, il fuoco deve restare dov'è. */


    /* Nuovi risultati, selezione da capo: l'elemento evidenziato deve sempre
       esistere ed essere il primo che l'occhio incontra. */
    effect(() => {
      this.voci();
      this.indiceAttivo.set(0);
    });

    /*
     * Le frecce si portano dietro lo scorrimento.
     *
     * Con due archivi pieni le voci non ci stanno nel pannello, e senza
     * questo si naviga alla cieca: l'evidenziata esce dall'area e ci resta,
     * mentre Invio referenzia un documento che non si sta vedendo.
     *
     * Si sposta `scrollTop` a mano invece di usare `scrollIntoView`: quello
     * muove l'antenato scorrevole più vicino, e il pannello galleggia sopra
     * il filo della chat — che finirebbe per scorrere anche lui.
     */
    /*
     * Il pannello si apre verso l'alto, e non sa quanto spazio ha sopra: nella
     * schermata iniziale il composer sta a metà pagina, e con l'altezza fissa
     * la barra di ricerca finiva tagliata fuori dallo schermo — cioè proprio
     * la parte che deve spiegare come si cerca.
     *
     * Il bordo **basso** dell'ospite è fermo (è ancorato al composer con
     * `bottom`, e cresce verso l'alto): la distanza da lì al bordo della
     * finestra è lo spazio disponibile, e non dipende dall'altezza che si sta
     * per calcolare.
     */
    afterRenderEffect(() => {
      this.voci();
      const pannello = this.pannello()?.nativeElement;
      if (!pannello) return;
      const spazio = this.ospite.nativeElement.getBoundingClientRect().bottom - RESPIRO_IN_ALTO;
      const altezza = Math.max(ALTEZZA_MINIMA, Math.min(ALTEZZA_MASSIMA, spazio));
      pannello.style.maxHeight = `${Math.round(altezza)}px`;
    });

    afterRenderEffect(() => {
      const id = this.idOpzioneAttiva();
      const area = this.areaRisultati()?.nativeElement;
      if (!id || !area) return;
      const voce = area.querySelector<HTMLElement>(`[id="${id}"]`);
      if (!voce) return;

      /* Sulla prima voce si torna in cima davvero, etichetta del gruppo
         compresa: fermarsi qualche pixel sotto lascerebbe l'elenco che
         sembra già scorso quando invece è all'inizio. */
      if (this.indiceAttivo() === 0) {
        area.scrollTop = 0;
        return;
      }

      const rArea = area.getBoundingClientRect();
      const rVoce = voce.getBoundingClientRect();
      /* Salendo si lascia il posto all'etichetta del gruppo, che resta
         appiccicata in cima e coprirebbe la voce appena raggiunta. */
      if (rVoce.top < rArea.top + ALTEZZA_ETICHETTA_GRUPPO) {
        area.scrollTop -= rArea.top + ALTEZZA_ETICHETTA_GRUPPO - rVoce.top;
      } else if (rVoce.bottom > rArea.bottom) {
        area.scrollTop += rVoce.bottom - rArea.bottom;
      }
    });
  }

  /**
   * Id dell'opzione evidenziata, per `aria-activedescendant` sul campo del
   * chiamante: chi usa un lettore di schermo sente scorrere le opzioni senza
   * che il fuoco lasci il campo di testo.
   */
  readonly idOpzioneAttiva = computed(() => {
    const voce = this.voci()[this.indiceAttivo()];
    return voce ? `selettore-doc-${voce.riferimento.id}` : undefined;
  });

  protected scrivi(valore: string): void {
    this.ricerca.set(valore);
  }

  /**
   * Il chiamante che ha un campo suo inoltra qui i tasti di navigazione.
   * Restituisce `true` se il tasto è stato consumato.
   */
  gestisciTasto(evento: KeyboardEvent): boolean {
    const voci = this.voci();
    switch (evento.key) {
      case 'ArrowDown':
        if (!voci.length) return true;
        this.indiceAttivo.update((i) => (i + 1) % voci.length);
        return true;
      case 'ArrowUp':
        if (!voci.length) return true;
        this.indiceAttivo.update((i) => (i - 1 + voci.length) % voci.length);
        return true;
      case 'Enter':
      case 'Tab': {
        const voce = voci[this.indiceAttivo()];
        if (voce) this.scelto.emit(voce.riferimento);
        return true;
      }
      case 'Escape':
        this.chiuso.emit();
        return true;
      default:
        return false;
    }
  }

  /** I tasti del campo interno: gli stessi, più il disfare all'indietro. */
  protected suTastoCampo(evento: KeyboardEvent): void {
    /* Campo già vuoto e si cancella ancora: si sta disfacendo il gesto, ed è
       la stessa cosa che chiuderlo con Esc. */
    if (evento.key === 'Backspace' && !this.ricerca()) {
      evento.preventDefault();
      this.chiuso.emit();
      return;
    }
    if (this.gestisciTasto(evento)) evento.preventDefault();
  }

  protected scegli(voce: VoceSelettore): void {
    this.scelto.emit(voce.riferimento);
  }
}

function voce(d: Documento, query: string): VoceSelettore {
  const evidenziato = (titolo: string, dettaglio: string) => ({
    titoloEvidenziato: evidenziaTermini(titolo, query),
    dettaglioEvidenziato: evidenziaTermini(dettaglio, query),
  });

  if (d.archivio === 'pubblico') {
    const dettaglio = `${d.compagnia.nome} — ${d.prodotto} · ${d.edizione.etichetta}`;
    return {
      riferimento: { id: d.id, titolo: d.titolo, archivio: 'pubblico' },
      dettaglio,
      storico: !d.edizione.corrente,
      ...evidenziato(d.titolo, dettaglio),
    };
  }

  const parti = [etichettaTipologiaBreve(d.tipologia)];
  if (d.riferimentoCliente) parti.push(d.riferimentoCliente);
  const dettaglio = parti.join(' — ');
  return {
    riferimento: { id: d.id, titolo: d.titolo, archivio: 'privato' },
    dettaglio,
    storico: false,
    ...evidenziato(d.titolo, dettaglio),
  };
}
