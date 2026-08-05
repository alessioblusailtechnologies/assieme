import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';
import { linkedSignal } from '@angular/core';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { CodaCaricamento, FileInCoda } from '@shared/caricamento/coda-caricamento';
import {
  ErroreApi,
  Id,
  IdentitaVisiva,
  TemplateOutput,
  TipologiaOutput,
} from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { ImpostazioniApi } from '@core/api/impostazioni-api';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { TemplateApi } from '@core/api/template-api';
import { VisualizzatorePdf } from '@shared/ui/visualizzatore-pdf/visualizzatore-pdf';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';

const TIPOLOGIE: { valore: TipologiaOutput | ''; etichetta: string }[] = [
  { valore: '', etichetta: 'Nessuna tipologia' },
  { valore: 'confronto', etichetta: 'Confronto polizze' },
  { valore: 'riepilogo-garanzie', etichetta: 'Riepilogo garanzie' },
  { valore: 'proposta-rinnovo', etichetta: 'Proposta di rinnovo' },
  { valore: 'report-interno', etichetta: 'Report interno' },
];

/**
 * Libreria dei template di output (RF-D-10…D-13).
 *
 * Gli stessi template su cui chat e tabelle esportano: qui si vede
 * l'anteprima dell'impaginazione, si associa il predefinito per tipologia e
 * si caricano template propri. Sotto, l'identità visiva dell'agenzia
 * (RF-D-12) che i template applicano alla generazione.
 *
 * Formati al lancio: PDF, DOCX, XLSX. PPTX è rimandato (punto aperto §6.11
 * dell'analisi): la generazione fedele lì è la più onerosa.
 */
@Component({
  selector: 'app-template-output',
  imports: [
    Bottone,
    Campo,
    Cassetto,
    CodaCaricamento,
    Icona,
    Scheletro,
    Select,
    StatoVuoto,
    Tag,
    VisualizzatorePdf,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './template-output.html',
  styleUrl: './template-output.scss',
})
export class TemplateOutputSezione {
  private readonly api = inject(TemplateApi);
  private readonly apiImpostazioni = inject(ImpostazioniApi);
  private readonly sessione = inject(SessioneStore);

  protected readonly tipologie = TIPOLOGIE;

  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() => this.api.urlElenco());
  private readonly risorsaIdentita = httpResource<IdentitaVisiva>(() =>
    this.apiImpostazioni.urlIdentitaVisiva(),
  );

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

  // --- Predefiniti per tipologia (RF-D-13) --------------------------------

  protected cambiaTipologia(template: TemplateOutput, valore: unknown): void {
    const tipologia = (valore || null) as TipologiaOutput | null;
    this.api.impostaTipologia(template.id, tipologia).subscribe({
      next: (elenco) => this.risorsaTemplate.set(elenco),
    });
  }

  // --- Caricamento template propri (RF-D-12) ------------------------------

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
          aggiorna((v) => ({ ...v, percentuale: Math.round((evento.loaded / evento.total!) * 100) }));
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

  // --- Identità visiva (RF-D-12) ------------------------------------------

  /* I campi ripartono dal server a ogni caricamento della risorsa; le
     modifiche locali li sganciano finché non si salva. */
  protected readonly colore = linkedSignal(() =>
    this.risorsaIdentita.hasValue() ? this.risorsaIdentita.value().colorePrimario : '#2f4b7c',
  );
  protected readonly recapiti = linkedSignal(() =>
    this.risorsaIdentita.hasValue() ? this.risorsaIdentita.value().recapiti : '',
  );
  protected readonly firma = linkedSignal(() =>
    this.risorsaIdentita.hasValue() ? this.risorsaIdentita.value().firma : '',
  );
  protected readonly logoUrl = computed(() =>
    this.risorsaIdentita.hasValue() ? this.risorsaIdentita.value().logoUrl : undefined,
  );

  protected readonly identitaModificata = computed(() => {
    if (!this.risorsaIdentita.hasValue()) return false;
    const originale = this.risorsaIdentita.value();
    return (
      this.colore() !== originale.colorePrimario ||
      this.recapiti() !== originale.recapiti ||
      this.firma() !== originale.firma
    );
  });

  protected readonly salvataggioIdentita = signal(false);

  protected salvaIdentita(): void {
    if (this.salvataggioIdentita()) return;
    this.salvataggioIdentita.set(true);
    this.apiImpostazioni
      .salvaIdentitaVisiva({
        colorePrimario: this.colore(),
        recapiti: this.recapiti(),
        firma: this.firma(),
      })
      .subscribe({
        next: (identita) => {
          this.risorsaIdentita.set(identita);
          this.salvataggioIdentita.set(false);
        },
        error: () => this.salvataggioIdentita.set(false),
      });
  }

  protected annullaIdentita(): void {
    this.risorsaIdentita.reload();
  }

  protected caricaLogo(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const file = campo.files?.[0];
    campo.value = '';
    if (!file) return;
    this.apiImpostazioni.caricaLogo(file).subscribe({
      next: () => this.risorsaIdentita.reload(),
    });
  }
}
