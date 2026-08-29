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
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { BollaMessaggio } from './bolla-messaggio';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { httpResource } from '@angular/common/http';

import { ChatStore } from '../chat-store';
import { salutoPer } from '../saluto';
import { SessioneStore } from '@core/auth/sessione-store';
import { Campo } from '@shared/ui/campo/campo';
import { Citazione, TemplateOutput, etichettaCitazione } from '@core/models';
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
    Campo,
    Cassetto,
    Composer,
    DatePipe,
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

  /**
   * Il saluto della schermata iniziale: contestuale all'ora e alla persona,
   * con le frasi arrivate con la sessione. Finché la sessione non c'è è
   * `undefined` e al suo posto sta uno scheletro: mostrare una frase neutra
   * e poi sostituirla fa sussultare la pagina. La frase neutra resta solo
   * per il caso in cui la sessione sia fallita.
   */
  protected readonly saluto = computed(() => {
    const sessione = this.sessione.sessione();
    if (!sessione) return this.sessione.errore() ? salutoPer(new Date()) : undefined;
    return salutoPer(new Date(), sessione.utente.nome, sessione.saluti);
  });

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

  // --- Le azioni sotto una risposta (RF-C-10) ------------------------------

  /*
   * Un solo menu per tutto il filo, non uno per messaggio: si aggancia al
   * pulsante premuto e ricorda per quale messaggio è stato aperto. Vale per
   * l'«Esporta come» e per l'«Invia email».
   */
  private readonly menuEsporta = viewChild<MenuAzioni>('menuEsporta');
  private readonly menuEmail = viewChild<MenuAzioni>('menuEmail');

  /** Il messaggio su cui è stata chiesta un'azione, finché il menu o il modulo è aperto. */
  private messaggioInAzione?: string;

  // «Esporta come»: Word, PDF, testo semplice - un download immediato.

  protected readonly vociEsporta: VoceMenu[] = this.store.scelteEsportazione.map((scelta) => ({
    etichetta: scelta.etichetta,
    dettaglio: scelta.dettaglio,
    azione: () => {
      if (this.messaggioInAzione) this.store.esporta(this.messaggioInAzione, scelta);
    },
  }));

  protected apriEsporta(evento: Event, messaggioId: string): void {
    this.messaggioInAzione = messaggioId;
    this.menuEsporta()?.apri(evento);
  }

  // «Invia email»: a me (l'indirizzo con cui sono registrato) o a un altro indirizzo.

  protected readonly emailAperta = signal(false);
  protected readonly emailDestinatario = signal('');
  protected readonly emailValida = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(this.emailDestinatario().trim()));

  protected readonly vociEmail = computed<VoceMenu[]>(() => [
    {
      etichetta: 'A me',
      dettaglio: this.sessione.utente()?.email ?? '',
      azione: () => {
        if (this.messaggioInAzione) this.store.inviaEmail(this.messaggioInAzione, 'me');
      },
    },
    {
      etichetta: 'A un altro indirizzo…',
      azione: () => {
        this.emailDestinatario.set('');
        this.emailAperta.set(true);
      },
    },
  ]);

  protected apriEmail(evento: Event, messaggioId: string): void {
    this.messaggioInAzione = messaggioId;
    this.menuEmail()?.apri(evento);
  }

  protected inviaEmailAltro(evento: Event): void {
    evento.preventDefault();
    const a = this.emailDestinatario().trim();
    if (!this.messaggioInAzione || !this.emailValida()) return;
    this.store.inviaEmail(this.messaggioInAzione, a, () => this.emailAperta.set(false));
  }

  // «Genera documento da template»: si sceglie il template, alla conferma
  // parte come un messaggio - il lavoro del motore documentale si vede nel
  // filo e l'allegato compare sotto la risposta quando è pronto.

  protected readonly templateAperto = signal(false);
  protected readonly templateScelto = signal<string | undefined>(undefined);

  /** I template dell'agenzia che si sanno generare, il predefinito del formato per primo. */
  protected readonly templateDisponibili = computed<TemplateOutput[]>(() =>
    this.store
      .template()
      .filter((t) => t.formato !== 'pptx')
      .sort((a, b) => Number(b.predefinito) - Number(a.predefinito) || a.nome.localeCompare(b.nome)),
  );

  protected apriTemplate(messaggioId: string): void {
    this.messaggioInAzione = messaggioId;
    this.templateScelto.set(this.templateDisponibili()[0]?.id);
    this.templateAperto.set(true);
  }

  protected avviaTemplate(): void {
    const messaggioId = this.messaggioInAzione;
    const template = this.templateDisponibili().find((t) => t.id === this.templateScelto());
    if (!messaggioId || !template || template.formato === 'pptx') return;
    this.templateAperto.set(false);
    this.store.inviaEsportazione(
      { formato: template.formato, templateId: template.id, messaggioId },
      `«${template.nome}» (${template.formato.toUpperCase()})`,
    );
  }

  /**
   * I suggerimenti della schermata vuota: domande di partenza sul contesto
   * dell'agenzia (archivio, ricordi, temi ricorrenti), generate dal server
   * per utente e rinnovate ogni giorno. Il server ne tiene fino a sei, qui
   * se ne mostrano tre scelte per ora, così cambiano nella giornata. Gli
   * esempi fissi completano fino a tre e reggono da soli il primo giorno (o
   * il mock). Finché la risposta non c'è, `undefined`: al suo posto uno
   * scheletro, non gli esempi che poi vengono sostituiti.
   */
  private readonly esempi = [
    'Confronta il set informativo AUTOPIÙ con il preventivo UnipolSai per la Fiat 500X',
    'Che franchigie prevede la garanzia furto e incendio?',
    'La polizza copre i danni da grandine?',
  ];

  /** Le larghezze dello scheletro: tre pillole, come tre domande di lunghezza diversa. */
  protected readonly scheletriSuggerimenti = ['34ch', '22ch', '27ch'];

  private readonly risorsaSuggerimenti = httpResource<string[]>(() =>
    this.apiConversazioni.urlSuggerimenti(),
  );

  protected readonly suggerimenti = computed(() => {
    if (this.risorsaSuggerimenti.isLoading() && !this.risorsaSuggerimenti.hasValue()) return undefined;
    const generati = this.risorsaSuggerimenti.hasValue() ? this.risorsaSuggerimenti.value() : [];
    if (generati.length > 3) return sceltiPerOra(generati, 3);
    return [...generati, ...this.esempi.filter((e) => !generati.includes(e))].slice(0, 3);
  });

  protected usaSuggerimento(testo: string): void {
    this.store.bozza.set(testo);
  }
}

/**
 * Una finestra di `quanti` voci che scorre con l'ora del giorno: stabile
 * nella stessa ora, diversa in quella dopo, senza mai ripetere una voce.
 */
export function sceltiPerOra(voci: string[], quanti: number, momento = new Date()): string[] {
  const inizio = momento.getHours() % voci.length;
  return Array.from({ length: Math.min(quanti, voci.length) }, (_, i) => voci[(inizio + i) % voci.length]);
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
