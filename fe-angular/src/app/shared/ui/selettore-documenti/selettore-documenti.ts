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
  Archivio,
  Documento,
  DocumentoPrivato,
  DocumentoPubblico,
  Id,
  Paginato,
  RiferimentoDocumento,
  SetDiRiferimento,
  SetInformativo,
} from '@core/models';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { Icona } from '@shared/ui/icona/icona';
import { etichettaTipologiaBreve } from '@shared/testi/etichette';
import { ParteEvidenziata, evidenziaTermini } from '@shared/ui/evidenziato/evidenzia';
import { TestoEvidenziato } from '@shared/ui/evidenziato/testo-evidenziato';

/** Una voce del selettore, già pronta per la scelta e per la resa. */
export interface VoceSelettore {
  /** Chiave della voce: l'id del documento, o quella del set informativo. */
  chiave: string;
  archivio: Archivio;
  /**
   * Che cosa entra nel contesto scegliendo questa voce: un documento, o
   * tutti quelli del set (12/09/2026). Il contesto resta fatto di documenti
   * anche quando si sceglie un prodotto.
   */
  riferimenti: RiferimentoDocumento[];
  /** Riga secondaria: compagnia e prodotto, o tipologia ed etichette. */
  dettaglio: string;
  /** Edizione superata: referenziabile, ma va detto (RF-A-04). */
  storico: boolean;
  /** Titolo e dettaglio già spezzati sui termini cercati, per la resa. */
  titoloEvidenziato: ParteEvidenziata[];
  dettaglioEvidenziato: ParteEvidenziata[];
}

/**
 * Se la ricerca nomina un'edizione: un anno («km servizi 2025»), una data
 * («04/2026») o la parola «ed.».
 *
 * A granularità di prodotto l'elenco mostra di norma la sola edizione in
 * vigore — un prodotto con tre edizioni si mangiava metà dei risultati —
 * ma chi lavora su una polizza vecchia deve poterla referenziare, e lo dice
 * scrivendo l'anno.
 */
