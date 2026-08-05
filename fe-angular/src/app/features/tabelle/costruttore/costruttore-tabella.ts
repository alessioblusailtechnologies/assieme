import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { CriterioPredefinito, Id, RiferimentoDocumento } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import { TabelleApi } from '@core/api/tabelle-api';
import { componiColonne } from './colonne';

/**
 * Costruttore di una tabella di analisi (RF-C-11).
 *
 * Due scelte, nell'ordine in cui si ragiona: prima i documenti da
 * confrontare (le righe), poi i criteri da estrarre (le colonne) — che
 * dipendono dai primi, perché i set predefiniti sono per ramo e il server li
 * propone guardando i documenti scelti. Il titolo è facoltativo: se manca lo
 * ricava il server dai documenti.
 *
 * La ricerca riusa il selettore dei due archivi della chat: pannello
 * passivo, digitazione e tasti restano al campo.
 */
@Component({
  selector: 'app-costruttore-tabella',
  imports: [Bottone, Briciole, Campo, Checkbox, Icona, RouterLink, SelettoreDocumenti],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './costruttore-tabella.html',
  styleUrl: './costruttore-tabella.scss',
})
export class CostruttoreTabella {
  private readonly api = inject(TabelleApi);
  private readonly router = inject(Router);

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Tabelle di analisi', percorso: '/tabelle' },
    { etichetta: 'Nuova tabella' },
  ];

  // --- Documenti (le righe) -----------------------------------------------

  protected readonly documenti = signal<RiferimentoDocumento[]>([]);
  protected readonly idDocumenti = computed(() => this.documenti().map((d) => d.id));

  protected readonly ricerca = signal('');
  protected readonly pannelloAperto = signal(false);
  private readonly selettore = viewChild(SelettoreDocumenti);

  protected readonly idOpzioneAttiva = computed(() =>
    this.pannelloAperto() ? this.selettore()?.idOpzioneAttiva() : undefined,
  );

  protected aggiornaRicerca(evento: Event): void {
    this.ricerca.set((evento.target as HTMLInputElement).value);
    this.pannelloAperto.set(true);
  }

  /** I tasti di navigazione vanno al pannello; il fuoco resta al campo. */
  protected suTasto(evento: KeyboardEvent): void {
    const selettore = this.selettore();
    if (!this.pannelloAperto() || !selettore) return;
    if (selettore.gestisciTasto(evento)) evento.preventDefault();
  }

  protected aggiungiDocumento(documento: RiferimentoDocumento): void {
    this.documenti.update((d) =>
      d.some((x) => x.id === documento.id) ? d : [...d, documento],
    );
    /* Il pannello resta aperto e la ricerca si azzera: chi costruisce un
       confronto aggiunge quasi sempre più di un documento di fila. */
    this.ricerca.set('');
  }

  protected rimuoviDocumento(id: Id): void {
    this.documenti.update((d) => d.filter((x) => x.id !== id));
  }

  protected chiudiPannello(): void {
    this.pannelloAperto.set(false);
  }

  // --- Criteri (le colonne) -----------------------------------------------

  private readonly risorsaCriteri = httpResource<CriterioPredefinito[]>(() =>
    this.documenti().length ? this.api.urlCriteri(this.idDocumenti()) : undefined,
  );

  protected readonly criteri = computed(() =>
    this.risorsaCriteri.hasValue() ? this.risorsaCriteri.value() : [],
  );

  /**
   * Gli id spuntati. Un id può restare qui anche se il criterio è sparito
   * dalla proposta (togliendo un documento cambia il ramo): alla creazione
   * contano solo le intersezioni con la proposta corrente.
   */
  protected readonly criteriScelti = signal<ReadonlySet<Id>>(new Set());

  protected readonly criteriSelezionati = computed(() =>
    this.criteri().filter((c) => this.criteriScelti().has(c.id)),
  );

  protected alternaCriterio(id: Id, scelto: boolean): void {
    this.criteriScelti.update((attuali) => {
      const nuovi = new Set(attuali);
      if (scelto) nuovi.add(id);
      else nuovi.delete(id);
      return nuovi;
    });
  }

  protected readonly personalizzate = signal<string[]>([]);
  protected readonly bozzaPersonalizzata = signal('');

  protected aggiungiPersonalizzata(): void {
    const criterio = this.bozzaPersonalizzata().replace(/\s+/g, ' ').trim();
    if (!criterio) return;
    this.personalizzate.update((p) => (p.includes(criterio) ? p : [...p, criterio]));
    this.bozzaPersonalizzata.set('');
  }

  protected rimuoviPersonalizzata(criterio: string): void {
    this.personalizzate.update((p) => p.filter((c) => c !== criterio));
  }

  // --- Creazione ----------------------------------------------------------

  protected readonly titolo = signal('');
  protected readonly inCreazione = signal(false);

  protected readonly numeroColonne = computed(
    () => this.criteriSelezionati().length + this.personalizzate().length,
  );

  protected readonly pronta = computed(
    () => this.documenti().length >= 1 && this.numeroColonne() >= 1,
  );

  protected crea(): void {
    if (!this.pronta() || this.inCreazione()) return;
    this.inCreazione.set(true);

    this.api
      .crea({
        titolo: this.titolo().trim() || undefined,
        documentiIds: this.idDocumenti(),
        colonne: componiColonne(this.criteriSelezionati(), this.personalizzate()),
      })
      .subscribe({
        next: (tabella) => void this.router.navigate(['/tabelle', tabella.id]),
        /* Ad avvisare ha già pensato l'interceptor: qui si riabilita il
           pulsante, perché la bozza è tutta ancora in pagina. */
        error: () => this.inCreazione.set(false),
      });
  }
}
