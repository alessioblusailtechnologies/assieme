import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { DocumentiApi } from '@core/api/documenti-api';
import type { DocumentoPubblico, Id, Paginato } from '@core/models';
import { Accordion } from '@shared/ui/accordion/accordion';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { Icona } from '@shared/ui/icona/icona';
import { ChatClientiStore } from '../chat-clienti-store';

/**
 * La scheda di una chat cliente: il cono, le istruzioni, i limiti, il link.
 *
 * Il cono si compone **a mano**, cartella per cartella e documento per
 * documento (decisione del 07/09). Nessuna precompilazione da
 * `cliente_id`: è la scelta che sbaglia di meno, e su questa schermata
 * sbagliare vuol dire far leggere a un cliente la polizza di un altro.
 */
@Component({
  selector: 'app-dettaglio-chat-cliente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Accordion, Bottone, Campo, FormsModule, Icona, RouterLink],
  templateUrl: './dettaglio-chat-cliente.html',
  styleUrl: './dettaglio-chat-cliente.scss',
})
export class DettaglioChatCliente {
  protected readonly store = inject(ChatClientiStore);
  private readonly documentiApi = inject(DocumentiApi);
  private readonly router = inject(Router);
  private readonly conferme = inject(ConfermeStore);

  readonly id = input.required<string>();

  protected readonly chat = computed(() => this.store.perId(this.id()));

  /** Le scelte in corso: si salvano insieme, non una alla volta. */
  protected readonly documentiScelti = signal<Map<Id, string>>(new Map());
  protected readonly istruzioni = signal('');
  protected readonly tetto = signal<string>('');
  protected readonly salvato = signal(false);
  protected readonly inSalvataggio = signal(false);
  private idCaricato = '';

  // --- I documenti da aggiungere --------------------------------------------

  protected readonly ricerca = signal('');

  private readonly risorsaDocumenti = httpResource<Paginato<DocumentoPubblico>>(() => {
    const q = this.ricerca().trim();
    return q.length < 3 ? undefined : this.documentiApi.urlElenco({ q, pagina: 1, perPagina: 20 });
  });

  protected readonly risultati = computed(() =>
    this.risorsaDocumenti.hasValue() ? this.risorsaDocumenti.value().elementi : [],
  );

  constructor() {
    /*
     * L'elenco e il riempimento del modulo stanno in un effetto e non nel
     * costruttore: `id` è un input legato alla rotta, e nel costruttore non
     * c'è ancora — Angular lo dice con un NG0950 secco. L'effetto parte
     * dopo, quando l'input esiste davvero.
     */
    effect(() => {
      if (!this.store.conta() && !this.store.inCaricamento()) void this.store.ricarica();
      this.riempiDaChat();
    });
  }

  /**
   * Porta nella schermata quello che il server ha, **una volta sola**.
   *
   * Dopo il primo riempimento le scelte sono dell'utente: ricopiarle a ogni
   * ricarica dell'elenco vorrebbe dire cancellargli sotto le mani ciò che
   * ha appena spuntato.
   */
  private riempiDaChat(): void {
    const chat = this.chat();
    if (!chat || this.idCaricato === chat.id) return;
    this.idCaricato = chat.id;
    this.documentiScelti.set(new Map(chat.aggiunti.map((d) => [d.id, d.titolo])));
    this.istruzioni.set(chat.istruzioni ?? '');
    this.tetto.set(chat.tettoDomande ? String(chat.tettoDomande) : '');
  }

  protected documentoScelto(id: Id): boolean {
    return this.documentiScelti().has(id);
  }

  protected commutaDocumento(doc: { id: Id; titolo: string }): void {
    const scelti = new Map(this.documentiScelti());
    if (scelti.has(doc.id)) scelti.delete(doc.id);
    else scelti.set(doc.id, doc.titolo);
    this.documentiScelti.set(scelti);
    this.salvato.set(false);
  }

  /** I documenti scelti come lista: la mappa serve alla logica, non al template. */
  protected readonly elencoDocumentiScelti = computed(() =>
    [...this.documentiScelti()].map(([id, titolo]) => ({ id, titolo })),
  );

  /**
   * Il cono non è mai vuoto: sono i documenti del cliente, e li calcola il
   * server a ogni domanda. Quello che si sceglie qui è **in più**.
   */
  protected readonly senzaAggiunte = computed(() => !this.documentiScelti().size);

  protected async salva(): Promise<void> {
    const chat = this.chat();
    if (!chat || this.inSalvataggio()) return;
    this.inSalvataggio.set(true);
    try {
      const tetto = Number.parseInt(this.tetto(), 10);
      await this.store.modifica(chat.id, {
        aggiunti: [...this.documentiScelti().keys()],
        istruzioni: this.istruzioni().trim() || null,
        tettoDomande: Number.isFinite(tetto) && tetto > 0 ? tetto : null,
      });
      this.salvato.set(true);
    } finally {
      this.inSalvataggio.set(false);
    }
  }

  protected async commutaStato(): Promise<void> {
    const chat = this.chat();
    if (!chat) return;
    await this.store.modifica(chat.id, {
      stato: chat.stato === 'attiva' ? 'sospesa' : 'attiva',
    });
  }

  protected async rigenera(): Promise<void> {
    const chat = this.chat();
    if (chat) await this.store.rigeneraLink(chat.id);
  }

  protected readonly copiato = signal(false);

  protected async copia(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copiato.set(true);
      setTimeout(() => this.copiato.set(false), 2000);
    } catch {
      /* Appunti negati: il link è comunque a schermo, si seleziona a mano. */
    }
  }

  protected async elimina(): Promise<void> {
    const chat = this.chat();
    if (!chat) return;
    const conferma = await this.conferme.chiedi({
      titolo: `Eliminare la chat di ${chat.ospite.nome} ${chat.ospite.cognome}?`.trim(),
      dettaglio:
        'Sparisce tutto: l’accesso del cliente e le conversazioni che ci sono state. Non si torna indietro.',
    });
    if (!conferma) return;
    await this.store.elimina(chat.id);
    await this.router.navigate(['/chat-clienti']);
  }
}
