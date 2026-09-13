import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { ChatClientiApi } from '@core/api/chat-clienti-api';
import { ClientiApi, DestinazioneDocumenti, EtichettaCliente } from '@core/api/clienti-api';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import type {
  ChatCliente,
  Cliente,
  DocumentoPrivato,
  ErroreApi,
  Id,
  Paginato,
  SchedaCliente,
} from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaStato } from '@features/archivio-privato/elenco/celle/cella-stato';
import { CreazioneChat } from '@features/chat-clienti/creazione/creazione-chat';
import { EtichettaStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { Icona } from '@shared/ui/icona/icona';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { SceltaEtichette } from '@shared/ui/scelta-etichette/scelta-etichette';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { ESTENSIONI_DOCUMENTO, FORMATI_DOCUMENTO } from '@core/models';

/** Le tre schede: dove sta tutto quello che riguarda un cliente. */
type Scheda = 'anagrafica' | 'documenti' | 'chat';

/** Ogni quanto si richiede lo stato dei documenti ancora in lavorazione: come nell'archivio. */
const MS_INTERROGAZIONE = 2000;

/**
 * Un file che sta salendo. La riga compare **alla scelta**, non alla
 * risposta del server: fra le due passano il trasferimento e il
 * salvataggio, e un elenco che in quel tempo resta fermo sembra non aver
 * sentito il gesto.
 */
interface FileInSalita {
  chiave: number;
  nome: string;
  percentuale: number;
  errore?: string;
  /** I documenti che il caricamento ha creato, quando il server ha risposto. */
  creati?: Id[];
}

/**
 * La scheda di un cliente.
 *
 * Tre schede, e sono le tre cose che di un cliente si fanno: guardare e
 * correggere **chi è**, guardare e caricare **cosa ha**, aprire e revocare
 * **il canale** con cui gli si parla.
 *
 * I documenti non arrivano da una rotta dedicata ma dall'archivio con
 * `clienteId`: è lo stesso elenco, con le stesse regole e lo stesso stato di
 * elaborazione, filtrato. Due elenchi di documenti che divergono sono il
 * modo in cui si finisce a spiegare all'utente perché un documento «c'è di
 * là ma non di qua».
 */
@Component({
  selector: 'app-dettaglio-cliente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Bottone,
    Briciole,
    Campo,
    CellaStato,
    CreazioneChat,
    DatePipe,
    EtichettaStato,
    FormsModule,
    Icona,
    MenuAzioni,
    RouterLink,
    SceltaEtichette,
    Scheletro,
    Select,
    StatoVuoto,
    Tag,
    ZonaCaricamento,
  ],
  templateUrl: './dettaglio-cliente.html',
  styleUrl: './dettaglio-cliente.scss',
})
export class DettaglioCliente {
  private readonly api = inject(ClientiApi);
  private readonly apiChat = inject(ChatClientiApi);
  private readonly apiDocumenti = inject(DocumentiPrivatiApi);
  private readonly conferme = inject(ConfermeStore);
  private readonly router = inject(Router);
  private readonly rotta = inject(ActivatedRoute);

  /** L'id viene dalla rotta: la scheda è un posto, e un posto ha un indirizzo. */
  readonly id = input.required<string>();

  protected readonly estensioni = ESTENSIONI_DOCUMENTO;
  protected readonly formati = FORMATI_DOCUMENTO;

  /**
   * Anche la scheda aperta sta nell'indirizzo, non in un signal: «guarda i
   * documenti di Rossi» si manda a un collega con un link, e il tasto
   * Indietro torna dov'era. In un signal sarebbe un posto senza indirizzo.
   */
  private readonly parametri = toSignal(this.rotta.queryParamMap, { initialValue: undefined });

  protected readonly scheda = computed<Scheda>(() => {
    const valore = this.parametri()?.get('scheda');
    return valore === 'documenti' || valore === 'chat' ? valore : 'anagrafica';
  });

  protected apri(scheda: Scheda): void {
    void this.router.navigate([], {
      relativeTo: this.rotta,
      queryParams: { scheda: scheda === 'anagrafica' ? null : scheda },
      queryParamsHandling: 'merge',
    });
  }

  private readonly risorsa = httpResource<SchedaCliente>(() => this.api.urlCliente(this.id()));

  private readonly risorsaDocumenti = httpResource<Paginato<DocumentoPrivato>>(() =>
    this.apiDocumenti.urlElenco({ clienteId: this.id(), perPagina: 100 }),
  );

