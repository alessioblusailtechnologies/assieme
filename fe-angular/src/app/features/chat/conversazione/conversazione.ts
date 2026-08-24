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

import { BollaMessaggio } from './bolla-messaggio';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { ChatStore } from '../chat-store';
import { Citazione } from '@core/models';
import { Composer } from '../composer/composer';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { ConversazioniApi } from '@core/api/conversazioni-api';
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
    Bottone,
    Cassetto,
    Composer,
    Icona,
    MenuAzioni,
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
  private readonly apiConversazioni = inject(ConversazioniApi);

  /** Dalla rotta; assente su `/chat`, la schermata «nuova conversazione». */
  readonly id = input<string>();

  private readonly filo = viewChild<ElementRef<HTMLElement>>('filo');

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
  }

  protected suScorrimento(): void {
    const el = this.filo()?.nativeElement;
    if (!el) return;
    this.seguiFondo = el.scrollHeight - el.scrollTop - el.clientHeight < SOGLIA_FONDO_PX;
  }

  protected readonly contesto = computed(() => {
    /* Il contesto dell'elenco più i riferimenti del messaggio in volo: il
       server li ha già aggiunti, ma l'elenco si ricarica a fine stream — e
       intanto i chip del messaggio appena inviato devono avere un titolo. */
    const noti = this.store.attiva()?.documentiInContesto ?? [];
    const presenti = new Set(noti.map((d) => d.id));
    return [...noti, ...this.store.riferimentiInVolo().filter((d) => !presenti.has(d.id))];
  });
  protected readonly idContesto = computed(() => this.contesto().map((d) => d.id));

  // --- Citazioni (RF-C-05) ------------------------------------------------

  /** La citazione aperta nel pannello laterale del visualizzatore. */
  protected readonly citazioneAperta = signal<Citazione | undefined>(undefined);

  /**
   * Il pannello del contesto si comprime: su un confronto largo, 300px sono
   * lettura. La scelta si ricorda sul browser: chi lo chiude lo vuole chiuso
   * anche domani — e se lo storage non c'è (finestra privata), si riparte aperti.
   */
  protected readonly contestoCompresso = signal(leggiContestoCompresso());

  private readonly ricordaContestoCompresso = effect(() => {
    const compresso = this.contestoCompresso();
    try {
      localStorage.setItem(CHIAVE_CONTESTO_COMPRESSO, compresso ? '1' : '0');
    } catch {
      /* senza storage la preferenza vive quanto la pagina */
    }
  });

  protected apriCitazione(citazione: Citazione): void {
    this.citazioneAperta.set(citazione);
  }

  protected urlFile(citazione: Citazione): string {
    switch (citazione.archivio) {
      case 'pubblico':
        return this.apiPubblici.urlFile(citazione.documentoId);
      case 'conversazione':
        return this.apiConversazioni.urlFileAllegato(citazione.documentoId);
      default:
        return this.apiPrivati.urlFile(citazione.documentoId);
    }
  }

  // --- Esportazione su template (RF-C-10) ---------------------------------

  private readonly menuEsporta = viewChild<MenuAzioni>('menuEsporta');

  /** Il messaggio su cui è stato chiesto «esporta», finché il menu è aperto. */
  private messaggioDaEsportare?: string;

  /**
   * Un solo menu per tutto il filo, non uno per messaggio: si aggancia al
   * pulsante premuto e ricorda per quale messaggio è stato aperto.
   */
  protected readonly vociEsporta = computed<VoceMenu[]>(() =>
    this.store.template().map((template) => ({
      etichetta: template.nome,
      dettaglio: template.formato,
      azione: () => {
        if (this.messaggioDaEsportare) this.store.esporta(this.messaggioDaEsportare, template);
      },
    })),
  );

  protected apriEsporta(evento: Event, messaggioId: string): void {
    this.messaggioDaEsportare = messaggioId;
    this.menuEsporta()?.apri(evento);
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

/** La preferenza vive sul browser: è comodità di chi guarda, non stato del dominio. */
const CHIAVE_CONTESTO_COMPRESSO = 'velia.contesto-compresso';

function leggiContestoCompresso(): boolean {
  try {
    return localStorage.getItem(CHIAVE_CONTESTO_COMPRESSO) === '1';
  } catch {
    return false;
  }
}
