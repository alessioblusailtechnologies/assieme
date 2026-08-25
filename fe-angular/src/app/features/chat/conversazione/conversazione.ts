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
import { httpResource } from '@angular/common/http';

import { ChatStore } from '../chat-store';
import { salutoPer } from '../saluto';
import { SessioneStore } from '@core/auth/sessione-store';
import { Citazione, etichettaCitazione } from '@core/models';
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
  private readonly sessione = inject(SessioneStore);

  /** Il saluto della schermata iniziale: contestuale all'ora e alla persona. */
  protected readonly saluto = computed(() => salutoPer(new Date(), this.sessione.utente()?.nome));

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

  /** RF-C-15: condivide con l'agenzia, o revoca — il pulsante mostra lo stato. */
  protected condividi(): void {
    const attiva = this.store.attiva();
    if (attiva) this.store.condividi(attiva.id, !attiva.condivisa);
  }

  /**
   * Scarica la conversazione com'è: un Markdown con domande, risposte e
   * fonti. Lato client, dai messaggi già in pagina — nessun contratto nuovo.
   */
  protected scaricaConversazione(): void {
    const attiva = this.store.attiva();
    if (!attiva) return;
    const parti = this.store.messaggi().map((m) => {
      const voce = m.autore === 'utente' ? '## Domanda' : '## Risposta';
      const fonti = m.citazioni.length
        ? `\n\nFonti:\n${m.citazioni.map((c) => `- ${etichettaCitazione(c)}`).join('\n')}`
        : '';
      return `${voce}\n\n${m.testo}${fonti}`;
    });
    const contenuto = `# ${attiva.titolo}\n\n${parti.join('\n\n---\n\n')}\n`;
    const url = URL.createObjectURL(new Blob([contenuto], { type: 'text/markdown' }));
    const collegamento = document.createElement('a');
    collegamento.href = url;
    collegamento.download = `${attiva.titolo.toLowerCase().replace(/[^a-z0-9à-ù]+/g, '-').replace(/^-+|-+$/g, '') || 'conversazione'}.md`;
    collegamento.click();
    URL.revokeObjectURL(url);
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
    this.store.scelteEsportazione().map((scelta) => ({
      etichetta: scelta.etichetta,
      dettaglio: scelta.dettaglio,
      azione: () => {
        if (this.messaggioDaEsportare) this.store.esporta(this.messaggioDaEsportare, scelta);
      },
    })),
  );

  protected apriEsporta(evento: Event, messaggioId: string): void {
    this.messaggioDaEsportare = messaggioId;
    this.menuEsporta()?.apri(evento);
  }

  /**
   * I suggerimenti della schermata vuota: li scrive il motore a fine
   * risposta, su misura dell'ultima conversazione; gli esempi fissi
   * completano fino a tre e reggono da soli il primo giorno (o il mock).
   */
  private readonly esempi = [
    'Confronta il set informativo AUTOPIÙ con il preventivo UnipolSai per la Fiat 500X',
    'Che franchigie prevede la garanzia furto e incendio?',
    'La polizza copre i danni da grandine?',
  ];

  private readonly risorsaSuggerimenti = httpResource<string[]>(() =>
    this.apiConversazioni.urlSuggerimenti(),
  );

  protected readonly suggerimenti = computed(() => {
    const generati = this.risorsaSuggerimenti.hasValue() ? this.risorsaSuggerimenti.value() : [];
    return [...generati, ...this.esempi.filter((e) => !generati.includes(e))].slice(0, 3);
  });

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
