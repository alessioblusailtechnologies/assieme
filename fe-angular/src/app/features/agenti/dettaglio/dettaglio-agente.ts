import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import {
  EsecuzioneRiepilogo,
  ParametroAgente,
  RiferimentoDocumento,
  TemplateOutput,
} from '@core/models';
import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { ComponenteStatoEsecuzione } from '../stato-esecuzione';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { DettaglioAgenteStore } from './dettaglio-agente-store';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';
import { etichettaPianificazione } from '../pianificazione';

/**
 * Un agente (RF-E-01…E-06).
 *
 * Sopra la definizione — istruzioni, fonti, output, pianificazione — e sotto
 * lo storico delle esecuzioni, che è il motivo per cui si apre la pagina.
 * Un'esecuzione avviata compare subito in cima con il suo stato e la pagina
 * la segue da sola; al termine arriva la notifica (RF-E-07).
 *
 * «Esegui ora» chiede i parametri in un cassetto quando l'agente li dichiara
 * (RF-E-05); altrimenti parte e basta.
 */
@Component({
  selector: 'app-dettaglio-agente',
  providers: [DettaglioAgenteStore],
  imports: [
    Badge,
    Bottone,
    Briciole,
    Campo,
    Cassetto,
    ComponenteStatoEsecuzione,
    DatePipe,
    Icona,
    RouterLink,
    Scheletro,
    SelettoreDocumenti,
    StatoVuoto,
    Suggerimento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dettaglio-agente.html',
  styleUrl: './dettaglio-agente.scss',
})
export class DettaglioAgente {
  protected readonly store = inject(DettaglioAgenteStore);
  private readonly apiConversazioni = inject(ConversazioniApi);

  /** Dalla rotta `/agenti/:id`. */
  readonly id = input.required<string>();

  constructor() {
    effect(() => this.store.apri(this.id()));
  }

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Agenti', percorso: '/agenti' },
    { etichetta: this.store.agente()?.nome ?? 'Agente' },
  ]);

  protected readonly etichettaPianificazione = etichettaPianificazione;

  /* Il nome del template si mostra accanto al formato: l'elenco è già in
     cache delle conversazioni, la chiamata è la stessa della chat. */
  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() =>
    this.store.agente()?.templateOutputId ? this.apiConversazioni.urlTemplate() : undefined,
  );

  protected readonly nomeTemplate = computed(() => {
    const id = this.store.agente()?.templateOutputId;
    if (!id) return undefined;
    const template = (this.risorsaTemplate.hasValue() ? this.risorsaTemplate.value() : []).find(
      (t) => t.id === id,
    );
    return template ? `${template.nome} (${template.formato.toUpperCase()})` : undefined;
  });

  // --- Esecuzione manuale (RF-E-03/05) ------------------------------------

  protected readonly cassettoAvvio = signal(false);
  protected readonly valoriTesto = signal<Record<string, string>>({});
  protected readonly documentiScelti = signal<Record<string, RiferimentoDocumento>>({});
  protected readonly ricercaParametro = signal('');
  /** La chiave del parametro-documento la cui ricerca è aperta. */
  protected readonly parametroInRicerca = signal<string | undefined>(undefined);
  private readonly selettore = viewChild(SelettoreDocumenti);

  protected readonly parametri = computed(() => this.store.agente()?.parametri ?? []);

  protected avvia(): void {
    if (!this.parametri().length) {
      this.store.esegui();
      return;
    }
    this.valoriTesto.set({});
    this.documentiScelti.set({});
    this.ricercaParametro.set('');
    this.parametroInRicerca.set(undefined);
    this.cassettoAvvio.set(true);
  }

  protected aggiornaTesto(chiave: string, valore: string): void {
    this.valoriTesto.update((v) => ({ ...v, [chiave]: valore }));
  }

  protected apriRicerca(chiave: string): void {
    this.parametroInRicerca.set(chiave);
    this.ricercaParametro.set('');
  }

  protected suTastoRicerca(evento: KeyboardEvent): void {
    const selettore = this.selettore();
    if (selettore?.gestisciTasto(evento)) evento.preventDefault();
  }

  protected scegliDocumento(documento: RiferimentoDocumento): void {
    const chiave = this.parametroInRicerca();
    if (!chiave) return;
    this.documentiScelti.update((d) => ({ ...d, [chiave]: documento }));
    this.parametroInRicerca.set(undefined);
    this.ricercaParametro.set('');
  }

  protected togliDocumento(chiave: string): void {
    this.documentiScelti.update((d) => {
      const resto = { ...d };
      delete resto[chiave];
      return resto;
    });
  }

  protected readonly avvioPronto = computed(() =>
    this.parametri().every((p) => !p.obbligatorio || !!this.valoreDi(p)),
  );

  private valoreDi(parametro: ParametroAgente): string | undefined {
    return parametro.tipo === 'documento'
      ? this.documentiScelti()[parametro.chiave]?.id
      : this.valoriTesto()[parametro.chiave]?.trim() || undefined;
  }

  protected confermaAvvio(): void {
    if (!this.avvioPronto()) return;
    const parametri: Record<string, string> = {};
    for (const parametro of this.parametri()) {
      const valore = this.valoreDi(parametro);
      if (valore) parametri[parametro.chiave] = valore;
    }
    this.cassettoAvvio.set(false);
    this.store.esegui(parametri);
  }

  // --- Eliminazione (conferma a due passi, come ovunque) ------------------

  protected readonly confermaEliminazione = signal(false);

  protected elimina(): void {
    if (!this.confermaEliminazione()) {
      this.confermaEliminazione.set(true);
      return;
    }
    this.store.elimina();
  }

  // --- Storico (RF-E-06) --------------------------------------------------

  /** Durata leggibile, es. `1 min 12 s`. Vuota finché l'esecuzione corre. */
  protected durata(esecuzione: EsecuzioneRiepilogo): string {
    if (!esecuzione.conclusaIl) return '';
    const ms = new Date(esecuzione.conclusaIl).getTime() - new Date(esecuzione.avviataIl).getTime();
    const secondi = Math.max(Math.round(ms / 1000), 0);
    if (secondi < 60) return `${secondi} s`;
    return `${Math.floor(secondi / 60)} min ${secondi % 60} s`;
  }
}
