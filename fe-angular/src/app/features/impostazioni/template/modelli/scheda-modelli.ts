import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { CodaCaricamento, FileInCoda } from '@shared/caricamento/coda-caricamento';
import { ErroreApi, Id, TemplateOutput } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { TemplateApi } from '@core/api/template-api';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';

/**
 * I template di output dell'agenzia (RF-D-10…D-13).
 *
 * Un template è un documento caricato qui — PDF, DOCX o XLSX — quanti se ne
 * vogliono, ognuno col nome con cui lo si richiama con «Genera documento da
 * template», dove la sandbox ne copia l'impaginazione. «Esporta come» invece
 * esce col layout di VELIA e l'intestazione dell'agenzia.
 *
 * Seconda scheda della pagina (11/09/2026): diventa quella dei modelli di
 * riferimento con la fase 3 di `PIANO-INTESTAZIONE-MODELLI.md`.
 */
@Component({
  selector: 'app-scheda-modelli',
  imports: [
    Bottone,
    Campo,
    Cassetto,
    CodaCaricamento,
    Icona,
    Scheletro,
    StatoVuoto,
    Tag,
    VisualizzatorePdf,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scheda-modelli.html',
  styleUrl: './scheda-modelli.scss',
})
export class SchedaModelli {
  private readonly api = inject(TemplateApi);
  private readonly sessione = inject(SessioneStore);

  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() => this.api.urlElenco());

  protected readonly template = computed(() =>
    this.risorsaTemplate.hasValue() ? this.risorsaTemplate.value() : [],
  );
  protected readonly inCaricamento = this.risorsaTemplate.isLoading;
  protected readonly errore = this.risorsaTemplate.error;

  protected readonly puoGestire = computed(() => this.sessione.puo('template.gestisci'));

  protected riprova(): void {
    this.risorsaTemplate.reload();
  }

  // --- Anteprima (RF-D-11) ------------------------------------------------

  protected readonly anteprima = signal<TemplateOutput | undefined>(undefined);

  protected urlAnteprima(template: TemplateOutput): string {
    return this.api.urlAnteprima(template.id);
  }

  // --- Predefinito per formato (RF-D-13) e nome ---------------------------

  protected impostaPredefinito(template: TemplateOutput, predefinito: boolean): void {
    this.api.impostaPredefinito(template.id, predefinito).subscribe({
      next: (elenco) => this.risorsaTemplate.set(elenco),
    });
  }

  /** Il template in rinomina, finché non si conferma o si esce. */
  protected readonly inRinomina = signal<Id | undefined>(undefined);
  protected readonly nuovoNome = signal('');

  protected iniziaRinomina(template: TemplateOutput): void {
    this.inRinomina.set(template.id);
    this.nuovoNome.set(template.nome);
  }

  protected confermaRinomina(template: TemplateOutput): void {
    const nome = this.nuovoNome().trim();
    this.inRinomina.set(undefined);
    if (!nome || nome === template.nome) return;
    this.api.rinomina(template.id, nome).subscribe({
      next: (elenco) => this.risorsaTemplate.set(elenco),
    });
  }

  protected annullaRinomina(): void {
    this.inRinomina.set(undefined);
  }

  // --- Caricamento (RF-D-12) ----------------------------------------------

  private readonly vociCoda = signal<FileInCoda[]>([]);
  protected readonly coda = this.vociCoda.asReadonly();

  protected carica(file: File[]): void {
    if (!file.length) return;
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
          aggiorna((v) => ({
            ...v,
            percentuale: Math.round((evento.loaded / evento.total!) * 100),
          }));
        }
        if (evento.type === HttpEventType.Response) {
          aggiorna((v) => ({ ...v, stato: 'completato', percentuale: 100 }));
          this.risorsaTemplate.reload();
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

  protected readonly confermaEliminazione = signal<Id | undefined>(undefined);

  protected elimina(template: TemplateOutput): void {
    if (this.confermaEliminazione() !== template.id) {
      this.confermaEliminazione.set(template.id);
      return;
    }
    this.confermaEliminazione.set(undefined);
    this.api.elimina(template.id).subscribe({ next: () => this.risorsaTemplate.reload() });
  }
}
