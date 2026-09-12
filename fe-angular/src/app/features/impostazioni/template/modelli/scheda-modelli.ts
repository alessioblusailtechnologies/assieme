import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { CodaCaricamento, FileInCoda } from '@shared/caricamento/coda-caricamento';
import { ConfermeStore } from '@core/conferme/conferme-store';
import { ErroreApi, FormatoModello, Id, ModelloRiferimento } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { ModelliRiferimentoApi, ModificaModello } from '@core/api/modelli-riferimento-api';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { nomeFileEsportazione } from '@shared/esportazione/scelte-esportazione';
import { scaricaBlob } from '@shared/esportazione/scarica-blob';

/** Come si chiamano i formati più comuni; gli altri si mostrano con la loro estensione. */
const NOME_FORMATO: Partial<Record<FormatoModello, string>> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PowerPoint',
};

/** Mentre un'anteprima si converte, l'elenco si richiede ogni tanto: la conversione dura secondi. */
const MS_ATTESA_ANTEPRIMA = 4000;

/**
 * Seconda scheda di Impostazioni > Template di output (11/09/2026, fase 3
 * di `PIANO-INTESTAZIONE-MODELLI.md`): i modelli di riferimento.
 *
 * Un modello è un documento dell'agenzia di qualsiasi formato che si
 * richiama in chat con «Genera da modello». Per ognuno: il nome con cui lo
 * si chiama, la riga «quando usarlo» che il motore legge per scegliere, e
 * l'intestazione, quella dell'agenzia (di norma) o la sua. L'anteprima è
 * un PDF: il file stesso, o la conversione che il server prepara al
 * caricamento; finché non c'è, il file si scarica.
 */
