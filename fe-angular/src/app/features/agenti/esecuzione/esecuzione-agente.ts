import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Agente, Citazione, EsecuzioneAgente, StatoEsecuzione } from '@core/models';
import { AgentiApi } from '@core/api/agenti-api';
import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { ChipCitazione } from '@shared/ui/citazione/chip-citazione';
import { ComponenteStatoEsecuzione } from '../stato-esecuzione';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import { Icona } from '@shared/ui/icona/icona';
import { NotificheStore } from '@core/notifiche/notifiche-store';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { htmlRisposta } from '@shared/testi/testo-risposta';

/** Ogni quanto si richiede l'esecuzione mentre lavora. */
const MS_INTERROGAZIONE = 1200;

/**
 * L'esito di un'esecuzione (RF-E-06/07).
 *
 * Aperta a esecuzione in corso, la pagina la segue da sola: il log si
 * allunga passo dopo passo e l'esito compare quando c'è — nessun
 * ricaricamento a mano. Le citazioni aprono il documento sul passaggio,
 * nello stesso cassetto della chat e delle tabelle (RF-E-08 con RF-C-05).
 *
 * Da un esito si può proseguire in chat con gli stessi documenti in contesto
 * (RF-E-12): la domanda di approfondimento si fa lì, con le citazioni di
 * risposta.
 */
