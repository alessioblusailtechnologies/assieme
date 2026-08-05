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

import { ButtonDirective } from 'primeng/button';
import { Drawer } from 'primeng/drawer';
import { InputText } from 'primeng/inputtext';
import { Menu } from 'primeng/menu';
import { MenuItem } from 'primeng/api';

import { BollaMessaggio } from './bolla-messaggio';
import { ChatStore } from '../chat-store';
import { Citazione } from '@core/models';
import { Composer } from '../composer/composer';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';

/** Sotto questa distanza dal fondo, lo scorrimento segue la risposta. */
const SOGLIA_FONDO_PX = 120;

/**
 * Una conversazione — o l'inizio di una: `/chat` e `/chat/:id` sono lo
 * stesso componente, senza id cambia solo ciò che sta sopra il composer.
 *
 * RF-C-01 (persistente, rinominabile), RF-C-03 (contesto documentale
 * governabile), RF-C-04/05 (citazioni e apertura sul passaggio), RF-C-08
 * (non-copertura dichiarata).
 */
@Component({
  selector: 'app-conversazione',
  imports: [
    BollaMessaggio,
    ButtonDirective,
    Composer,
    Drawer,
    Icona,
    InputText,
    Menu,
    RouterLink,
    Scheletro,
    StatoVuoto,
    VisualizzatorePdf,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversazione.html',
  styleUrl: './conversazione.scss',
})
export class Conversazione {
  protected readonly store = inject(ChatStore);
  private readonly apiPubblici = inject(DocumentiApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);

  /** Dalla rotta; assente su `/chat`, la schermata «nuova conversazione». */
  readonly id = input<string>();

  private readonly filo = viewChild<ElementRef<HTMLElement>>('filo');
  private readonly campoRinomina = viewChild<ElementRef<HTMLInputElement>>('campoRinomina');

  /**
   * Lo scorrimento segue la risposta solo finché l'utente sta al fondo: se è
   * risalito a rileggere, la pagina non gli scappa di mano. Il gesto di
   * tornare in fondo riattiva l'inseguimento.
   */
  private seguiFondo = true;

  constructor() {
    effect(() => {
      this.store.apri(this.id());
      this.seguiFondo = true;
    });

    afterRenderEffect(() => {
      this.store.messaggi();
      const el = this.filo()?.nativeElement;
      if (el && this.seguiFondo) el.scrollTop = el.scrollHeight;
    });

    /* Il campo di rinomina compare su richiesta: quando c'è, il fuoco è suo
       — chi ha premuto «rinomina» vuole scrivere, non cercare il campo. */
    afterRenderEffect(() => {
      this.campoRinomina()?.nativeElement.focus();
    });
  }

  protected suScorrimento(): void {
    const el = this.filo()?.nativeElement;
    if (!el) return;
    this.seguiFondo = el.scrollHeight - el.scrollTop - el.clientHeight < SOGLIA_FONDO_PX;
  }

  protected readonly contesto = computed(() => this.store.attiva()?.documentiInContesto ?? []);
  protected readonly idContesto = computed(() => this.contesto().map((d) => d.id));

  // --- Rinomina (RF-C-01) -------------------------------------------------

  protected readonly inRinomina = signal(false);
  protected readonly titoloBozza = signal('');

  protected avviaRinomina(): void {
    const attiva = this.store.attiva();
    if (!attiva) return;
    this.titoloBozza.set(attiva.titolo);
    this.inRinomina.set(true);
  }

  protected confermaRinomina(): void {
    const attiva = this.store.attiva();
    if (attiva && this.titoloBozza().trim() && this.titoloBozza().trim() !== attiva.titolo) {
      this.store.rinomina(attiva.id, this.titoloBozza());
    }
    this.inRinomina.set(false);
  }

  // --- Eliminazione -------------------------------------------------------

  /* Conferma a due passi, come nella scheda documento: il primo clic arma,
     il secondo esegue, un clic altrove disarma. */
  protected readonly confermaEliminazione = signal(false);

  protected elimina(): void {
    const attiva = this.store.attiva();
    if (!attiva) return;
    if (!this.confermaEliminazione()) {
      this.confermaEliminazione.set(true);
      return;
    }
    this.store.elimina(attiva.id);
    this.confermaEliminazione.set(false);
  }

  // --- Citazioni (RF-C-05) ------------------------------------------------

  /** La citazione aperta nel pannello laterale del visualizzatore. */
  protected readonly citazioneAperta = signal<Citazione | undefined>(undefined);

  protected apriCitazione(citazione: Citazione): void {
    this.citazioneAperta.set(citazione);
  }

  protected urlFile(citazione: Citazione): string {
    return citazione.archivio === 'pubblico'
      ? this.apiPubblici.urlFile(citazione.documentoId)
      : this.apiPrivati.urlFile(citazione.documentoId);
  }

  // --- Esportazione su template (RF-C-10) ---------------------------------

  private readonly menuEsporta = viewChild<Menu>('menuEsporta');

  /** Il messaggio su cui è stato chiesto «esporta», finché il menu è aperto. */
  private messaggioDaEsportare?: string;

  /**
   * Un solo menu per tutto il filo, non uno per messaggio: si aggancia al
   * pulsante premuto e ricorda per quale messaggio è stato aperto.
   */
  protected readonly vociEsporta = computed<MenuItem[]>(() =>
    this.store.template().map((template) => ({
      label: template.nome,
      badge: template.formato,
      command: () => {
        if (this.messaggioDaEsportare) this.store.esporta(this.messaggioDaEsportare, template);
      },
    })),
  );

  protected apriEsporta(evento: Event, messaggioId: string): void {
    this.messaggioDaEsportare = messaggioId;
    this.menuEsporta()?.toggle(evento);
  }

  /** I suggerimenti della schermata vuota: domande vere, pronte da inviare. */
  protected readonly suggerimenti = [
    'Confronta il set informativo AUTOPIÙ con il preventivo UnipolSai per la Fiat 500X',
    'Che franchigie prevede la garanzia furto e incendio?',
    'La polizza copre i danni da grandine?',
  ];

  protected usaSuggerimento(testo: string): void {
    this.store.bozza.set(testo);
  }
}
