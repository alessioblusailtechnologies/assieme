import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
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

/** Una voce del selettore, già pronta per la scelta e per la resa. */
export interface VoceSelettore {
  riferimento: RiferimentoDocumento;
  /** Riga secondaria: compagnia e prodotto, o tipologia ed etichette. */
  dettaglio: string;
  /** Edizione superata: referenziabile, ma va detto (RF-A-04). */
  storico: boolean;
}

/** Quanti risultati per archivio: due gruppi corti si scorrono, venti no. */
const RISULTATI_PER_ARCHIVIO = 6;

/**
 * Selettore `@` di referenziazione documentale (RF-C-02).
 *
 * Cerca su **entrambi gli archivi** per titolo, compagnia e prodotto, e
 * presenta i risultati in due gruppi. È un pannello senza campo di testo:
 * la digitazione resta dove sta — nel composer della chat, domani nel
 * costruttore di tabelle — e arriva qui come `query`. Stessa cosa per la
 * tastiera: il chiamante inoltra i tasti di navigazione a `gestisciTasto()`,
 * così il fuoco non lascia mai il campo in cui si sta scrivendo.
 *
 * Dei documenti privati si propongono **solo i pronti**: un documento in
 * elaborazione non è referenziabile (RF-B-05), e scoprirlo dopo l'invio è il
 * modo peggiore di apprenderlo.
 */
@Component({
  selector: 'ui-selettore-documenti',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './selettore-documenti.html',
  styleUrl: './selettore-documenti.scss',
})
export class SelettoreDocumenti {
  private readonly apiPubblici = inject(DocumentiApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);

  readonly query = input.required<string>();
  /** Documenti da non riproporre: già referenziati o già nel contesto. */
  readonly esclusi = input<Id[]>([]);

  readonly scelto = output<RiferimentoDocumento>();
  readonly chiuso = output<void>();

  /*
   * La ricerca parte poco dopo l'ultimo tasto, non a ogni tasto: lo stesso
   * ritmo dei filtri degli archivi. La prima interrogazione (query vuota,
   * all'apertura) passa subito perché il valore iniziale coincide.
   */
  private readonly queryAttesa = toSignal(
    toObservable(this.query).pipe(debounceTime(200), distinctUntilChanged()),
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
    const estrai = <T extends Documento>(elenco: Paginato<T> | undefined) =>
      (elenco?.elementi ?? []).filter((d) => !esclusi.has(d.id)).map((d) => voce(d));

    return [
      {
        etichetta: 'Archivio pubblico',
        voci: estrai(this.risorsaPubblici.hasValue() ? this.risorsaPubblici.value() : undefined),
      },
      {
        etichetta: 'Archivio privato',
        voci: estrai(this.risorsaPrivati.hasValue() ? this.risorsaPrivati.value() : undefined),
      },
    ].filter((g) => g.voci.length);
  });

  /** Le voci in un'unica sequenza, per la navigazione da tastiera. */
  protected readonly voci = computed(() => this.gruppi().flatMap((g) => g.voci));

  protected readonly indiceAttivo = signal(0);

  constructor() {
    /* Nuovi risultati, selezione da capo: l'elemento evidenziato deve sempre
       esistere ed essere il primo che l'occhio incontra. */
    effect(() => {
      this.voci();
      this.indiceAttivo.set(0);
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

  /**
   * Il chiamante inoltra qui i tasti mentre il selettore è aperto.
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

  protected scegli(voce: VoceSelettore): void {
    this.scelto.emit(voce.riferimento);
  }
}

function voce(d: Documento): VoceSelettore {
  if (d.archivio === 'pubblico') {
    return {
      riferimento: { id: d.id, titolo: d.titolo, archivio: 'pubblico' },
      dettaglio: `${d.compagnia.nome} — ${d.prodotto} · ${d.edizione.etichetta}`,
      storico: !d.edizione.corrente,
    };
  }
  const parti = [etichettaTipologiaBreve(d.tipologia)];
  if (d.riferimentoCliente) parti.push(d.riferimentoCliente);
  return {
    riferimento: { id: d.id, titolo: d.titolo, archivio: 'privato' },
    dettaglio: parti.join(' — '),
    storico: false,
  };
}
