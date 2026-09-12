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
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { BollaMessaggio } from './bolla-messaggio';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { httpResource } from '@angular/common/http';

import { AmbitoAzione, ChatStore } from '../chat-store';
import { salutoPer } from '../saluto';
import { SessioneStore } from '@core/auth/sessione-store';
import { TokenStore } from '@core/auth/token-store';
import { Campo } from '@shared/ui/campo/campo';
import {
  Citazione,
  DURATE_LINK,
  Id,
  ModelloRiferimento,
  etichettaCitazione,
} from '@core/models';
import { raggruppaRiferimenti, type GruppoRiferimenti } from '@shared/riferimenti/gruppi';
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
   * Vero quando questa è la chat di un cliente dell'agenzia (07/09/2026).
   *
   * Si legge dalla credenziale, non da un parametro: chi entra col token di
   * un link **è** un cliente, e non c'è una seconda strada. Il server lo sa
   * già e gli nega tutto il resto; qui si tolgono di mezzo i comandi che
   * non avrebbero effetto, perché un pulsante che risponde «non puoi» è
   * peggio di un pulsante che non c'è.
   */
  private readonly token = inject(TokenStore);
  protected readonly perCliente = computed(() => Boolean(this.token.tokenOspite()));

  /**
   * Il saluto della schermata iniziale: contestuale all'ora e alla persona,
   * con le frasi arrivate con la sessione. Finché la sessione non c'è è
   * `undefined` e al suo posto sta uno scheletro: mostrare una frase neutra
   * e poi sostituirla fa sussultare la pagina. La frase neutra resta solo
   * per il caso in cui la sessione sia fallita.
   */
  protected readonly saluto = computed(() => {
    /*
     * Il cliente non ha una sessione d'agenzia da aspettare: gliel'abbiamo
     * tolta di proposito, perché `/api/sessione` legge `velia.utenti` e le
     * policy gliela negano. Senza questo ramo lo scheletro del saluto
     * resterebbe grigio per sempre — né una sessione né un errore, e la
     * riga aspetta uno dei due.
     *
     * E comunque il suo saluto non sarebbe lo stesso: quello dell'agenzia
     * dà del tu e chiama la persona per nome, e qui non si sa chi abbia in
     * mano il telefono.
     */
    if (this.perCliente()) return 'Come posso aiutarla?';
    const sessione = this.sessione.sessione();
    if (!sessione) return this.sessione.errore() ? salutoPer(new Date()) : undefined;
    return salutoPer(new Date(), sessione.utente.nome, sessione.saluti);
  });

  /** Dalla rotta; assente su `/chat`, la schermata «nuova conversazione». */
  readonly id = input<string>();

  /**
   * Se c'è una conversazione da mostrare, invece che la schermata iniziale.
   *
   * Si guarda il **negozio**, non la rotta. Nell'applicazione dell'agenzia
   * le due cose coincidono, perché appena la conversazione nasce si naviga
   * al suo indirizzo. Nella chat di un cliente no: c'è un indirizzo solo,
   * quello del suo link, e leggendo la rotta la pagina resterebbe per
   * sempre sul «fai una domanda» — anche mentre la risposta arriva.
   */
  protected readonly conversazioneInCorso = computed(() => Boolean(this.store.idAttiva()));

  private readonly filo = viewChild<ElementRef<HTMLElement>>('filo');

  /**
   * Lo scorrimento segue la risposta solo finché l'utente sta al fondo: se è
   * risalito a rileggere, la pagina non gli scappa di mano. Il gesto di
   * tornare in fondo riattiva l'inseguimento.
   */
  private seguiFondo = true;

  constructor() {
    effect(() => {
      const id = this.id();
      /*
       * `apri` legge `idAttiva` per decidere se c'è qualcosa da fare, e
       * senza `untracked` questo effetto si iscriverebbe a quel segnale: il
       * negozio imposta la conversazione appena creata, l'effetto riparte
       * con l'id della rotta ancora vecchio e la richiude appena aperta.
       *
       * Nell'applicazione dell'agenzia non si vedeva perché subito dopo si
       * naviga, e l'id della rotta diventa quello giusto. Nella chat di un
       * cliente non si naviga — c'è un indirizzo solo — e la conversazione
       * spariva un istante dopo l'invio, con la risposta che arrivava nel
       * vuoto.
       */
      untracked(() => this.store.apri(id));
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

  /**
   * Il contesto come lo si legge: una riga per documento, ma i documenti di
   * uno stesso set informativo stanno insieme sotto il nome del prodotto
   * (12/09/2026), come il chip nel composer.
   */
  protected readonly contestoRaggruppato = computed(() => raggruppaRiferimenti(this.contesto()));

  /** Gli id di un gruppo: si toglie il prodotto, non i suoi quattro pezzi. */
  protected idsDelGruppo(gruppo: GruppoRiferimenti): Id[] {
    return gruppo.riferimenti.map((r) => r.id);
  }

  /**
   * Lo stato della lettura, per i gruppi di un documento solo: un set
   * dell'Archivio Pubblico è sempre già letto, e ciò che sta in lettura è
   * un allegato o un documento privato, che sta sempre da solo.
   */
  protected letturaDelGruppo(gruppo: GruppoRiferimenti) {
    const solo = gruppo.riferimenti.length === 1 ? gruppo.riferimenti[0] : undefined;
    return solo && this.store.elaborazioni().get(solo.id);
  }

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

  // --- Le azioni: sotto una risposta, e su tutta la chat (RF-C-10) ---------

  /**
   * La barra sopra il composer compare quando c'è una consulenza da
   * consegnare: almeno una risposta finita. Prima non ci sarebbe niente da
   * copiare, mandare o impaginare, e quattro pulsanti spenti sono peggio di
   * nessun pulsante.
   */
  protected readonly haRisposte = computed(() =>
    this.store.messaggi().some((m) => m.autore === 'assistente' && !m.inCorso && !!m.testo),
  );

  protected readonly copiataChat = signal(false);

  protected copiaChat(): void {
    void this.store.copiaConversazione().then(() => {
      this.copiataChat.set(true);
      setTimeout(() => this.copiataChat.set(false), 2000);
    });
  }


  /*
   * Un solo menu per tutto il filo, non uno per messaggio: si aggancia al
   * pulsante premuto e ricorda su che cosa è stato aperto. Vale per
   * l'«Esporta come» e per l'«Invia email».
   *
   * Dal 12/09/2026 l'ambito è due cose: l'id di una risposta, o tutto il
   * filo. Le azioni sotto una bolla e quelle della barra sopra il composer
   * sono le stesse e passano di qui: una sola macchina, due perimetri.
   */
  private readonly menuEsporta = viewChild<MenuAzioni>('menuEsporta');
  private readonly menuEmail = viewChild<MenuAzioni>('menuEmail');

  /** Su che cosa è stata chiesta un'azione, finché il menu o il modulo è aperto. */
  private ambitoInAzione: AmbitoAzione = 'conversazione';

  // «Esporta come»: Word, PDF, testo semplice - un download immediato.

  protected readonly vociEsporta: VoceMenu[] = this.store.scelteEsportazione.map((scelta) => ({
    etichetta: scelta.etichetta,
    dettaglio: scelta.dettaglio,
    azione: () => this.store.esporta(this.ambitoInAzione, scelta),
  }));

  protected apriEsporta(evento: Event, ambito: AmbitoAzione): void {
    this.ambitoInAzione = ambito;
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
      azione: () => this.store.inviaEmail(this.ambitoInAzione, 'me'),
    },
    {
      etichetta: 'A un altro indirizzo…',
      azione: () => {
        this.emailDestinatario.set('');
        this.emailAperta.set(true);
      },
    },
  ]);

  protected apriEmail(evento: Event, ambito: AmbitoAzione): void {
    this.ambitoInAzione = ambito;
    this.menuEmail()?.apri(evento);
  }

  protected inviaEmailAltro(evento: Event): void {
    evento.preventDefault();
    const a = this.emailDestinatario().trim();
    if (!this.emailValida()) return;
    this.store.inviaEmail(this.ambitoInAzione, a, () => this.emailAperta.set(false));
  }

  // «Condividi link»: il documento come pagina che il cliente apre dal
  // telefono. Il link lo tiene lo store; qui solo copia e WhatsApp.

  protected readonly durateLink = DURATE_LINK;
  protected readonly linkCopiato = signal(false);

  protected copiaLink(url: string): void {
    void navigator.clipboard?.writeText(url).then(() => {
      this.linkCopiato.set(true);
      setTimeout(() => this.linkCopiato.set(false), 2000);
    });
  }

  /** WhatsApp sceglie a chi mandarlo: qui solo il testo, col nome del documento e il link. */
  protected linkWhatsapp(nome: string, url: string): string {
    return `https://wa.me/?text=${encodeURIComponent(`${nome}: ${url}`)}`;
  }

  // «Genera da modello»: si sceglie il modello di riferimento, alla conferma
  // parte come un messaggio - il lavoro del motore documentale si vede nel
  // filo e l'allegato compare sotto la risposta quando è pronto.

  protected readonly modelloAperto = signal(false);
  protected readonly modelloScelto = signal<string | undefined>(undefined);
  protected readonly istruzioniModello = signal('');

  /** I modelli dell'agenzia, per nome. */
  protected readonly modelliDisponibili = computed<ModelloRiferimento[]>(() =>
    [...this.store.modelli()].sort((a, b) => a.nome.localeCompare(b.nome)),
  );

  /** Il cassetto è uno solo per i due perimetri: qui dice su quale sta lavorando. */
  protected readonly modelloSuTuttaLaChat = signal(false);

  protected apriModelli(ambito: AmbitoAzione): void {
    this.ambitoInAzione = ambito;
    this.modelloSuTuttaLaChat.set(ambito === 'conversazione');
    this.store.ricaricaModelli();
    this.modelloScelto.set(this.modelliDisponibili()[0]?.id);
    this.istruzioniModello.set('');
    this.modelloAperto.set(true);
  }

  protected avviaModello(): void {
    const ambito = this.ambitoInAzione;
    const modello = this.modelliDisponibili().find((m) => m.id === this.modelloScelto());
    if (!modello) return;
    this.modelloAperto.set(false);
    const istruzioni = this.istruzioniModello().trim();
    this.store.inviaEsportazione(
      {
        modelloId: modello.id,
        ...(ambito === 'conversazione'
          ? { ambito: 'conversazione' as const }
          : { messaggioId: ambito }),
        ...(istruzioni && { istruzioni }),
      },
      modello.nome,
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

  /*
   * Al cliente non si chiedono nemmeno: la rotta gli è negata, e alla 403
   * il ripiego sarebbero gli esempi qui sopra — scritti per l'agenzia, e
   * uno dei tre nomina il preventivo di un altro cliente.
   */
  private readonly risorsaSuggerimenti = httpResource<string[]>(() =>
    this.perCliente() ? undefined : this.apiConversazioni.urlSuggerimenti(),
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
