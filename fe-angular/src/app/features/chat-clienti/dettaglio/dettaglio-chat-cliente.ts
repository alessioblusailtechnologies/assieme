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

import { CartelleApi } from '@core/api/cartelle-api';
import { DocumentiApi } from '@core/api/documenti-api';
import type { AlberoCartelle, Cartella, DocumentoPubblico, Id, Paginato } from '@core/models';
import { Accordion } from '@shared/ui/accordion/accordion';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Icona } from '@shared/ui/icona/icona';
import { ChatClientiStore } from '../chat-clienti-store';

/** Una cartella dell'albero, appiattita con la sua profondità per il rientro. */
interface VoceAlbero {
  cartella: Cartella;
  profondita: number;
}

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
  private readonly cartelleApi = inject(CartelleApi);
  private readonly documentiApi = inject(DocumentiApi);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly chat = computed(() => this.store.perId(this.id()));

  /** Le scelte in corso: si salvano insieme, non una alla volta. */
  protected readonly cartelleScelte = signal<Set<Id>>(new Set());
  protected readonly documentiScelti = signal<Map<Id, string>>(new Map());
  protected readonly istruzioni = signal('');
  protected readonly tetto = signal<string>('');
  protected readonly salvato = signal(false);
  protected readonly inSalvataggio = signal(false);
  private idCaricato = '';

  // --- L'albero dell'agenzia ------------------------------------------------

  private readonly risorsaAlbero = httpResource<AlberoCartelle>(() =>
    this.cartelleApi.urlAlbero(),
  );

  /**
   * L'albero appiattito, perché una lista con rientri si legge meglio di un
   * albero pieghevole quando le voci sono poche decine — e soprattutto si
   * scorre con gli occhi tutta insieme, che è quello che serve quando devi
   * essere sicuro di non aver spuntato la cartella sbagliata.
   */
  protected readonly voci = computed<VoceAlbero[]>(() => {
    const albero = this.risorsaAlbero.hasValue() ? this.risorsaAlbero.value() : undefined;
    if (!albero) return [];
    const piatto: VoceAlbero[] = [];
    const scendi = (cartelle: Cartella[], profondita: number): void => {
      for (const cartella of cartelle) {
        piatto.push({ cartella, profondita });
        scendi(cartella.figli ?? [], profondita + 1);
      }
    };
    scendi(albero.radici, 0);
    return piatto;
  });

  // --- I documenti pubblici -------------------------------------------------

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
    this.cartelleScelte.set(new Set(chat.cartelle.map((c) => c.id)));
    this.documentiScelti.set(new Map(chat.documenti.map((d) => [d.id, d.titolo])));
    this.istruzioni.set(chat.istruzioni ?? '');
    this.tetto.set(chat.tettoDomande ? String(chat.tettoDomande) : '');
  }

  protected cartellaScelta(id: Id): boolean {
    return this.cartelleScelte().has(id);
  }

  /**
   * Spuntare una cartella prende **anche tutto quello che c'è sotto**: è la
   * definizione del cono a database, e va detta qui invece che scoperta
   * dopo, quando una sottocartella con documenti di un altro cliente è già
   * finita nelle mani di qualcuno.
   */
  protected commutaCartella(id: Id): void {
    const scelte = new Set(this.cartelleScelte());
    if (scelte.has(id)) scelte.delete(id);
    else scelte.add(id);
    this.cartelleScelte.set(scelte);
    this.salvato.set(false);
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

  protected readonly conoVuoto = computed(
    () => !this.cartelleScelte().size && !this.documentiScelti().size,
  );

  protected async salva(): Promise<void> {
    const chat = this.chat();
    if (!chat || this.inSalvataggio()) return;
    this.inSalvataggio.set(true);
    try {
      const tetto = Number.parseInt(this.tetto(), 10);
      await this.store.modifica(chat.id, {
        cartelle: [...this.cartelleScelte()],
        documenti: [...this.documentiScelti().keys()],
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

  protected readonly confermaEliminazione = signal(false);

  protected async elimina(): Promise<void> {
    const chat = this.chat();
    if (!chat) return;
    await this.store.elimina(chat.id);
    await this.router.navigate(['/chat-clienti']);
  }
}
