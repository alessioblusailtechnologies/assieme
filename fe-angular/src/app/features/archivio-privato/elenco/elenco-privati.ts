import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ArchivioPrivatoStore } from '../archivio-privato-store';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaStato } from './celle/cella-stato';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { Icona } from '@shared/ui/icona/icona';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import {
  Cartella,
  ESTENSIONI_DOCUMENTO,
  FORMATI_DOCUMENTO,
  StatoElaborazione,
  TipologiaDocumento,
} from '@core/models';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { dimensioneLeggibile } from '@shared/testi/misura';

const STATI: { valore: StatoElaborazione; etichetta: string }[] = [
  { valore: 'pronto', etichetta: 'Pronti' },
  { valore: 'in-elaborazione', etichetta: 'In elaborazione' },
  { valore: 'in-coda', etichetta: 'In coda' },
  { valore: 'errore', etichetta: 'Non leggibili' },
];

const TIPOLOGIE_PRIVATE: { valore: TipologiaDocumento; etichetta: string }[] = [
  { valore: 'preventivo', etichetta: 'Preventivo' },
  { valore: 'polizza', etichetta: 'Polizza' },
  { valore: 'appendice', etichetta: 'Appendice' },
  { valore: 'convenzione', etichetta: 'Convenzione' },
  { valore: 'nota-tecnica', etichetta: 'Nota tecnica' },
  { valore: 'altro', etichetta: 'Altro' },
];

/**
 * Archivio Privato — la schermata.
 *
 * È un **gestore di file**, non una tabella di dati: si entra nelle
 * cartelle, si guarda cosa contengono, si trascina dentro roba. Le cartelle
 * sono schede in griglia, i documenti un elenco (o una griglia, a scelta), e
 * il titolo dice sempre dove sei.
 *
 * La differenza rispetto all'archivio pubblico resta quella di sempre: qui
 * si scrive. Ne discendono lo stato di elaborazione su ogni riga (RF-B-05) e
 * il fatto che tutta la pagina sia area di rilascio.
 */
