import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { CellaValore } from './celle/cella-valore';
import { Citazione, CriterioPredefinito, Id, RiferimentoDocumento } from '@core/models';
import { DettaglioTabellaStore } from './dettaglio-tabella-store';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { Icona } from '@shared/ui/icona/icona';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';
import { TabelleApi } from '@core/api/tabelle-api';
import { Tag } from '@shared/ui/tag/tag';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { intestazioneDaCriterio } from '../costruttore/colonne';

/**
 * Una tabella di analisi (RF-C-12…C-15).
 *
 * La griglia è già in pagina mentre la generazione corre: le celle in attesa
 * pulsano e si riempiono una alla volta, con l'avanzamento dichiarato in
 * testata. Da ogni cella si apre il documento sul passaggio citato, nello
 * stesso cassetto della chat (RF-C-05).
 *
 * Una tabella condivisa da un collega si apre in **sola lettura**: le azioni
 * di modifica non compaiono, e al loro posto c'è «Duplica» (RF-C-15).
 */
@Component({
  selector: 'app-dettaglio-tabella',
  providers: [DettaglioTabellaStore],
  imports: [
    Bottone,
    Briciole,
    Campo,
    Cassetto,
    CellaValore,
    Icona,
    MenuAzioni,
    RouterLink,
    Scheletro,
    SelettoreDocumenti,
    StatoVuoto,
    Suggerimento,
    Tag,
    VisualizzatorePdf,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dettaglio-tabella.html',
  styleUrl: './dettaglio-tabella.scss',
})
export class DettaglioTabella {
  protected readonly store = inject(DettaglioTabellaStore);
  private readonly api = inject(TabelleApi);
  private readonly apiPubblici = inject(DocumentiApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);

  /** Dalla rotta `/tabelle/:id`. */
  readonly id = input.required<string>();

  private readonly campoRinomina = viewChild<ElementRef<HTMLInputElement>>('campoRinomina');

  constructor() {
    effect(() => this.store.apri(this.id()));

    /* Chi ha premuto «rinomina» vuole scrivere, non cercare il campo. */
    afterRenderEffect(() => {
      this.campoRinomina()?.nativeElement.focus();
    });
  }

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Tabelle di analisi', percorso: '/tabelle' },
    { etichetta: this.store.tabella()?.titolo ?? 'Tabella' },
  ]);

  protected readonly idDocumenti = computed(
    () => this.store.tabella()?.righe.map((r) => r.documentoId) ?? [],
  );

  // --- Rinomina (RF-C-14) -------------------------------------------------

  protected readonly inRinomina = signal(false);
  protected readonly titoloBozza = signal('');

  protected avviaRinomina(): void {
    const tabella = this.store.tabella();
    if (!tabella) return;
    this.titoloBozza.set(tabella.titolo);
    this.inRinomina.set(true);
  }

  protected confermaRinomina(): void {
    const tabella = this.store.tabella();
    const titolo = this.titoloBozza().trim();
    if (tabella && titolo && titolo !== tabella.titolo) {
      this.store.rinomina(titolo);
    }
    this.inRinomina.set(false);
  }

  // --- Eliminazione -------------------------------------------------------

  /* Conferma a due passi, come per conversazioni e documenti: il primo clic
     arma, il secondo esegue. */
  protected readonly confermaEliminazione = signal(false);

  protected elimina(): void {
    if (!this.confermaEliminazione()) {
      this.confermaEliminazione.set(true);
      return;
    }
    this.store.elimina();
  }

  // --- Citazioni (RF-C-05 dalla cella) ------------------------------------

  protected readonly citazioneAperta = signal<Citazione | undefined>(undefined);

  protected urlFile(citazione: Citazione): string {
    return citazione.archivio === 'pubblico'
      ? this.apiPubblici.urlFile(citazione.documentoId)
      : this.apiPrivati.urlFile(citazione.documentoId);
  }

  // --- Esportazione (RF-C-14) ---------------------------------------------

  private readonly menuEsporta = viewChild<MenuAzioni>('menuEsporta');

  protected readonly vociEsporta = computed<VoceMenu[]>(() =>
    this.store.scelteEsportazione().map((scelta) => ({
      etichetta: scelta.etichetta,
      dettaglio: scelta.dettaglio,
      azione: () => this.store.esporta(scelta),
    })),
  );

  protected apriEsporta(evento: Event): void {
    this.menuEsporta()?.apri(evento);
  }

  // --- Aggiunta di documenti (RF-C-14) ------------------------------------

  protected readonly cassettoDocumenti = signal(false);
  protected readonly ricercaDocumento = signal('');
  private readonly selettore = viewChild(SelettoreDocumenti);

  protected suTastoRicerca(evento: KeyboardEvent): void {
    const selettore = this.selettore();
    if (selettore?.gestisciTasto(evento)) evento.preventDefault();
  }

  protected aggiungiDocumento(documento: RiferimentoDocumento): void {
    /* Il cassetto resta aperto: chi allarga un confronto aggiunge spesso
       più di un documento di fila. */
    this.store.aggiungiDocumento(documento.id);
    this.ricercaDocumento.set('');
  }

  // --- Aggiunta di colonne (RF-C-14) --------------------------------------

  protected readonly cassettoColonne = signal(false);
  protected readonly bozzaColonna = signal('');

  /* I criteri si chiedono solo a cassetto aperto: non ha senso pagarli a
     ogni apertura della tabella. */
  private readonly risorsaCriteri = httpResource<CriterioPredefinito[]>(() =>
    this.cassettoColonne() && this.idDocumenti().length
      ? this.api.urlCriteri(this.idDocumenti())
      : undefined,
  );

  /** I predefiniti non ancora in tabella: gli altri sarebbero doppioni. */
  protected readonly criteriDisponibili = computed(() => {
    const presenti = new Set(this.store.tabella()?.colonne.map((c) => c.intestazione) ?? []);
    const criteri = this.risorsaCriteri.hasValue() ? this.risorsaCriteri.value() : [];
    return criteri.filter((c) => !presenti.has(c.intestazione));
  });

  protected aggiungiPredefinita(criterio: CriterioPredefinito): void {
    this.store.aggiungiColonna({ intestazione: criterio.intestazione, origine: 'predefinita' });
  }

  protected aggiungiPersonalizzata(): void {
    const criterio = this.bozzaColonna().replace(/\s+/g, ' ').trim();
    if (!criterio) return;
    this.store.aggiungiColonna({
      intestazione: intestazioneDaCriterio(criterio),
      origine: 'personalizzata',
      criterio,
    });
    this.bozzaColonna.set('');
  }

  /** La scheda del documento di una riga, per il collegamento. */
  protected percorsoDocumento(riga: { documentoId: Id; archivio: string }): string[] {
    return ['/archivio', riga.archivio === 'pubblico' ? 'pubblico' : 'privato', riga.documentoId];
  }
}
