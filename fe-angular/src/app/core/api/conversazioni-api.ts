import {
  HttpClient,
  HttpDownloadProgressEvent,
  HttpEventType,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env';
import {
  Conversazione,
  DestinatarioEmail,
  EsitoEmailRisposta,
  EventoStream,
  Id,
  Messaggio,
  NuovoMessaggio,
  ModoAllegato,
  RiferimentoDocumento,
  RispostaPrompt,
  RispostaTrascrizione,
  TemplateOutput,
} from '@core/models';
import { SceltaEsporta } from '@shared/esportazione/scelte-esportazione';
import { leggiBlocchiSse } from './sse';

/** Dati con cui nasce una conversazione; il titolo arriva col primo messaggio. */
export interface NuovaConversazione {
  titolo?: string;
  documentiInContesto?: Id[];
}

/**
 * Accesso alla chat conversazionale (Modulo C).
 *
 * La parte che distingue questo servizio dagli altri è `invia()`: la risposta
 * non è un oggetto ma un flusso SSE di `EventoStream`, e arriva dal backend
 * `fetch` di `HttpClient` come download progressivo. Passare da `HttpClient`
 * e non da `fetch` nudo non è un dettaglio: lo streaming attraversa gli
 * stessi interceptor di tutte le altre chiamate, quindi il pannello di
 * sviluppo può rallentarlo o farlo fallire, e domani l'autenticazione vera
 * lo firmerà senza codice dedicato.
 */
@Injectable({ providedIn: 'root' })
export class ConversazioniApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/conversazioni`;

  urlElenco(): string {
    return this.base;
  }

  urlDettaglio(id: Id): string {
    return `${this.base}/${id}`;
  }

  urlMessaggi(id: Id): string {
    return `${this.base}/${id}/messaggi`;
  }

  urlTemplate(): string {
    return `${environment.apiBase}/template`;
  }

  crea(dati: NuovaConversazione = {}): Observable<Conversazione> {
    return this.http.post<Conversazione>(this.base, dati);
  }

  /** Le prossime domande per la schermata iniziale, scritte dal motore a fine risposta. */
  urlSuggerimenti(): string {
    return `${environment.apiBase}/suggerimenti`;
  }

  /** RF-C-01: le conversazioni sono rinominabili. */
  rinomina(id: Id, titolo: string): Observable<Conversazione> {
    return this.http.patch<Conversazione>(`${this.base}/${id}`, { titolo });
  }

  /** RF-C-15: condivisa con i colleghi del tenant, o di nuovo personale. */
  condividi(id: Id, condivisa: boolean): Observable<Conversazione> {
    return this.http.patch<Conversazione>(`${this.base}/${id}`, { condivisa });
  }

  elimina(id: Id): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * RF-C-03: il contesto documentale si governa esplicitamente — un documento
   * vi entra referenziandolo e ne esce solo quando l'utente lo rimuove.
   */
  aggiungiAlContesto(id: Id, documentoId: Id): Observable<Conversazione> {
    return this.http.put<Conversazione>(`${this.base}/${id}/contesto/${documentoId}`, {});
  }

  rimuoviDalContesto(id: Id, documentoId: Id): Observable<Conversazione> {
    return this.http.delete<Conversazione>(`${this.base}/${id}/contesto/${documentoId}`);
  }

  /**
   * RF-C-02: un file allegato dal composer, nel modo che sceglie chi carica.
   *
   * `archivio` — entra nell'Archivio Privato e si legge pagina per pagina,
   * col controllo dei testimoni: resta all'agenzia e le citazioni sono
   * verificate. `rapido` — vive con la conversazione, se ne va con lei, e la
   * lettura è una passata sola con un modello economico.
   */
  caricaAllegato(file: File, modo: ModoAllegato): Observable<RiferimentoDocumento> {
    const corpo = new FormData();
    corpo.append('file', file, file.name);
    return this.http.post<RiferimentoDocumento>(`${this.base}/allegati?modo=${modo}`, corpo);
  }

  /** Lo stato della lettura di un allegato di conversazione, per il chip. */
  urlStatoAllegato(id: Id): string {
    return `${this.base}/allegati/${id}/stato`;
  }

  /** Il file di un allegato, per il visualizzatore. */
  urlFileAllegato(id: Id): string {
    return `${this.base}/allegati/${id}/file`;
  }

  /** Un documento generato in chat su template: il server lo serve da scaricare. */
  scaricaDocumento(conversazioneId: Id, documentoId: Id): Observable<Blob> {
    return this.http.get(`${this.base}/${conversazioneId}/documenti/${documentoId}`, {
      responseType: 'blob',
    });
  }

  /**
   * Invia un messaggio e restituisce il flusso di eventi della risposta.
   *
   * Il testo SSE arriva cumulativo negli eventi di progresso: `indice`
   * ricorda fin dove si è già letto, e ogni pacchetto consegna solo i blocchi
   * completi che contiene. Annullare la sottoscrizione interrompe la
   * richiesta HTTP: è così che il pulsante «ferma la risposta» ferma davvero
   * il server, non solo la propria interfaccia.
   */
  invia(conversazioneId: Id, nuovo: NuovoMessaggio): Observable<EventoStream> {
    return new Observable<EventoStream>((osservatore) => {
      let indice = 0;

      const consegna = (testo: string, flussoChiuso: boolean) => {
        const lettura = leggiBlocchiSse(testo, indice, flussoChiuso);
        indice = lettura.indice;
        for (const dato of lettura.dati) {
          const evento = interpretaEvento(dato);
          if (evento) osservatore.next(evento);
        }
      };

      const sottoscrizione = this.http
        .post(this.urlMessaggi(conversazioneId), nuovo, {
          observe: 'events',
          responseType: 'text',
          reportProgress: true,
        })
        .subscribe({
          next: (evento) => {
            if (evento.type === HttpEventType.DownloadProgress) {
              consegna((evento as HttpDownloadProgressEvent).partialText ?? '', false);
            } else if (evento.type === HttpEventType.Response) {
              consegna((evento.body as string | null) ?? '', true);
              osservatore.complete();
            }
          },
          error: (errore: unknown) => osservatore.error(errore),
        });

      return () => sottoscrizione.unsubscribe();
    });
  }

  /** RF-C-01: lo storico delle conversazioni. */
  messaggi(conversazioneId: Id): Observable<Messaggio[]> {
    return this.http.get<Messaggio[]>(this.urlMessaggi(conversazioneId));
  }

  template(): Observable<TemplateOutput[]> {
    return this.http.get<TemplateOutput[]>(this.urlTemplate());
  }

  /**
   * RF-C-10: esporta una risposta su un template di output (o sul
   * predefinito del formato, o sul layout di piattaforma). Il server genera
   * il file e lo restituisce da scaricare.
   */
  esporta(conversazioneId: Id, messaggioId: Id, scelta: SceltaEsporta): Observable<Blob> {
    return this.http.post(
      `${this.base}/${conversazioneId}/messaggi/${messaggioId}/esporta`,
      scelta,
      { responseType: 'blob' },
    );
  }

  /** La dettatura: l'audio del microfono va al server, torna il testo. */
  trascrivi(audio: Blob): Observable<RispostaTrascrizione> {
    const corpo = new FormData();
    const estensione = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : audio.type.includes('wav') ? 'wav' : 'webm';
    corpo.append('audio', audio, `dettatura.${estensione}`);
    return this.http.post<RispostaTrascrizione>(`${this.base}/trascrizioni`, corpo);
  }

  /** «Scrivi il prompt»: l'abbozzo torna riscritto come richiesta completa, coi documenti nominati. */
  generaPrompt(testo: string, documenti: Id[]): Observable<RispostaPrompt> {
    return this.http.post<RispostaPrompt>(`${this.base}/prompt`, { testo, documenti });
  }

  /** «Invia email»: il server compone e spedisce la risposta con le fonti, a me o a un indirizzo. */
  inviaEmail(conversazioneId: Id, messaggioId: Id, a: DestinatarioEmail): Observable<EsitoEmailRisposta> {
    return this.http.post<EsitoEmailRisposta>(
      `${this.base}/${conversazioneId}/messaggi/${messaggioId}/email`,
      { a },
    );
  }
}

/**
 * Un blocco `data` diventa un `EventoStream`; ciò che non è JSON valido si
 * scarta senza far cadere lo stream. Un keep-alive o un blocco corrotto non
 * devono costare all'utente la risposta che sta già leggendo.
 */
function interpretaEvento(dato: string): EventoStream | undefined {
  try {
    return JSON.parse(dato) as EventoStream;
  } catch {
    return undefined;
  }
}