@Component({
  selector: 'app-elenco-privati',
  imports: [
    Bottone,
    Briciole,
    Campo,
    CellaStato,
    Checkbox,
    DatePipe,
    Icona,
    MenuAzioni,
    Paginazione,
    RouterLink,
    Scheletro,
    Select,
    StatoVuoto,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-privati.html',
  styleUrl: './elenco-privati.scss',
})
export class ElencoPrivati {
  protected readonly store = inject(ArchivioPrivatoStore);

  protected readonly stati = STATI;
  protected readonly estensioni = ESTENSIONI_DOCUMENTO;
  protected readonly formati = FORMATI_DOCUMENTO;
  protected readonly tipologie = TIPOLOGIE_PRIVATE;

  protected readonly documenti = computed(() => this.store.documenti());

  /** Quanti file stanno salendo e a che punto sono, in una cifra sola. */
  protected readonly caricamento = computed(() => {
    const inCorso = this.store.coda().filter((v) => v.stato === 'in-corso');
    if (!inCorso.length) return undefined;
    const somma = inCorso.reduce((s, v) => s + v.percentuale, 0);
    return { conteggio: inCorso.length, percentuale: Math.round(somma / inCorso.length) };
  });

  /**
   * RF-B-08: quanto pesa l'archivio, accanto al conteggio. Il limite serve
   * solo alla misura massima del singolo file.
   */
  protected readonly spazio = computed(() => {
    const s = this.store.spazio();
    if (!s) return undefined;
    return {
      usato: dimensioneLeggibile(s.usatoByte),
      /* Si accende solo quando il problema è vicino: un indicatore sempre
         colorato smette di essere un segnale. */
      inEsaurimento: s.usatoByte / s.limiteByte >= 0.8,
      limiteFileByte: s.limiteFileByte,
    };
  });

  // --- Dove sei -------------------------------------------------------------

  /**
   * Le briciole raccontano la discesa nell'albero, non solo la sezione: in un
   * gestore di file è così che si risale, ed è l'unico modo di uscire da una
   * cartella profonda senza tornare in cima.
   */
  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Archivio privato' },
  ];

  /**
   * La barra del percorso: dove si è **dentro l'archivio**, e come risalire.
   *
   * Sta accanto alle cartelle e non in cima alla pagina perché è navigazione
   * dell'archivio, non dell'applicazione: le briciole lassù dicono in che
   * schermata sei, questa dice in che cartella. Ogni tappa tranne l'ultima è
   * un collegamento vero con i suoi parametri — è la querystring a dire dove
   * si sta guardando, quindi il tasto Indietro risale l'albero.
   */
  protected readonly percorso = computed<VoceBriciola[]>(() => {
    const tappe: VoceBriciola[] = [
      {
        etichetta: "Archivio",
        percorso: '/archivio/privato',
        parametri: { cartella: null, vista: null },
      },
    ];
    if (this.store.daSistemare()) return [...tappe, { etichetta: 'Da sistemare' }];
    for (const c of this.store.catenaCartelle()) {
      tappe.push({
        etichetta: c.nome,
        percorso: '/archivio/privato',
        parametri: { cartella: c.id, vista: null },
      });
    }
    return tappe;
  });

  /** Alla radice dell'archivio, cioè fuori da ogni cartella e da «Da sistemare». */
  protected readonly allaRadice = computed(
    () => !this.store.cartellaCorrente() && !this.store.daSistemare(),
  );

  protected readonly titoloVista = computed(() => {
    if (this.store.daSistemare()) return 'Da sistemare';
    return this.store.cartellaCorrente()?.nome ?? 'Archivio privato';
  });

  /** Le cartelle da mostrare come schede: quelle dentro dove sei. */
  protected readonly sottoCartelle = computed<Cartella[]>(() => {
    if (this.store.daSistemare()) return [];
    const corrente = this.store.cartellaCorrente();
    return corrente ? corrente.figli : this.store.albero();
  });

  /* «Da sistemare» è una scheda solo alla radice: dentro una cartella non
     vuol dire niente, e quando ci si è dentro ci si è già. */
  protected readonly daSistemareVisibile = computed(
    () => !this.store.cartellaCorrente() && this.store.quantiDaSistemare() > 0,
  );

  /**
   * La cartella di provenienza si mostra solo dove aggiunge qualcosa. Dentro
   * una cartella ripeterebbe a ogni riga quello che dice già il titolo.
   */
  protected readonly mostraPercorso = computed(
    () => !this.store.daSistemare() && !this.store.cartella(),
  );

  /** «Clienti/Rossi Mario/Auto/Preventivi» → «Preventivi». */
  protected ultimoSegmento(percorso: string): string {
    return percorso.split('/').pop() ?? percorso;
  }

  protected readonly statoVuoto = computed(() => {
    if (this.store.filtriAttivi()) {
      return {
        titolo: 'Nessun documento con questi criteri',
        descrizione: 'Prova ad allargare la ricerca togliendo un filtro.',
      };
    }
    if (this.store.daSistemare()) {
      return {
        titolo: 'Niente da sistemare',
        descrizione:
          'Ogni documento dell’archivio ha una sua cartella. È il momento in cui questa schermata serve di meno, ed è una buona notizia.',
      };
    }
    if (this.store.cartellaCorrente()) {
      return {
        titolo: 'Cartella vuota',
        descrizione:
          'Trascina qui dei documenti, oppure spostane da un’altra cartella dalla loro scheda.',
      };
    }
    return {
      titolo: 'Archivio vuoto',
      descrizione:
        'Trascina qui i primi documenti. Puoi portare la cartella intera dell’agenzia, o uno zip: i percorsi si conservano e diventano l’albero.',
    };
  });

  // --- Modo di visualizzazione e filtri -------------------------------------

  protected readonly modo = signal<'elenco' | 'griglia'>('elenco');

  /* I filtri stanno chiusi finché non servono: nel lavoro di tutti i giorni
     si cerca per nome, e il numero accanto dice quanti ne sono attivi senza
     bisogno di aprirli. */
  protected readonly filtriAperti = signal(false);
  protected readonly quantiFiltri = computed(
    () =>
      (this.store.tipologia() ? 1 : 0) +
      (this.store.stato() ? 1 : 0) +
      (this.store.etichetta() ? 1 : 0) +
      (this.store.soloRiferimenti() ? 1 : 0),
  );

  // --- Cartelle -------------------------------------------------------------

  protected readonly nuovoNome = signal('');
  protected readonly creando = signal(false);
  /**
   * L'avviso sul quasi-doppione. Non è un errore da mostrare e basta: porta
   * con sé la seconda possibilità, perché «Preventivi 2026» accanto a
   * «Preventivi» è legittimo e nessuno deve restare bloccato.
   */
  protected readonly avvisoSimile = signal<string | undefined>(undefined);

  // --- Le azioni su una cartella qualunque ----------------------------------

  /*
   * Rinominare, spostare ed eliminare valgono per **qualunque** cartella
   * dell'albero, non solo per quella in cui si è entrati: prima bisognava
   * aprire una cartella per poterla toccare, e per spostarla non c'era
   * proprio modo. Il menù della riga apre qui, e il modulo compare sotto
   * l'albero invece che in una finestra: si vede la cartella mentre la si
   * cambia.
   */
  protected readonly cartellaInAzione = signal<Cartella | undefined>(undefined);
  protected readonly azione = signal<'rinomina' | 'sposta' | 'elimina' | undefined>(undefined);

  private readonly menu = viewChild.required<MenuAzioni>('menuCartella');

  protected readonly vociCartella: VoceMenu[] = [
    { etichetta: 'Rinomina', azione: () => this.azione.set('rinomina') },
    { etichetta: 'Sposta in…', azione: () => this.azione.set('sposta') },
    { etichetta: 'Elimina', azione: () => this.azione.set('elimina') },
  ];

  protected apriAzioni({ cartella, evento }: { cartella: Cartella; evento: Event }): void {
    this.cartellaInAzione.set(cartella);
    this.azione.set(undefined);
    this.nomeInModifica.set(cartella.nome);
    this.menu().apri(evento);
  }

  protected chiudiAzione(): void {
    this.azione.set(undefined);
    this.cartellaInAzione.set(undefined);
  }

  /**
   * Le destinazioni possibili di uno spostamento: tutte le cartelle tranne
   * sé stessa e la propria discendenza — spostare una cartella dentro un
   * proprio figlio taglierebbe via il ramo dall'albero — più la radice.
   */
  protected readonly destinazioni = computed<{ id: string; percorso: string }[]>(() => {
    const cartella = this.cartellaInAzione();
    if (!cartella) return [];
    const per = new Map(this.store.cartelleInPiano().map((c) => [c.id, c]));
    const dentro = (id: string): boolean => {
      const visti = new Set<string>();
      let corrente: string | undefined = id;
      while (corrente && !visti.has(corrente)) {
        if (corrente === cartella.id) return true;
        visti.add(corrente);
        corrente = per.get(corrente)?.parentId;
      }
      return false;
    };
    return [
      { id: '', percorso: '— In cima all’archivio' },
      ...this.store
        .cartelleInPiano()
        .filter((c) => !dentro(c.id) && c.id !== cartella.parentId)
        .map((c) => ({ id: c.id, percorso: c.percorso }))
        .sort((a, b) => a.percorso.localeCompare(b.percorso)),
    ];
  });

  protected readonly destinazione = signal<string | undefined>(undefined);

  protected confermaSpostamento(): void {
    const cartella = this.cartellaInAzione();
    const dove = this.destinazione();
    if (cartella && dove !== undefined) {
      this.store.modificaCartella(cartella.id, { parentId: dove || null });
    }
    this.destinazione.set(undefined);
    this.chiudiAzione();
  }

  protected readonly nomeInModifica = signal('');

  /*
   * Il fuoco nel campo appena la scheda della cartella nuova compare. Non con
   * `autofocus` — che il progetto vieta perché sposta il fuoco anche quando
   * la pagina si apre da sola — ma solo qui, dove il campo nasce da un gesto
   * di chi ha appena detto di volerci scrivere.
   */
  private readonly campoNuovaCartella =
    viewChild<ElementRef<HTMLInputElement>>('campoNuovaCartella');

  constructor() {
    effect(() => this.campoNuovaCartella()?.nativeElement.focus());
  }

  protected apriModuloCartella(): void {
    this.creando.set(true);
    this.nuovoNome.set('');
    this.avvisoSimile.set(undefined);
  }

  protected annullaModuloCartella(): void {
    this.creando.set(false);
    this.avvisoSimile.set(undefined);
  }

  /**
   * La cartella nuova nasce dentro quella aperta: è quello che ci si aspetta
   * quando si sta guardando «Clienti» e si crea qualcosa.
   */
  protected creaCartella(consentiSimile = false): void {
    const nome = this.nuovoNome().trim();
    if (!nome) return;
    const dentro = this.store.cartella();
    this.store.creaCartella(
      { nome, parentId: dentro ?? null, ...(consentiSimile && { consentiSimile: true }) },
      {
        fatto: () => this.annullaModuloCartella(),
        errore: (errore) => {
          /* Il quasi-doppione non chiude il modulo: il nome resta lì, con
             accanto la seconda possibilità. */
          if (errore?.codice === 'CARTELLA_SIMILE') {
            this.avvisoSimile.set(errore.messaggio);
            return;
          }
          this.annullaModuloCartella();
        },
      },
    );
  }

  protected confermaRinomina(): void {
    const cartella = this.cartellaInAzione();
    const nome = this.nomeInModifica().trim();
    if (cartella && nome && nome !== cartella.nome) {
      this.store.modificaCartella(cartella.id, { nome });
    }
    this.chiudiAzione();
  }

  /**
   * Eliminare dice sempre che fine fanno i documenti dentro: una cartella che
   * sparisce portandosi via quello che aveva è il modo in cui si perde roba.
   */
  protected eliminaCartella(destinazione: 'da-sistemare' | 'al-padre'): void {
    const cartella = this.cartellaInAzione();
    if (cartella) this.store.eliminaCartella(cartella.id, destinazione);
    this.chiudiAzione();
  }
}