export function cercaUnEdizione(query: string): boolean {
  return /(?:^|\D)(?:19|20)\d{2}(?:\D|$)|\b\d{1,2}\/\d{2,4}\b|\bed\b|\bed\./i.test(query);
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
 * fuoco appena si apre: da lì in poi si scrive qui. Nella chat la
 * conseguenza è che nel messaggio resta la sola `@` — il testo cercato non è
 * testo del messaggio, e finita la ricerca sparisce con lei. Chi ha aperto
 * il pannello e cambia idea preme Esc, o cancella all'indietro fino a
 * togliere anche la `@`.
 *
 * È lo stesso pannello ovunque — chat, costruttore di tabelle, agenti — e
 * la barra è sempre la sua: un chiamante con un campo proprio finiva per
 * mostrare qui una barra che sembrava un campo e non lo era. Il chiamante
 * non inoltra tasti: il campo se li gestisce, e avvisa quando ha finito
 * (`scelto`, `chiuso`). Dopo una scelta la ricerca si svuota da sé: chi
 * sceglie più documenti di fila riparte da zero, chi chiude non se ne
 * accorge.
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
   * Il seme della ricerca: ciò che stava dopo la `@` all'apertura — di
   * solito nulla, ma incollare «@bonus» deve trovare il campo pieno. Da lì
   * in poi comanda il campo interno.
   */
  readonly query = input<string>('');

  /**
   * Se perdere il fuoco chiude il pannello.
   *
   * Vero dove il pannello galleggia sopra la pagina (chat, costruttore,
   * editor): un clic altrove è un modo di chiuderlo. Falso dove è incassato
   * in un cassetto o in un modulo: lì fa parte della pagina, e sparire
   * perché si è cliccato una frase accanto sarebbe un difetto.
   */
  readonly chiusuraAlBlur = input(true);

  /** Documenti da non riproporre: già referenziati o già nel contesto. */
  readonly esclusi = input<Id[]>([]);

  /**
   * Che cosa si sceglie nell'Archivio Pubblico (12/09/2026).
   *
   * `documento`: una riga per documento, ed è ciò che serve dove la riga È
   * un documento — le righe di una tabella di analisi, i documenti di
   * riferimento di un agente.
   *
   * `prodotto`: una riga per set informativo, cioè il prodotto in una sua
   * edizione. In chat è l'unica granularità sensata: cercare «zurich auto»
   * restituiva DIP, DIP Aggiuntivo, Condizioni e Glossario dello stesso
   * prodotto, quattro righe che dicono la stessa cosa e che occupavano
   * tutto lo spazio dei risultati. Scegliendo il prodotto entrano nel
   * contesto tutti i documenti del set, che è come un intermediario ragiona.
   *
   * L'Archivio Privato resta per documento in entrambi i casi: lì un
   * documento è un documento, non l'edizione di un prodotto.
   */
  readonly granularita = input<'documento' | 'prodotto'>('documento');

  readonly scelto = output<RiferimentoDocumento>();
  /** Un set informativo scelto: i suoi documenti, tutti insieme. */
  readonly sceltiInsieme = output<RiferimentoDocumento[]>();
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

  /*
   * Due risorse per lo stesso archivio, una per granularità: quella non
   * usata resta ferma (URL indefinito = nessuna chiamata), invece di
   * interrogare l'archivio per risultati che nessuno mostrerà.
   */
  private readonly risorsaPubblici = httpResource<Paginato<DocumentoPubblico>>(() =>
    this.granularita() === 'prodotto'
      ? undefined
      : this.apiPubblici.urlElenco({
          q: this.queryAttesa() || undefined,
          perPagina: RISULTATI_PER_ARCHIVIO,
        }),
  );
  private readonly risorsaSet = httpResource<Paginato<SetInformativo>>(() => {
    if (this.granularita() !== 'prodotto') return undefined;
    const q = this.queryAttesa();
    return this.apiPubblici.urlSetInformativi({
      q: q || undefined,
      /* Senza un'edizione nella ricerca si mostra solo quella in vigore: le
         sorelle storiche ruberebbero il posto agli altri prodotti. */
      ...(!cercaUnEdizione(q) && { soloCorrenti: true }),
      perPagina: RISULTATI_PER_ARCHIVIO,
    });
  });
  private readonly risorsaPrivati = httpResource<Paginato<DocumentoPrivato>>(() =>
    this.apiPrivati.urlElenco({
      q: this.queryAttesa() || undefined,
      stato: 'pronto',
      perPagina: RISULTATI_PER_ARCHIVIO,
    }),
  );

  protected readonly inCaricamento = computed(
    () =>
      this.risorsaPubblici.isLoading() ||
      this.risorsaSet.isLoading() ||
      this.risorsaPrivati.isLoading(),
  );

  protected readonly gruppi = computed(() => {
    const esclusi = new Set(this.esclusi());
    /* L'evidenziazione va fatta con la query **con cui i risultati sono
       stati cercati**, non con quella già digitata: fra il tasto e la
       risposta passano duecento millisecondi, e nel mezzo si segnerebbero
       termini per cui l'elenco non è ancora stato filtrato. */
    const query = this.queryAttesa();
    const gruppo = <T>(
      etichetta: string,
      elenco: Paginato<T> | undefined,
      versoVoce: (elemento: T) => VoceSelettore,
    ) => ({
      etichetta,
      voci: (elenco?.elementi ?? [])
        .map(versoVoce)
        /* Un set sparisce solo quando è già dentro tutto: se ne manca un
           pezzo, sceglierlo di nuovo porta dentro quello che manca. */
        .filter((v) => v.riferimenti.some((r) => !esclusi.has(r.id))),
      /* Quanti ne ha in tutto l'archivio: senza, sei risultati su ottanta si
         leggono come «ce ne sono sei», e non si affina mai la ricerca. */
      totale: elenco?.totale ?? 0,
    });

    const pubblici =
      this.granularita() === 'prodotto'
        ? gruppo(
            'Archivio pubblico',
            this.risorsaSet.hasValue() ? this.risorsaSet.value() : undefined,
            (s) => voceSet(s, query),
          )
        : gruppo(
            'Archivio pubblico',
            this.risorsaPubblici.hasValue() ? this.risorsaPubblici.value() : undefined,
            (d) => voce(d, query),
          );

    return [
      pubblici,
      gruppo(
        'Archivio privato',
        this.risorsaPrivati.hasValue() ? this.risorsaPrivati.value() : undefined,
        (d) => voce(d, query),
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
    return voce ? idVoce(voce) : undefined;
  });

  /** L'id DOM di una voce, per `aria-activedescendant` e per lo scorrimento. */
  protected readonly idVoce = idVoce;

  protected scrivi(valore: string): void {
    this.ricerca.set(valore);
  }

  /** I tasti di navigazione della lista. Restituisce `true` se consumato. */
  private gestisciTasto(evento: KeyboardEvent): boolean {
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
        if (voce) this.consegna(voce);
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
    this.consegna(voce);
  }

  protected tieniIlFuoco(evento: MouseEvent): void {
    if (evento.target !== this.campo()?.nativeElement) evento.preventDefault();
  }

  protected suBlur(): void {
    if (this.chiusuraAlBlur()) this.chiuso.emit();
  }

  /* Scelto un documento, la ricerca riparte da zero: chi ne aggiunge un
     altro di fila non deve cancellare a mano, e chi chiude il pannello non
     se ne accorge. */
  private consegna(voce: VoceSelettore): void {
    const [primo, ...altri] = voce.riferimenti;
    if (!primo) return;
    if (altri.length) this.sceltiInsieme.emit(voce.riferimenti);
    else this.scelto.emit(primo);
    this.ricerca.set('');
  }
}

const evidenziato = (titolo: string, dettaglio: string, query: string) => ({
  titoloEvidenziato: evidenziaTermini(titolo, query),
  dettaglioEvidenziato: evidenziaTermini(dettaglio, query),
});

function voce(d: Documento, query: string): VoceSelettore {
  if (d.archivio === 'pubblico') {
    const dettaglio = `${d.compagnia.nome} - ${d.prodotto} · ${d.edizione.etichetta}`;
    return {
      chiave: d.id,
      archivio: 'pubblico',
      riferimenti: [{ id: d.id, titolo: d.titolo, archivio: 'pubblico' }],
      dettaglio,
      storico: !d.edizione.corrente,
      ...evidenziato(d.titolo, dettaglio, query),
    };
  }

  const parti = [etichettaTipologiaBreve(d.tipologia)];
  if (d.riferimentoCliente) parti.push(d.riferimentoCliente);
  const dettaglio = parti.join(' - ');
  return {
    chiave: d.id,
    archivio: 'privato',
    riferimenti: [{ id: d.id, titolo: d.titolo, archivio: 'privato' }],
    dettaglio,
    storico: false,
    ...evidenziato(d.titolo, dettaglio, query),
  };
}

/**
 * Un set informativo come voce: il titolo è il **prodotto**, e ciò che entra
 * nel contesto sono tutti i suoi documenti, ognuno col set addosso — è quel
 * che permette di mostrarli come un chip solo e di toglierli insieme.
 */
function voceSet(s: SetInformativo, query: string): VoceSelettore {
  const dettaglio = `${s.compagnia.nome} - ${s.ramo.nome} · ${s.edizione.etichetta}`;
  const set: SetDiRiferimento = {
    chiave: s.chiave,
    prodotto: s.prodotto,
    compagnia: s.compagnia.nome,
    edizione: s.edizione.etichetta,
    corrente: s.edizione.corrente,
  };
  return {
    chiave: s.chiave,
    archivio: 'pubblico',
    riferimenti: s.documenti.map((d) => ({
      id: d.id,
      titolo: d.titolo,
      archivio: 'pubblico' as const,
      set,
    })),
    dettaglio,
    storico: !s.edizione.corrente,
    ...evidenziato(s.prodotto, dettaglio, query),
  };
}

/**
 * L'id DOM della voce. La chiave di un set porta dentro il nome commerciale
 * del prodotto («Km&Servizi»): quello che va nell'attributo `id` è una sua
 * versione senza caratteri che romperebbero il selettore.
 */
function idVoce(voce: VoceSelettore): string {
  return `selettore-doc-${voce.chiave.replace(/[^\w-]+/g, '-')}`;
}
