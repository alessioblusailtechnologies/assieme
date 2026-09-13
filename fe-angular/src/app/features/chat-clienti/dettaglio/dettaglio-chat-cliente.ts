import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { DocumentiApi } from '@core/api/documenti-api';
import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import type { DocumentoPrivato, DocumentoPubblico, Id, Paginato } from '@core/models';
import { Accordion } from '@shared/ui/accordion/accordion';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { ChatClientiStore } from '../chat-clienti-store';

/**
 * La scheda della chat di un cliente: che cosa legge, come deve rispondere,
 * i limiti, il link.
 *
 * Il cono è il cliente (12/09/2026): i suoi documenti, calcolati dal server
 * a ogni domanda, più quelli aggiunti a mano e meno quelli esclusi. Qui non
 * si compone, si guarda e si corregge.
 */
@Component({
  selector: 'app-dettaglio-chat-cliente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Accordion, Bottone, Briciole, Campo, FormsModule, Icona, RouterLink, Scheletro],
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

  /**
   * L'id per cui l'elenco è già stato riletto dal server. Finché non lo è,
   * una chat che non si trova è una chat **non ancora caricata**, e dirle
   * «non esiste più» è falso.
   */
  protected readonly verificata = signal<string | undefined>(undefined);

  /* Un campo e non un signal: fa da chiavistello anche nel tratto fra la fine
     della ricarica e il giro successivo dell'effetto, dove un signal non
     ancora propagato lascerebbe partire una seconda ricarica. */
  private inVerificaPer: string | undefined;

  /**
   * Si torna al cliente, e alla sua scheda Chat: dal 13/09/2026 una chat sta
   * dentro la scheda del suo cliente, e l'elenco d'insieme che il vecchio
   * «indietro» apriva non c'è più.
   */
  protected readonly briciole = computed<VoceBriciola[]>(() => {
    const chat = this.chat();
    return [
      { etichetta: 'Home', percorso: '/' },
      { etichetta: 'Clienti', percorso: '/clienti' },
      ...(chat
        ? [{ etichetta: chat.clienteNome, percorso: `/clienti/${chat.clienteId}`, parametri: { scheda: 'chat' } }]
        : []),
      { etichetta: 'Chat' },
    ];
  });

  /** Le scelte in corso: si salvano insieme, non una alla volta. */
  protected readonly documentiScelti = signal<Map<Id, string>>(new Map());
  /** Quelli del cliente che **non** deve vedere: una perizia, una nota interna. */
  protected readonly documentiEsclusi = signal<Map<Id, string>>(new Map());
  protected readonly istruzioni = signal('');
  protected readonly tetto = signal<string>('');
  protected readonly salvato = signal(false);
  protected readonly inSalvataggio = signal(false);
  private idCaricato = '';

  // --- Che cosa legge davvero -----------------------------------------------

  private readonly apiPrivati = inject(DocumentiPrivatiApi);

  /**
   * I documenti del cliente, che **sono** il cono.
   *
   * Mostrarli non è un dettaglio di comodo: il cono è calcolato dal server a
   * ogni domanda, quindi qui non c'è una lista da comporre — c'è una lista
   * da guardare, per sapere che cosa il cliente leggerà davvero. Senza,
   * l'agenzia dovrebbe fidarsi di una frase.
   */
  private readonly risorsaSuoi = httpResource<Paginato<DocumentoPrivato>>(() => {
    const cliente = this.chat()?.clienteId;
    return cliente ? this.apiPrivati.urlElenco({ clienteId: cliente, perPagina: 100 }) : undefined;
  });

  protected readonly suoi = computed(() =>
    this.risorsaSuoi.hasValue() ? this.risorsaSuoi.value().elementi : [],
  );

  protected readonly quantiLegge = computed(
    () => this.suoi().filter((d) => !this.documentiEsclusi().has(d.id)).length + this.documentiScelti().size,
  );

  protected escluso(id: Id): boolean {
    return this.documentiEsclusi().has(id);
  }

  protected commutaEscluso(doc: { id: Id; titolo: string }): void {
    const esclusi = new Map(this.documentiEsclusi());
    if (esclusi.has(doc.id)) esclusi.delete(doc.id);
    else esclusi.set(doc.id, doc.titolo);
    this.documentiEsclusi.set(esclusi);
    this.salvato.set(false);
  }

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
     * Lo store vive sulla rotta, e una rotta tiene i suoi provider per tutta
     * la sessione: aperta una chat, l'elenco resta in memoria anche uscendo.
     * Prima si rileggeva solo se era vuoto, e la chat attivata dopo dalla
     * scheda del cliente lì dentro non c'era: la schermata diceva «non esiste
     * più» a una chat appena nata (13/09/2026). Ora si rilegge ogni volta che
     * l'id cercato manca, una volta per id.
     *
     * Sta in un effetto e non nel costruttore: `id` è un input legato alla
     * rotta, e nel costruttore non c'è ancora (NG0950).
     */
    effect(() => {
      const id = this.id();
      if (!this.store.perId(id) && this.inVerificaPer !== id) {
        untracked(() => void this.verifica(id));
      }
      this.riempiDaChat();
    });
  }

  private async verifica(id: string): Promise<void> {
    this.inVerificaPer = id;
    await this.store.ricarica();
    this.verificata.set(id);
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
    this.documentiEsclusi.set(new Map(chat.esclusi.map((d) => [d.id, d.titolo])));
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
        esclusi: [...this.documentiEsclusi().keys()],
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
    /* La chat sparisce dall'elenco mentre si esce: non va cercata di nuovo. */
    this.inVerificaPer = chat.id;
    await this.store.elimina(chat.id);
    /* Si torna dove la chat si attiva: la scheda Chat del suo cliente, che
       adesso offre di attivarne una nuova. */
    await this.router.navigate(['/clienti', chat.clienteId], { queryParams: { scheda: 'chat' } });
  }
}
