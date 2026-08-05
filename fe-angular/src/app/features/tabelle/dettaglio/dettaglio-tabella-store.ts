import { httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import {
  Id,
  NuovaColonna,
  TabellaAnalisi,
  TemplateOutput,
} from '@core/models';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { SessioneStore } from '@core/auth/sessione-store';
import { StoricoConversazioni } from '@core/chat/storico-conversazioni';
import { TabelleApi } from '@core/api/tabelle-api';
import { avanzamentoTabella } from './avanzamento';

/** Ogni quanto si richiede la tabella mentre la generazione è in corso. */
const MS_INTERROGAZIONE = 1500;

/**
 * Stato della tabella aperta.
 *
 * Fornito sul componente di dettaglio: vive con la tabella e muore con lei,
 * interrogazione periodica compresa.
 *
 * Il popolamento progressivo segue lo schema dell'elaborazione documenti
 * (RF-B-05): finché `stato === 'in-generazione'` la tabella si richiede a
 * intervalli, e il polling **si ferma da solo** quando non c'è più nulla da
 * attendere. Le mutazioni non ricaricano: la risposta del server è già la
 * tabella aggiornata, e si scrive dritta nella risorsa.
 */
@Injectable()
export class DettaglioTabellaStore {
  private readonly api = inject(TabelleApi);
  private readonly conversazioni = inject(ConversazioniApi);
  private readonly storico = inject(StoricoConversazioni);
  private readonly sessione = inject(SessioneStore);
  private readonly router = inject(Router);

  readonly id = signal<Id | undefined>(undefined);

  private readonly risorsa = httpResource<TabellaAnalisi>(() => {
    const id = this.id();
    return id ? this.api.urlDettaglio(id) : undefined;
  });

  readonly tabella = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : undefined));
  readonly inCaricamento = this.risorsa.isLoading;
  readonly errore = this.risorsa.error;

  readonly inGenerazione = computed(() => this.tabella()?.stato === 'in-generazione');
  readonly avanzamento = computed(() => avanzamentoTabella(this.tabella()));

  /**
   * RF-C-15: una tabella di un collega si apre perché è condivisa, e si apre
   * in **sola lettura** — si modifica la propria copia, ottenuta con
   * `duplica()`. Finché la sessione non è nota si resta prudenti: meglio un
   * pulsante che compare un attimo dopo che un pulsante da ritirare.
   */
  readonly soloLettura = computed(() => {
    const tabella = this.tabella();
    const utente = this.sessione.utente();
    return !tabella || !utente || tabella.autoreId !== utente.id;
  });

  constructor() {
    effect((pulizia) => {
      if (!this.inGenerazione()) return;

      const battito = setInterval(() => this.risorsa.reload(), MS_INTERROGAZIONE);
      pulizia(() => clearInterval(battito));
    });
  }

  apri(id: Id | undefined): void {
    if (id !== this.id()) this.id.set(id);
  }

  riprova(): void {
    this.risorsa.reload();
  }

  /** La risposta di ogni mutazione è la tabella aggiornata: si applica e basta. */
  private applica = (tabella: TabellaAnalisi): void => {
    this.risorsa.set(tabella);
  };

  // --- Azioni sulla tabella ----------------------------------------------

  rinomina(titolo: string): void {
    const id = this.id();
    const pulito = titolo.trim();
    if (!id || !pulito) return;
    this.api.modifica(id, { titolo: pulito }).subscribe({ next: this.applica });
  }

  /** RF-C-15: condivisione nel tenant, reversibile. */
  condividi(condivisa: boolean): void {
    const id = this.id();
    if (!id) return;
    this.api.modifica(id, { condivisa }).subscribe({ next: this.applica });
  }

  /** RF-C-15: la copia con cui si prosegue in autonomia. Si naviga alla copia. */
  duplica(): void {
    const id = this.id();
    if (!id) return;
    this.api.duplica(id).subscribe({
      next: (copia) => void this.router.navigate(['/tabelle', copia.id]),
    });
  }

  elimina(): void {
    const id = this.id();
    if (!id) return;
    this.api.elimina(id).subscribe({
      next: () => void this.router.navigate(['/tabelle']),
    });
  }

  // --- Righe e colonne (RF-C-14) ------------------------------------------

  aggiungiDocumento(documentoId: Id): void {
    const id = this.id();
    if (!id) return;
    this.api.aggiungiDocumenti(id, [documentoId]).subscribe({ next: this.applica });
  }

  rimuoviDocumento(documentoId: Id): void {
    const id = this.id();
    if (!id) return;
    this.api.rimuoviDocumento(id, documentoId).subscribe({ next: this.applica });
  }

  aggiungiColonna(colonna: NuovaColonna): void {
    const id = this.id();
    if (!id) return;
    this.api.aggiungiColonna(id, colonna).subscribe({ next: this.applica });
  }

  rimuoviColonna(colonnaId: Id): void {
    const id = this.id();
    if (!id) return;
    this.api.rimuoviColonna(id, colonnaId).subscribe({ next: this.applica });
  }

  // --- Esportazione e chat ------------------------------------------------

  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() =>
    this.conversazioni.urlTemplate(),
  );

  /** RF-C-14: i template di output su cui esportare, XLSX in particolare. */
  readonly template = computed(() =>
    this.risorsaTemplate.hasValue() ? this.risorsaTemplate.value() : [],
  );

  esporta(template: TemplateOutput): void {
    const id = this.id();
    const tabella = this.tabella();
    if (!id || !tabella) return;
    this.api.esporta(id, template.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const collegamento = document.createElement('a');
        collegamento.href = url;
        collegamento.download = `${tabella.titolo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${template.formato}`;
        collegamento.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  /**
   * RF-C-13: la tabella si interroga in chat. Nasce una conversazione con
   * gli stessi documenti nel contesto, e la domanda («quale ha la franchigia
   * più bassa?») si fa lì, con le citazioni di risposta.
   */
  apriInChat(): void {
    const tabella = this.tabella();
    if (!tabella) return;
    this.conversazioni
      .crea({
        titolo: `Sulla tabella «${tabella.titolo}»`,
        documentiInContesto: tabella.righe.map((r) => r.documentoId),
      })
      .subscribe({
        next: (conversazione) => {
          /* La barra laterale mostra lo storico: la conversazione appena
             nata deve esserci quando la chat si apre. */
          this.storico.ricarica();
          void this.router.navigate(['/chat', conversazione.id]);
        },
      });
  }
}
