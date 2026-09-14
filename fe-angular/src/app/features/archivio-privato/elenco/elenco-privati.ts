import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ArchivioPrivatoStore } from '../archivio-privato-store';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaApri } from '@shared/griglia/cella-apri';
import { CellaStato } from './celle/cella-stato';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { Icona } from '@shared/ui/icona/icona';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import {
  ESTENSIONI_DOCUMENTO,
  FORMATI_DOCUMENTO,
  Id,
  StatoElaborazione,
  TipologiaDocumento,
} from '@core/models';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { dimensioneLeggibile } from '@shared/testi/misura';
import { etichettaTipologia } from '@shared/testi/etichette';

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
 * Dal 12/09/2026 (`PIANO-CLIENTI.md`) non è più un gestore di file: l'albero
 * delle cartelle non c'è, e l'archivio è **un elenco solo** con le sue
 * faccette — cliente, tipologia, etichette, stato. Si cerca, non si naviga.
 *
 * Dal 14/09/2026 è una tabella come gli altri elenchi, con i filtri sempre
 * in vista. Via la vista a griglia e le caselle di selezione con il lavoro
 * in blocco: il cliente proposto si conferma dalla scheda del documento.
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
    CellaApri,
    CellaStato,
    Checkbox,
    DatePipe,
    FormsModule,
    Icona,
    Paginazione,
    Scheletro,
    Select,
    StatoVuoto,
    Tag,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-privati.html',
  styleUrl: './elenco-privati.scss',
})
export class ElencoPrivati {
  protected readonly store = inject(ArchivioPrivatoStore);
  private readonly conferme = inject(ConfermeStore);
  private readonly router = inject(Router);

  protected readonly stati = STATI;
  protected readonly estensioni = ESTENSIONI_DOCUMENTO;
  protected readonly formati = FORMATI_DOCUMENTO;
  protected readonly tipologie = TIPOLOGIE_PRIVATE;
  protected readonly etichettaTipologia = etichettaTipologia;

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

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Archivio privato' },
  ];

  /**
   * Il titolo (nascosto, per chi naviga per intestazioni) dice che cosa si
   * sta guardando: tutto l'archivio, i documenti di un cliente, quelli che
   * un cliente non ce l'hanno, o la coda delle proposte da confermare.
   */
  protected readonly titoloVista = computed(() => {
    if (this.store.senzaCliente()) return 'Senza cliente';
    if (this.store.daConfermare()) return 'Da confermare';
    return this.store.clienteCorrente()?.nome ?? 'Archivio privato';
  });

  /** Fuori da ogni filtro di cliente: il conteggio è quello dell'archivio intero. */
  protected readonly suTutto = computed(
    () => !this.store.cliente() && !this.store.senzaCliente() && !this.store.daConfermare(),
  );

  /** Le opzioni della tendina dei clienti, con «senza cliente» in coda. */
  protected readonly opzioniCliente = computed(() => [
    ...this.store.clienti().map((c) => ({ valore: c.id, etichetta: c.nome })),
    { valore: 'senza-cliente', etichetta: 'Senza cliente' },
  ]);

  /** Quello che la tendina mostra come scelto: il cliente, o la vista. */
  protected readonly clienteScelto = computed(() =>
    this.store.senzaCliente() ? 'senza-cliente' : this.store.cliente(),
  );

  protected scegliCliente(valore: string | undefined): void {
    if (valore === 'senza-cliente') void this.store.apriSenzaCliente();
    else void this.store.apri(valore);
  }

  /** Tutta la riga apre il documento: mirare al solo pulsante in fondo è mira di precisione. */
  protected apri(id: Id): void {
    void this.router.navigate(['/archivio/privato', id]);
  }

  // --- Le etichette come vocabolario ---------------------------------------

  /*
   * Rinominare ed eliminare un'etichetta si fanno **da dentro il filtro**:
   * si è appena visto che cosa contiene, e si agisce lì. Una schermata di
   * gestione a parte vorrebbe dire cambiare il nome di un'etichetta senza
   * avere sotto gli occhi i documenti che la portano.
   */
  protected readonly rinominando = signal(false);
  protected readonly nomeEtichetta = signal('');

  protected apriRinomina(): void {
    this.nomeEtichetta.set(this.store.etichetta() ?? '');
    this.rinominando.set(true);
  }

  protected confermaRinomina(): void {
    const vecchia = this.store.etichetta();
    if (vecchia) this.store.rinominaEtichetta(vecchia, this.nomeEtichetta());
    this.rinominando.set(false);
  }

  protected async eliminaEtichetta(): Promise<void> {
    const nome = this.store.etichetta();
    if (!nome) return;
    const quanti = this.store.etichette().find((e) => e.nome === nome)?.documenti ?? 0;
    const conferma = await this.conferme.chiedi({
      titolo: `Togliere l'etichetta «${nome}»?`,
      dettaglio: `Sparisce da ${quanti} ${quanti === 1 ? 'documento' : 'documenti'}. I documenti restano dove sono.`,
      conferma: 'Togli',
      tono: 'pericolo',
    });
    if (conferma) this.store.eliminaEtichetta(nome);
  }

  protected readonly statoVuoto = computed(() => {
    if (this.store.filtriAttivi()) {
      return {
        titolo: 'Nessun documento con questi criteri',
        descrizione: 'Prova ad allargare la ricerca togliendo un filtro.',
      };
    }
    if (this.store.senzaCliente()) {
      return {
        titolo: 'Nessun documento senza cliente',
        descrizione:
          'Ogni documento dell’archivio è intestato a qualcuno. È il momento in cui questa vista serve di meno, ed è una buona notizia.',
      };
    }
    if (this.store.daConfermare()) {
      return {
        titolo: 'Niente da confermare',
        descrizione:
          'Nessun cliente proposto aspetta una risposta: quello che l’ingestion ha intestato è già stato guardato.',
      };
    }
    if (this.store.clienteCorrente()) {
      return {
        titolo: 'Nessun documento per questo cliente',
        descrizione: 'Trascina qui i suoi documenti, oppure intestagliene uno dalla sua scheda.',
      };
    }
    return {
      titolo: 'Archivio vuoto',
      descrizione:
        'Trascina qui i primi documenti. Puoi portare la cartella intera dell’agenzia, o uno zip: i percorsi si conservano, e da lì nascono cliente ed etichette.',
    };
  });
}
