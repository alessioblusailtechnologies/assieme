import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { CodaCaricamento } from '@shared/caricamento/coda-caricamento';
import { ConfermeStore } from '@core/conferme/conferme-store';
import {
  AmbitoIstruzione,
  DocumentoRiferimento,
  ESTENSIONI_DOCUMENTO,
  FORMATI_DOCUMENTO,
  RegolaIstruzione,
} from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { IstruzioniStore } from './istruzioni-store';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Avviso } from '@shared/ui/avviso/avviso';
import { EtichettaStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { Tag } from '@shared/ui/tag/tag';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { codificaAmbito, decodificaAmbito, etichettaAmbito, opzioniAmbito } from './ambito';
import { dimensioneLeggibile } from '@shared/testi/misura';

type Scheda = 'regole' | 'riferimenti';
type StatoFiltro = 'attivo' | 'sospeso';

/**
 * Istruzioni personalizzate — il cuore del DNA d'Agenzia (RF-D-04…D-16).
 *
 * Due schede, due nature: le **regole** dicono come giudicare, i
 * **documenti di riferimento** danno fonti citabili. La riga di guida in
 * testa esiste per una ragione precisa: è il modo più economico di evitare
 * che lo stesso contenuto finisca in entrambi i posti.
 *
 * Dal 14/09/2026 le due schede sono tabelle come gli altri elenchi, con i
 * filtri nel riquadro e le azioni di riga in un menù: le schede a riquadri,
 * con la casella «attiva» e i pulsanti su ogni voce, erano l'ultimo elenco
 * delle impostazioni fatto a modo suo.
 *
 * Il governo è dell'amministratore (RF-D-15); l'operatore vede tutto in
 * lettura — sapere quali regole condizionano le risposte non è un
 * privilegio, è trasparenza.
 */
@Component({
  selector: 'app-istruzioni',
  providers: [IstruzioniStore],
  imports: [
    Avviso,
    Bottone,
    Campo,
    Cassetto,
    CodaCaricamento,
    DatePipe,
    EtichettaStato,
    Icona,
    MenuAzioni,
    NgTemplateOutlet,
    Scheletro,
    Select,
    StatoVuoto,
    Tag,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './istruzioni.html',
  styleUrl: './istruzioni.scss',
})
export class Istruzioni {
  protected readonly store = inject(IstruzioniStore);
  private readonly conferme = inject(ConfermeStore);
  private readonly router = inject(Router);

  /* Gli stessi formati dell'archivio: un riferimento è un documento privato con un ruolo in più. */
  protected readonly estensioni = ESTENSIONI_DOCUMENTO;
  protected readonly formati = FORMATI_DOCUMENTO;

  protected readonly scheda = signal<Scheda>('regole');

  protected readonly opzioni = computed(() =>
    opzioniAmbito(this.store.rami(), this.store.compagnie()),
  );

  protected ambito(regolaODocumento: RegolaIstruzione | DocumentoRiferimento): string {
    return etichettaAmbito(regolaODocumento.ambito, this.store.rami(), this.store.compagnie());
  }

  protected misura(byte: number): string {
    return dimensioneLeggibile(byte);
  }

  /**
   * Le schede non condividono i filtri: gli ambiti di una non sono quelli
   * dell'altra, e ritrovarsi su «Documenti» con un filtro messo sulle regole
   * vorrebbe dire guardare un elenco vuoto senza capire perché.
   */
  protected cambiaScheda(scheda: Scheda): void {
    this.scheda.set(scheda);
    this.azzeraFiltri();
  }

  // --- Filtri ---------------------------------------------------------------

  /*
   * Si filtra sul client: regole e riferimenti di un'agenzia sono decine,
   * non migliaia, e arrivano già tutti con la prima richiesta.
   */
  protected readonly ricerca = signal('');
  protected readonly filtroAmbito = signal<string | undefined>(undefined);
  protected readonly filtroStato = signal<StatoFiltro | undefined>(undefined);

  protected readonly filtriAttivi = computed(
    () => !!this.ricerca().trim() || !!this.filtroAmbito() || !!this.filtroStato(),
  );

  protected azzeraFiltri(): void {
    this.ricerca.set('');
    this.filtroAmbito.set(undefined);
    this.filtroStato.set(undefined);
  }

  /* Regole al femminile, documenti al maschile. */
  protected readonly opzioniStato = computed(() =>
    this.scheda() === 'regole'
      ? [
          { valore: 'attivo', etichetta: 'Attive' },
          { valore: 'sospeso', etichetta: 'Sospese' },
        ]
      : [
          { valore: 'attivo', etichetta: 'Attivi' },
          { valore: 'sospeso', etichetta: 'Sospesi' },
        ],
  );

  /**
   * Gli ambiti del filtro sono quelli **in uso** nella scheda, non tutta la
   * tassonomia: una tendina con cento compagnie per trovarne due è una
   * ricerca, non un filtro.
   */
  protected readonly opzioniAmbitoFiltro = computed(() => {
    const voci = this.scheda() === 'regole' ? this.store.regole() : this.store.riferimenti();
    const inUso = new Map<string, string>();
    for (const voce of voci) inUso.set(codificaAmbito(voce.ambito), this.ambito(voce));
    return [...inUso]
      .map(([valore, etichetta]) => ({ valore, etichetta }))
      .sort((a, b) =>
        a.valore === 'generale'
          ? -1
          : b.valore === 'generale'
            ? 1
            : a.etichetta.localeCompare(b.etichetta, 'it'),
      );
  });

  protected readonly regoleFiltrate = computed(() =>
    this.store.regole().filter((r) => this.passa(r.ambito, r.attiva, `${r.titolo} ${r.testo}`)),
  );

  protected readonly riferimentiFiltrati = computed(() =>
    this.store.riferimenti().filter((r) => this.passa(r.ambito, r.attivo, r.titolo)),
  );

  private passa(ambito: AmbitoIstruzione, attivo: boolean, testo: string): boolean {
    const cerca = this.ricerca().trim().toLocaleLowerCase('it');
    if (cerca && !testo.toLocaleLowerCase('it').includes(cerca)) return false;
    const scelto = this.filtroAmbito();
    if (scelto && codificaAmbito(ambito) !== scelto) return false;
    const stato = this.filtroStato();
    return !stato || (stato === 'attivo') === attivo;
  }

  // --- Azioni di riga ---------------------------------------------------------

  /* Un menù per schermata, non uno per riga: si apre accanto al pulsante premuto. */
  private readonly menu = viewChild<MenuAzioni>('menu');
  protected readonly vociMenu = signal<VoceMenu[]>([]);

  /** Tutta la riga apre la regola: mirare ai tre puntini in fondo è mira di precisione. */
  protected apriRigaRegola(regola: RegolaIstruzione): void {
    if (this.store.puoGestire()) this.apriModificaRegola(regola);
  }

  protected apriMenuRegola(evento: Event, regola: RegolaIstruzione): void {
    evento.stopPropagation();
    this.vociMenu.set([
      { etichetta: 'Modifica', azione: () => this.apriModificaRegola(regola) },
      {
        etichetta: regola.attiva ? 'Sospendi' : 'Riattiva',
        azione: () => this.store.modificaRegola(regola.id, { attiva: !regola.attiva }),
      },
      { etichetta: 'Elimina', azione: () => void this.eliminaRegola(regola) },
    ]);
    this.menu()?.apri(evento);
  }

  protected apriMenuRiferimento(evento: Event, riferimento: DocumentoRiferimento): void {
    const origine = riferimento.documentoPrivatoId;
    this.vociMenu.set([
      ...(origine
        ? [
            {
              etichetta: 'Apri nell’Archivio Privato',
              azione: () => void this.router.navigate(['/archivio/privato', origine]),
            },
          ]
        : []),
      { etichetta: 'Cambia ambito', azione: () => this.apriAmbitoRiferimento(riferimento) },
      {
        etichetta: riferimento.attivo ? 'Sospendi' : 'Riattiva',
        azione: () =>
          this.store.modificaRiferimento(riferimento.id, { attivo: !riferimento.attivo }),
      },
      {
        etichetta: origine ? 'Togli il ruolo' : 'Elimina',
        azione: () => void this.eliminaRiferimento(riferimento),
      },
    ]);
    this.menu()?.apri(evento);
  }

  // --- Caricamento dei riferimenti -------------------------------------------

  private readonly zona = viewChild(ZonaCaricamento);

  protected apriCaricamento(): void {
    this.zona()?.apriFinestra();
  }

  // --- Form regola (creazione e modifica nello stesso cassetto) -----------

  protected readonly cassettoRegola = signal(false);
  protected readonly regolaInModifica = signal<RegolaIstruzione | undefined>(undefined);
  protected readonly bozzaTitolo = signal('');
  protected readonly bozzaTesto = signal('');
  protected readonly bozzaAmbito = signal('generale');
  protected readonly inSalvataggio = signal(false);

  protected apriNuovaRegola(): void {
    this.regolaInModifica.set(undefined);
    this.bozzaTitolo.set('');
    this.bozzaTesto.set('');
    this.bozzaAmbito.set('generale');
    this.cassettoRegola.set(true);
  }

  protected apriModificaRegola(regola: RegolaIstruzione): void {
    this.regolaInModifica.set(regola);
    this.bozzaTitolo.set(regola.titolo);
    this.bozzaTesto.set(regola.testo);
    this.bozzaAmbito.set(codificaAmbito(regola.ambito));
    this.cassettoRegola.set(true);
  }

  protected readonly bozzaValida = computed(
    () => !!this.bozzaTitolo().trim() && !!this.bozzaTesto().trim(),
  );

  protected salvaRegola(): void {
    if (!this.bozzaValida() || this.inSalvataggio()) return;
    this.inSalvataggio.set(true);

    const dati = {
      titolo: this.bozzaTitolo().trim(),
      testo: this.bozzaTesto().trim(),
      ambito: decodificaAmbito(this.bozzaAmbito()),
    };
    const chiudi = () => {
      this.inSalvataggio.set(false);
      this.cassettoRegola.set(false);
    };

    const inModifica = this.regolaInModifica();
    if (inModifica) this.store.modificaRegola(inModifica.id, dati, chiudi);
    else this.store.creaRegola(dati, chiudi);
  }

  // --- Ambito di un riferimento ---------------------------------------------

  /*
   * L'ambito di un documento si cambia in un cassetto e non con una tendina
   * nella cella: dentro il contenitore della tabella, che scorre, l'elenco
   * della tendina restava tagliato al bordo.
   */
  protected readonly cassettoRiferimento = signal(false);
  protected readonly riferimentoInModifica = signal<DocumentoRiferimento | undefined>(undefined);
  protected readonly bozzaAmbitoRiferimento = signal('generale');

  protected apriAmbitoRiferimento(riferimento: DocumentoRiferimento): void {
    this.riferimentoInModifica.set(riferimento);
    this.bozzaAmbitoRiferimento.set(codificaAmbito(riferimento.ambito));
    this.cassettoRiferimento.set(true);
  }

  protected salvaAmbitoRiferimento(): void {
    const riferimento = this.riferimentoInModifica();
    if (riferimento) {
      this.store.modificaRiferimento(riferimento.id, {
        ambito: decodificaAmbito(this.bozzaAmbitoRiferimento()),
      });
    }
    this.cassettoRiferimento.set(false);
  }

  // --- Eliminazioni ---------------------------------------------------------

  protected async eliminaRegola(regola: RegolaIstruzione): Promise<void> {
    const conferma = await this.conferme.chiedi({
      titolo: `Eliminare «${regola.titolo}»?`,
      dettaglio: 'La regola smette di valere su ogni risposta. Non si torna indietro.',
    });
    if (conferma) this.store.eliminaRegola(regola.id);
  }

  /**
   * Un riferimento nato dall'Archivio Privato **si toglie**, non si elimina:
   * il documento resta dov'è, perde solo il ruolo. Dirlo con la stessa
   * parola dell'eliminazione farebbe rinunciare a un gesto innocuo.
   */
  protected async eliminaRiferimento(riferimento: DocumentoRiferimento): Promise<void> {
    const dallArchivio = Boolean(riferimento.documentoPrivatoId);
    const conferma = await this.conferme.chiedi({
      titolo: dallArchivio
        ? `Togliere il ruolo a «${riferimento.titolo}»?`
        : `Eliminare «${riferimento.titolo}»?`,
      dettaglio: dallArchivio
        ? 'Il documento resta nell’Archivio Privato: smette soltanto di essere un riferimento permanente.'
        : 'Il documento smette di accompagnare ogni risposta e sparisce dalle istruzioni. Non si torna indietro.',
      conferma: dallArchivio ? 'Togli il ruolo' : 'Elimina',
    });
    if (conferma) this.store.eliminaRiferimento(riferimento.id);
  }
}