  protected readonly cliente = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : undefined,
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected readonly documenti = computed(() =>
    this.risorsaDocumenti.hasValue() ? this.risorsaDocumenti.value().elementi : [],
  );

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Clienti', percorso: '/clienti' },
    { etichetta: this.cliente()?.nome ?? '…' },
  ]);

  protected readonly tipi = [
    { valore: 'persona', etichetta: 'Persona' },
    { valore: 'azienda', etichetta: 'Azienda' },
  ];

  // --- L'anagrafica in modifica --------------------------------------------

  protected readonly nome = signal('');
  protected readonly tipo = signal<'persona' | 'azienda'>('persona');
  protected readonly codiceFiscale = signal('');
  protected readonly partitaIva = signal('');
  protected readonly email = signal('');
  protected readonly telefono = signal('');
  protected readonly indirizzo = signal('');
  protected readonly natoIl = signal('');
  protected readonly note = signal('');
  protected readonly etichette = signal<string[]>([]);
  protected readonly nuovoAlias = signal('');
  protected readonly salvataggio = signal(false);
  protected readonly avviso = signal<string | undefined>(undefined);

  /**
   * Il vocabolario delle etichette dei clienti, per la tendina: solo quelle
   * dei clienti, non quelle dei documenti, che sono un'altra classificazione.
   */
  private readonly risorsaEtichette = httpResource<EtichettaCliente[]>(() => this.api.urlEtichette());

  protected readonly vocabolarioEtichette = computed(() =>
    this.risorsaEtichette.hasValue() ? this.risorsaEtichette.value().map((e) => e.nome) : [],
  );

  private idCaricato = '';

  constructor() {
    /*
     * I campi si riempiono **una volta sola** per cliente: ricopiarli a ogni
     * ricarica vorrebbe dire cancellare sotto le mani quello che l'utente
     * sta scrivendo.
     */
    effect(() => {
      const c = this.cliente();
      if (!c || this.idCaricato === c.id) return;
      this.idCaricato = c.id;
      this.nome.set(c.nome);
      this.tipo.set(c.tipo);
      this.codiceFiscale.set(c.codiceFiscale ?? '');
      this.partitaIva.set(c.partitaIva ?? '');
      this.email.set(c.email ?? '');
      this.telefono.set(c.telefono ?? '');
      this.indirizzo.set(c.indirizzo ?? '');
      this.natoIl.set(c.natoIl ?? '');
      this.note.set(c.note ?? '');
      this.etichette.set([...c.etichette]);
    });

    /*
     * RF-B-05 anche qui: lo stato di elaborazione si aggiorna da solo finché
     * qualcosa è in lavorazione, e l'interrogazione si ferma quando tutto è
     * assestato. Senza, un documento pronto in venti secondi restava
     * «elaborazione» a video finché non si ricaricava la pagina.
     */
    effect((pulizia) => {
      if (this.scheda() !== 'documenti' || !this.inTransito()) return;
      const battito = setInterval(() => this.risorsaDocumenti.reload(), MS_INTERROGAZIONE);
      pulizia(() => clearInterval(battito));
    });

    /* Quando l'ultimo documento si assesta si rilegge la scheda: la
       classificazione può aver trovato una scadenza da mostrare
       nell'anagrafica. */
    let eraInTransito = false;
    effect(() => {
      const ora = this.inTransito();
      if (eraInTransito && !ora) untracked(() => this.risorsa.reload());
      eraInTransito = ora;
    });
  }

  protected readonly modificato = computed(() => {
    const c = this.cliente();
    if (!c) return false;
    return (
      this.nome().trim() !== c.nome ||
      this.tipo() !== c.tipo ||
      this.codiceFiscale().trim() !== (c.codiceFiscale ?? '') ||
      this.partitaIva().trim() !== (c.partitaIva ?? '') ||
      this.email().trim() !== (c.email ?? '') ||
      this.telefono().trim() !== (c.telefono ?? '') ||
      this.indirizzo().trim() !== (c.indirizzo ?? '') ||
      this.natoIl().trim() !== (c.natoIl ?? '') ||
      this.note().trim() !== (c.note ?? '') ||
      JSON.stringify(this.etichette()) !== JSON.stringify(c.etichette)
    );
  });

  /**
   * Un alias è una forma con cui il cliente compare **sui documenti**: si
   * impara da sé quando l'ingestion riconosce «ROSSI M.», e si aggiunge a
   * mano quando l'agenzia sa già che quella fattura arriva intestata
   * all'insegna invece che alla persona.
   */
  protected aggiungiAlias(): void {
    const a = this.nuovoAlias().trim();
    const c = this.cliente();
    if (!a || !c || c.alias.includes(a)) return;
    this.nuovoAlias.set('');
    this.api.modifica(c.id, { alias: [...c.alias, a] }).subscribe({
      next: () => this.risorsa.reload(),
    });
  }

  protected togliAlias(a: string): void {
    const c = this.cliente();
    if (!c) return;
    this.api.modifica(c.id, { alias: c.alias.filter((x) => x !== a) }).subscribe({
      next: () => this.risorsa.reload(),
    });
  }

  protected salva(): void {
    const c = this.cliente();
    if (!c || this.salvataggio()) return;
    this.salvataggio.set(true);
    this.avviso.set(undefined);
    this.api
      .modifica(c.id, {
        nome: this.nome().trim(),
        tipo: this.tipo(),
        codiceFiscale: this.codiceFiscale().trim() || null,
        partitaIva: this.partitaIva().trim() || null,
        email: this.email().trim() || null,
        telefono: this.telefono().trim() || null,
        indirizzo: this.indirizzo().trim() || null,
        natoIl: this.natoIl().trim() || null,
        note: this.note().trim() || null,
        etichette: this.etichette(),
      })
      .subscribe({
        next: () => {
          this.salvataggio.set(false);
          this.idCaricato = '';
          this.risorsa.reload();
          /* Un'etichetta creata qui entra nel vocabolario: al prossimo
             cliente la si trova nella tendina. */
          this.risorsaEtichette.reload();
        },
        error: (err: HttpErrorResponse) => {
          this.salvataggio.set(false);
          this.avviso.set((err.error as ErroreApi | null)?.messaggio ?? 'Salvataggio non riuscito.');
        },
      });
  }

  // --- I documenti ----------------------------------------------------------

  /**
   * Vero finché almeno un documento non si è assestato. È un booleano e non
   * l'elenco dei documenti in transito, come nell'archivio: un elenco
   * sarebbe un array nuovo a ogni risposta, e farebbe ripartire
   * l'interrogazione anche quando non è cambiato nulla.
   */
  protected readonly inTransito = computed(() =>
    this.documenti().some((d) => d.stato === 'in-coda' || d.stato === 'in-elaborazione'),
  );

  private progressivo = 0;
  private readonly vociInSalita = signal<FileInSalita[]>([]);

  /**
   * Le righe provvisorie da mostrare: una sparisce quando l'elenco contiene
   * i documenti che il suo caricamento ha creato, così quella vera prende il
   * suo posto senza un momento di vuoto in mezzo.
   */
  protected readonly inSalita = computed(() => {
    const presenti = new Set(this.documenti().map((d) => d.id));
    return this.vociInSalita().filter((v) => !v.creati?.every((id) => presenti.has(id)));
  });

  /**
   * Caricare dalla scheda intesta da sé: è il gesto per cui si è qui. Il
   * cliente viaggia insieme ai file e i documenti nascono già suoi.
   * Intestarli dopo, con una seconda richiesta, lasciava all'ingestion il
   * tempo di leggerli senza cliente e di cercarne uno per conto suo.
   */
  protected carica(file: File[]): void {
    if (!file.length) return;
    const lotto = file.map((f) => ({ chiave: ++this.progressivo, nome: f.name, percentuale: 0 }));
    const chiavi = new Set(lotto.map((v) => v.chiave));
    const aggiorna = (modifica: (v: FileInSalita) => FileInSalita) =>
      this.vociInSalita.update((voci) => voci.map((v) => (chiavi.has(v.chiave) ? modifica(v) : v)));

    /* Le righe dei caricamenti di prima che hanno già ceduto il posto si
       tolgono qui, invece di accumularsi. */
    const ancoraVisibili = new Set(this.inSalita());
    this.vociInSalita.update((voci) => [...lotto, ...voci.filter((v) => ancoraVisibili.has(v))]);

    this.apiDocumenti.carica(file, { clienteId: this.id() }).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          const percentuale = Math.round((evento.loaded / evento.total) * 100);
          aggiorna((v) => ({ ...v, percentuale }));
        }
        if (evento.type === HttpEventType.Response) {
          const creati = (evento.body?.creati ?? []).map((d) => d.id);
          aggiorna((v) => ({ ...v, percentuale: 100, creati }));
          this.risorsaDocumenti.reload();
          this.risorsa.reload();
        }
      },
      error: (err: HttpErrorResponse) => {
        const errore = (err.error as ErroreApi | null)?.messaggio ?? 'Caricamento non riuscito.';
        aggiorna((v) => ({ ...v, errore }));
      },
    });
  }

  /** La riga di un caricamento rifiutato si toglie a mano: il motivo va letto, non deve sparire da solo. */
  protected togliDallaSalita(voce: FileInSalita): void {
    this.vociInSalita.update((voci) => voci.filter((v) => v.chiave !== voce.chiave));
  }

  /** Finché i byte salgono si dice quanto manca; dopo, il server sta salvando. */
  protected statoSalita(voce: FileInSalita): string {
    return voce.percentuale < 100 ? `${voce.percentuale}%` : 'in arrivo';
  }

  /*
   * Le azioni su un documento stanno dietro un menù: un «Non è suo» scritto
   * sulla riga, accanto alle etichette, si leggeva come un'etichetta. Un
   * menù per la schermata, non uno per riga.
   */
  private readonly menu = viewChild<MenuAzioni>('menuDocumento');
  protected readonly vociMenu = signal<VoceMenu[]>([]);

  protected apriMenu(evento: Event, documento: DocumentoPrivato): void {
    const nome = this.cliente()?.nome ?? 'questo cliente';
    this.vociMenu.set([
      /* Una proposta dell'ingestion si conferma da dove la si sta guardando. */
      ...(documento.clienteDaConfermare
        ? [{ etichetta: `Confermalo a ${nome}`, azione: () => this.confermaDocumento(documento) }]
        : []),
      /* Senza dettaglio a destra: accanto a un nome lungo mandava la voce a
         capo e il menù contro il bordo dello schermo. «Togli da» basta a non
         confonderla con un'eliminazione. */
      { etichetta: `Togli da ${nome}`, azione: () => this.staccaDocumento(documento) },
    ]);
    this.menu()?.apri(evento);
  }

  private confermaDocumento(documento: DocumentoPrivato): void {
    this.apiDocumenti.assegna({ documenti: [documento.id], confermaCliente: true }).subscribe({
      next: () => this.risorsaDocumenti.reload(),
    });
  }

  private staccaDocumento(documento: DocumentoPrivato): void {
    this.apiDocumenti.modifica(documento.id, { clienteId: null }).subscribe({
      next: () => {
        this.risorsaDocumenti.reload();
        this.risorsa.reload();
      },
    });
  }

  // --- Le chat --------------------------------------------------------------

  /* L'indirizzo lo dà l'API, non si scrive qui: in produzione l'app sta su
     un host e il backend su un altro, e un `/api/...` relativo finisce sul
     sito statico, che risponde 200 con l'index.html. Nessun errore di rete,
     solo un JSON che non si lascia leggere: la pagina si riempie lo stesso e
     intanto esce un avviso che non si riesce a spiegare. */
  private readonly risorsaChat = httpResource<ChatCliente[]>(() => this.apiChat.urlElenco());

  /** Solo le sue: l'elenco generale sta nella sua sezione. */
  protected readonly chat = computed(() =>
    (this.risorsaChat.hasValue() ? this.risorsaChat.value() : []).filter(
      (c) => c.clienteId === this.id(),
    ),
  );

  /**
   * Aprire una chat si fa da qui, dove il cliente si sa già: nella sezione
   * delle chat bisognerebbe ritrovarlo in una tendina, e il gesto nasce
   * quasi sempre mentre si sta guardando lui.
   */
  protected readonly inCreazioneChat = signal(false);

  protected async apriChat(idChat: string): Promise<void> {
    this.inCreazioneChat.set(false);
    this.risorsaChat.reload();
    await this.router.navigate(['/chat-clienti', idChat]);
  }

  // --- Eliminazione ---------------------------------------------------------

  protected async elimina(): Promise<void> {
    const c = this.cliente();
    if (!c) return;
    const quanti = c.documenti;
    const conferma = await this.conferme.chiedi({
      titolo: `Eliminare ${c.nome}?`,
      dettaglio: quanti
        ? `Ha ${quanti} ${quanti === 1 ? 'documento' : 'documenti'}: restano in archivio, senza cliente. Le sue chat e i loro collegamenti spariscono.`
        : 'Le sue chat e i loro collegamenti spariscono. Non si torna indietro.',
      conferma: 'Elimina',
      tono: 'pericolo',
    });
    if (!conferma) return;
    this.eliminaCon('senza-cliente');
  }

  /**
   * Portarsi via anche i documenti è un'altra domanda, e va fatta a parte:
   * sono due gesti diversi, e uno dei due non si può disfare.
   */
  protected async eliminaTutto(): Promise<void> {
    const c = this.cliente();
    if (!c) return;
    const conferma = await this.conferme.chiedi({
      titolo: `Eliminare ${c.nome} e i suoi ${c.documenti} documenti?`,
      dettaglio:
        'I documenti spariscono davvero, con i loro file: le citazioni che li richiamano resteranno senza fonte. Non si torna indietro.',
      conferma: 'Elimina tutto',
      tono: 'pericolo',
    });
    if (!conferma) return;
    this.eliminaCon('elimina');
  }

  private eliminaCon(documenti: DestinazioneDocumenti): void {
    this.api.elimina(this.id(), documenti).subscribe({
      next: () => void this.router.navigate(['/clienti']),
    });
  }

  protected riprova(): void {
    this.risorsa.reload();
  }

  /** Per il template: il cliente come entità, quando serve solo il nome. */
  protected nomeDi(c: Cliente | undefined): string {
    return c?.nome ?? '';
  }
}