@Component({
  selector: 'app-esecuzione-agente',
  /* I chip dei rimandi nell'esito sono ancore dentro `[innerHTML]`: il click si raccoglie sull'host. */
  host: { '(click)': 'suRimando($event)' },
  imports: [
    Badge,
    Bottone,
    Briciole,
    Cassetto,
    ChipCitazione,
    ComponenteStatoEsecuzione,
    DatePipe,
    Icona,
    RouterLink,
    Scheletro,
    StatoVuoto,
    VisualizzatorePdf,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './esecuzione-agente.html',
  styleUrl: './esecuzione-agente.scss',
})
export class EsecuzioneAgentePagina {
  private readonly api = inject(AgentiApi);
  private readonly apiPubblici = inject(DocumentiApi);
  private readonly apiPrivati = inject(DocumentiPrivatiApi);
  private readonly conversazioni = inject(ConversazioniApi);
  private readonly storico = inject(StoricoConversazioni);
  private readonly notifiche = inject(NotificheStore);
  private readonly router = inject(Router);

  /** Dalla rotta `/agenti/:id/esecuzioni/:esecuzioneId`. */
  readonly id = input.required<string>();
  readonly esecuzioneId = input.required<string>();

  private readonly risorsaAgente = httpResource<Agente>(() => this.api.urlDettaglio(this.id()));
  protected readonly agente = computed(() =>
    this.risorsaAgente.hasValue() ? this.risorsaAgente.value() : undefined,
  );

  private readonly risorsa = httpResource<EsecuzioneAgente>(() =>
    this.api.urlEsecuzione(this.id(), this.esecuzioneId()),
  );
  protected readonly esecuzione = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : undefined,
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected readonly inLavoro = computed(() => {
    const stato = this.esecuzione()?.stato;
    return stato === 'in-coda' || stato === 'in-corso';
  });

  /** L'ultimo stato visto, per notificare l'assestamento (RF-E-07). */
  private statoVisto: StatoEsecuzione | undefined;

  constructor() {
    effect((pulizia) => {
      if (!this.inLavoro()) return;
      const battito = setInterval(() => this.risorsa.reload(), MS_INTERROGAZIONE);
      pulizia(() => clearInterval(battito));
    });

    effect(() => {
      const esecuzione = this.esecuzione();
      if (!esecuzione) return;
      const prima = this.statoVisto;
      this.statoVisto = esecuzione.stato;
      if (prima !== 'in-coda' && prima !== 'in-corso') return;
      if (esecuzione.stato === 'completata') {
        this.notifiche.aggiungi({
          gravita: 'successo',
          titolo: `${this.agente()?.nome ?? 'L’agente'}: esecuzione completata`,
        });
      } else if (esecuzione.stato === 'fallita') {
        this.notifiche.aggiungi({
          gravita: 'errore',
          titolo: `${this.agente()?.nome ?? 'L’agente'}: esecuzione fallita`,
          dettaglio: esecuzione.errore,
        });
      }
    });
  }

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Agenti', percorso: '/agenti' },
    { etichetta: this.agente()?.nome ?? 'Agente', percorso: `/agenti/${this.id()}` },
    { etichetta: 'Esito' },
  ]);

  protected riprovaCaricamento(): void {
    this.risorsa.reload();
  }

  /** L'output è markdown minimo, come le risposte della chat, con le fonti come chip nel punto esatto. */
  protected readonly outputHtml = computed(() => {
    const e = this.esecuzione();
    return e?.output ? htmlRisposta(e.output, { citazioni: e.citazioni }) : '';
  });

  /** Il click su un chip nel testo apre il documento, come il chip in coda. */
  protected suRimando(evento: Event): void {
    const ancora = (evento.target as HTMLElement | null)?.closest?.('a.rimando');
    if (!ancora) return;
    evento.preventDefault();
    const href = ancora.getAttribute('href') ?? '';
    if (!href.startsWith('#fonte:')) return;
    const citazione = this.esecuzione()?.citazioni.find((c) => c.id === href.slice('#fonte:'.length));
    if (citazione) this.citazioneAperta.set(citazione);
  }

  /** I parametri dell'avvio, con l'etichetta dichiarata dall'agente (RF-E-05). */
  protected readonly parametriMostrati = computed(() => {
    const valori = this.esecuzione()?.parametri;
    if (!valori) return [];
    const definiti = this.agente()?.parametri ?? [];
    return Object.entries(valori).map(([chiave, valore]) => ({
      etichetta: definiti.find((p) => p.chiave === chiave)?.etichetta ?? chiave,
      valore,
    }));
  });

  protected durata(): string {
    const esecuzione = this.esecuzione();
    if (!esecuzione?.conclusaIl) return '';
    const ms = new Date(esecuzione.conclusaIl).getTime() - new Date(esecuzione.avviataIl).getTime();
    const secondi = Math.max(Math.round(ms / 1000), 0);
    if (secondi < 60) return `${secondi} s`;
    return `${Math.floor(secondi / 60)} min ${secondi % 60} s`;
  }

  // --- Citazioni (RF-E-08 con RF-C-05) ------------------------------------

  protected readonly citazioneAperta = signal<Citazione | undefined>(undefined);

  protected urlFile(citazione: Citazione): string {
    return citazione.archivio === 'pubblico'
      ? this.apiPubblici.urlFile(citazione.documentoId)
      : this.apiPrivati.urlFile(citazione.documentoId);
  }

  // --- Riprova (RF-E-11) e approfondimento (RF-E-12) ----------------------

  protected readonly inAvvio = signal(false);

  /** Una nuova esecuzione con gli stessi parametri; si naviga al suo esito. */
  protected riesegui(): void {
    const esecuzione = this.esecuzione();
    if (!esecuzione || this.inAvvio()) return;
    this.inAvvio.set(true);
    this.api
      .esegui(this.id(), esecuzione.parametri ? { parametri: esecuzione.parametri } : {})
      .subscribe({
        next: (nuova) => {
          this.inAvvio.set(false);
          void this.router.navigate(['/agenti', this.id(), 'esecuzioni', nuova.id]);
        },
        error: () => this.inAvvio.set(false),
      });
  }

  /**
   * RF-E-12: nasce una conversazione con i documenti dell'esito in contesto —
   * quelli citati, più le fonti puntuali dell'agente.
   */
  protected approfondisciInChat(): void {
    const agente = this.agente();
    const esecuzione = this.esecuzione();
    if (!agente || !esecuzione) return;

    const documenti = new Set<string>();
    for (const citazione of esecuzione.citazioni) documenti.add(citazione.documentoId);
    for (const fonte of agente.fonti) {
      if (fonte.tipo === 'documento') documenti.add(fonte.documentoId);
    }

    this.conversazioni
      .crea({
        titolo: `Sull'esito di «${agente.nome}»`,
        documentiInContesto: [...documenti],
      })
      .subscribe({
        next: (conversazione) => {
          this.storico.ricarica();
          void this.router.navigate(['/chat', conversazione.id]);
        },
      });
  }
}