@Component({
  selector: 'app-scheda-modelli',
  imports: [
    Bottone,
    Campo,
    Cassetto,
    CodaCaricamento,
    Icona,
    MenuAzioni,
    Scheletro,
    StatoVuoto,
    VisualizzatorePdf,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scheda-modelli.html',
  styleUrl: './scheda-modelli.scss',
})
export class SchedaModelli {
  private readonly api = inject(ModelliRiferimentoApi);
  private readonly conferme = inject(ConfermeStore);
  private readonly sessione = inject(SessioneStore);

  private readonly risorsa = httpResource<ModelloRiferimento[]>(() => this.api.urlElenco());

  protected readonly modelli = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : [],
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;
  protected readonly puoGestire = computed(() => this.sessione.puo('template.gestisci'));

  protected readonly nomeFormato = NOME_FORMATO;

  private readonly zona = viewChild(ZonaCaricamento);

  constructor() {
    /* Un'anteprima in conversione: si torna a chiedere finché non è pronta (o non riesce). */
    effect((pulizia) => {
      if (!this.modelli().some((m) => m.anteprima === 'in-corso')) return;
      const timer = setTimeout(() => this.risorsa.reload(), MS_ATTESA_ANTEPRIMA);
      pulizia(() => clearTimeout(timer));
    });
  }

  protected riprova(): void {
    this.risorsa.reload();
  }

  private modifica(modello: ModelloRiferimento, modifica: ModificaModello): void {
    this.api
      .modifica(modello.id, modifica)
      .subscribe({ next: (elenco) => this.risorsa.set(elenco) });
  }

  // --- Nome ------------------------------------------------------------------

  protected readonly inRinomina = signal<Id | undefined>(undefined);
  protected readonly nuovoNome = signal('');

  protected iniziaRinomina(modello: ModelloRiferimento): void {
    this.inRinomina.set(modello.id);
    this.nuovoNome.set(modello.nome);
  }

  protected confermaRinomina(modello: ModelloRiferimento): void {
    if (this.inRinomina() !== modello.id) return;
    const nome = this.nuovoNome().trim();
    this.inRinomina.set(undefined);
    if (nome && nome !== modello.nome) this.modifica(modello, { nome });
  }

  protected annullaRinomina(): void {
    this.inRinomina.set(undefined);
  }

  // --- «Quando usarlo» e intestazione ----------------------------------------

  /** Si salva all'uscita dal campo, e solo se è cambiata. */
  protected salvaDescrizione(modello: ModelloRiferimento, valore: string): void {
    const descrizione = valore.trim();
    if (descrizione !== modello.descrizione) this.modifica(modello, { descrizione });
  }

  protected impostaIntestazione(modello: ModelloRiferimento, intestazioneAgenzia: boolean): void {
    if (intestazioneAgenzia !== modello.intestazioneAgenzia)
      this.modifica(modello, { intestazioneAgenzia });
  }

  // --- Anteprima e file ------------------------------------------------------

  protected readonly anteprima = signal<ModelloRiferimento | undefined>(undefined);

  protected urlAnteprima(modello: ModelloRiferimento): string {
    return this.api.urlAnteprima(modello.id);
  }

  protected readonly inScaricamento = signal<Id | undefined>(undefined);

  protected scarica(modello: ModelloRiferimento): void {
    if (this.inScaricamento()) return;
    this.inScaricamento.set(modello.id);
    this.api.scarica(modello.id).subscribe({
      next: (blob) => {
        this.inScaricamento.set(undefined);
        scaricaBlob(blob, nomeFileEsportazione(modello.nome, modello.formato));
      },
      error: () => this.inScaricamento.set(undefined),
    });
  }

  // --- Le altre azioni -------------------------------------------------------

  private readonly menu = viewChild<MenuAzioni>('menuModello');
  protected readonly vociMenu = signal<VoceMenu[]>([]);

  protected apriMenu(evento: Event, modello: ModelloRiferimento): void {
    this.vociMenu.set([
      { etichetta: 'Rinomina', azione: () => this.iniziaRinomina(modello) },
      {
        etichetta: 'Scarica il file',
        dettaglio: modello.formato,
        azione: () => this.scarica(modello),
      },
      { etichetta: 'Elimina', azione: () => void this.elimina(modello) },
    ]);
    this.menu()?.apri(evento);
  }

  protected async elimina(modello: ModelloRiferimento): Promise<void> {
    const conferma = await this.conferme.chiedi({
      titolo: `Eliminare «${modello.nome}»?`,
      dettaglio: 'La chat non potrà più generare documenti su questo modello. Non si torna indietro.',
    });
    if (!conferma) return;
    this.api.elimina(modello.id).subscribe({ next: () => this.risorsa.reload() });
  }

  // --- Caricamento -----------------------------------------------------------

  private readonly vociCoda = signal<FileInCoda[]>([]);
  protected readonly coda = this.vociCoda.asReadonly();

  protected scegliFile(): void {
    this.zona()?.apriFinestra();
  }

  protected carica(file: File[]): void {
    if (!file.length || !this.puoGestire()) return;
    const nuove: FileInCoda[] = file.map((f) => ({
      nome: f.name,
      dimensione: f.size,
      stato: 'in-corso',
      percentuale: 0,
    }));
    this.vociCoda.update((c) => [...nuove, ...c]);

    const aggiorna = (modifica: (v: FileInCoda) => FileInCoda) =>
      this.vociCoda.update((c) => c.map((v) => (nuove.includes(v) ? modifica(v) : v)));

    this.api.carica(file).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          const totale = evento.total;
          aggiorna((v) => ({ ...v, percentuale: Math.round((evento.loaded / totale) * 100) }));
        }
        if (evento.type === HttpEventType.Response) {
          aggiorna((v) => ({ ...v, stato: 'completato', percentuale: 100 }));
          this.risorsa.reload();
        }
      },
      error: (err: HttpErrorResponse) => {
        const api = err.error as ErroreApi | null;
        aggiorna((v) => ({
          ...v,
          stato: 'errore',
          messaggio: api?.messaggio ?? 'Caricamento non riuscito.',
        }));
      },
    });
  }

  protected svuotaCoda(): void {
    this.vociCoda.update((c) => c.filter((v) => v.stato === 'in-corso'));
  }
}
