import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { DocumentiPrivatiApi } from '@core/api/documenti-privati-api';
import type { ErroreApi, Id } from '@core/models';

/**
 * Un file che sta salendo. La riga compare **alla scelta**, non alla
 * risposta del server: fra le due passano il trasferimento e il
 * salvataggio, e un elenco che in quel tempo resta fermo sembra non aver
 * sentito il gesto.
 */
export interface FileInSalita {
  chiave: number;
  nome: string;
  percentuale: number;
  errore?: string;
  /** I documenti che il caricamento ha creato, quando il server ha risposto. */
  creati?: Id[];
  /** Il cliente a cui il caricamento intesta i documenti. */
  clienteId?: Id;
}

/**
 * I caricamenti di documenti, oltre la vita della pagina che li ha avviati.
 *
 * Il lotto sale in una richiesta sola e il server crea le righe soltanto
 * alla fine, tutte insieme. Finché richiesta e righe provvisorie vivevano
 * nella scheda del cliente, uscire e rientrare durante la salita faceva
 * nascere una scheda che non sapeva niente (14/09/2026): l'elenco chiesto al
 * server tornava vuoto, le righe «in caricamento» erano morte col componente
 * di prima, e la rilettura a caricamento concluso la faceva quel componente,
 * che non c'era più. Dieci documenti caricati, e una scheda vuota fino al
 * refresh.
 *
 * Qui richiesta e righe durano quanto l'applicazione. Chi mostra i documenti
 * legge le righe che lo riguardano e rilegge il suo elenco quando `conclusi`
 * cresce.
 */
@Injectable({ providedIn: 'root' })
export class CaricamentiInCorso {
  private readonly api = inject(DocumentiPrivatiApi);

  private progressivo = 0;
  private readonly stato = signal<FileInSalita[]>([]);
  private readonly contatore = signal(0);

  readonly voci = this.stato.asReadonly();

  /** Cresce a ogni lotto che il server ha accettato: è il momento di rileggere. */
  readonly conclusi = this.contatore.asReadonly();

  carica(file: File[], opzioni: { clienteId?: Id } = {}): void {
    if (!file.length) return;
    const lotto: FileInSalita[] = file.map((f) => ({
      chiave: ++this.progressivo,
      nome: f.name,
      percentuale: 0,
      ...(opzioni.clienteId && { clienteId: opzioni.clienteId }),
    }));
    const chiavi = new Set(lotto.map((v) => v.chiave));
    const aggiorna = (modifica: (v: FileInSalita) => FileInSalita) =>
      this.stato.update((voci) => voci.map((v) => (chiavi.has(v.chiave) ? modifica(v) : v)));

    this.stato.update((voci) => [...lotto, ...voci]);

    this.api.carica(file, opzioni).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          const percentuale = Math.round((evento.loaded / evento.total) * 100);
          aggiorna((v) => ({ ...v, percentuale }));
        }
        if (evento.type === HttpEventType.Response) {
          const creati = (evento.body?.creati ?? []).map((d) => d.id);
          aggiorna((v) => ({ ...v, percentuale: 100, creati }));
          this.contatore.update((n) => n + 1);
        }
      },
      error: (err: HttpErrorResponse) => {
        const errore = (err.error as ErroreApi | null)?.messaggio ?? 'Caricamento non riuscito.';
        aggiorna((v) => ({ ...v, errore }));
      },
    });
  }

  /** Toglie le righe che non servono più: già sostituite dai documenti veri, o rifiutate e lette. */
  dimentica(chiavi: Iterable<number>): void {
    const via = new Set(chiavi);
    if (!via.size) return;
    this.stato.update((voci) => voci.filter((v) => !via.has(v.chiave)));
  }
}
