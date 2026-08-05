import { HttpErrorResponse, HttpEventType, httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';

import {
  Compagnia,
  DocumentoRiferimento,
  ErroreApi,
  Id,
  ModificheRegola,
  ModificheRiferimento,
  NuovaRegola,
  Ramo,
  RegolaIstruzione,
  VoceStoricoImpostazioni,
} from '@core/models';
import { DocumentiApi } from '@core/api/documenti-api';
import { FileInCoda } from '@shared/caricamento/coda-caricamento';
import { ImpostazioniApi } from '@core/api/impostazioni-api';
import { IstruzioniApi } from '@core/api/istruzioni-api';
import { SessioneStore } from '@core/auth/sessione-store';
import { pesoContesto } from './peso-contesto';

/**
 * Stato della sezione Istruzioni (RF-D-04…D-08, D-14…D-16).
 *
 * Le due nature — regole scritte e documenti di riferimento — condividono
 * ambito, permesso e storico, quindi condividono lo store. La coda di
 * caricamento ricalca quella dell'Archivio Privato: stessa forma, stesso
 * componente in interfaccia.
 */
@Injectable()
export class IstruzioniStore {
  private readonly api = inject(IstruzioniApi);
  private readonly apiImpostazioni = inject(ImpostazioniApi);
  private readonly apiDocumenti = inject(DocumentiApi);
  private readonly sessione = inject(SessioneStore);

  // --- Risorse ------------------------------------------------------------

  private readonly risorsaRegole = httpResource<RegolaIstruzione[]>(() => this.api.urlRegole());
  private readonly risorsaRiferimenti = httpResource<DocumentoRiferimento[]>(() =>
    this.api.urlRiferimenti(),
  );
  private readonly risorsaStorico = httpResource<VoceStoricoImpostazioni[]>(() =>
    this.apiImpostazioni.urlStorico(['regola', 'documento-riferimento']),
  );
  private readonly risorsaRami = httpResource<Ramo[]>(() => this.apiDocumenti.urlRami());
  private readonly risorsaCompagnie = httpResource<Compagnia[]>(() =>
    this.apiDocumenti.urlCompagnie(),
  );

  readonly regole = computed(() =>
    this.risorsaRegole.hasValue() ? this.risorsaRegole.value() : [],
  );
  readonly riferimenti = computed(() =>
    this.risorsaRiferimenti.hasValue() ? this.risorsaRiferimenti.value() : [],
  );
  readonly storico = computed(() =>
    this.risorsaStorico.hasValue() ? this.risorsaStorico.value() : [],
  );
  readonly rami = computed(() => (this.risorsaRami.hasValue() ? this.risorsaRami.value() : []));
  readonly compagnie = computed(() =>
    this.risorsaCompagnie.hasValue() ? this.risorsaCompagnie.value() : [],
  );

  readonly inCaricamento = computed(
    () => this.risorsaRegole.isLoading() || this.risorsaRiferimenti.isLoading(),
  );
  readonly errore = computed(() => this.risorsaRegole.error() ?? this.risorsaRiferimenti.error());

  /** RF-D-15: la gestione è dell'amministratore; gli altri leggono. */
  readonly puoGestire = computed(() => this.sessione.puo('istruzioni.gestisci'));

  /** RF-D-16: il conto del contesto permanente. */
  readonly contesto = computed(() => pesoContesto(this.riferimenti()));

  riprova(): void {
    this.risorsaRegole.reload();
    this.risorsaRiferimenti.reload();
  }

  private dopoScrittura(): void {
    this.risorsaStorico.reload();
  }

  // --- Regole (RF-D-04/06) ------------------------------------------------

  creaRegola(nuova: NuovaRegola, fatto?: () => void): void {
    this.api.creaRegola(nuova).subscribe({
      next: () => {
        this.risorsaRegole.reload();
        this.dopoScrittura();
        fatto?.();
      },
    });
  }

  modificaRegola(id: Id, modifiche: ModificheRegola, fatto?: () => void): void {
    this.api.modificaRegola(id, modifiche).subscribe({
      next: () => {
        this.risorsaRegole.reload();
        this.dopoScrittura();
        fatto?.();
      },
    });
  }

  eliminaRegola(id: Id): void {
    this.api.eliminaRegola(id).subscribe({
      next: () => {
        this.risorsaRegole.reload();
        this.dopoScrittura();
      },
    });
  }

  // --- Documenti di riferimento (RF-D-14/16) ------------------------------

  private readonly vociCoda = signal<FileInCoda[]>([]);
  readonly coda = this.vociCoda.asReadonly();

  /** Stesso schema dell'Archivio Privato: righe in coda, non una modale. */
  carica(file: File[]): void {
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

    this.api.caricaRiferimenti(file).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          const percentuale = Math.round((evento.loaded / evento.total) * 100);
          aggiorna((v) => ({ ...v, percentuale }));
        }
        if (evento.type === HttpEventType.Response) {
          aggiorna((v) => ({ ...v, stato: 'completato', percentuale: 100 }));
          this.risorsaRiferimenti.reload();
          this.dopoScrittura();
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

  svuotaCoda(): void {
    this.vociCoda.update((c) => c.filter((v) => v.stato === 'in-corso'));
  }

  modificaRiferimento(id: Id, modifiche: ModificheRiferimento): void {
    this.api.modificaRiferimento(id, modifiche).subscribe({
      next: () => {
        this.risorsaRiferimenti.reload();
        this.dopoScrittura();
      },
    });
  }

  eliminaRiferimento(id: Id): void {
    this.api.eliminaRiferimento(id).subscribe({
      next: () => {
        this.risorsaRiferimenti.reload();
        this.dopoScrittura();
      },
    });
  }
}
