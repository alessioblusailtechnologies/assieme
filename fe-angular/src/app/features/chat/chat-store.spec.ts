import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpDownloadProgressEvent, HttpEventType, provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

import { ChatStore } from './chat-store';
import { Conversazione, DocumentoGenerato, EventoStream } from '@core/models';

function conversazione(id: string): Conversazione {
  return {
    id,
    titolo: 'Nuova conversazione',
    creataIl: '2026-08-05T09:00:00+02:00',
    aggiornataIl: '2026-08-05T09:00:00+02:00',
    documentiInContesto: [],
    condivisa: false,
    autoreId: 'utn-004',
  };
}

const blocco = (evento: EventoStream) => `data: ${JSON.stringify(evento)}\n\n`;

/** Qualche frame: la dattilografia scrive pochi caratteri alla volta. */
const attendiDattilografia = async () => {
  for (let i = 0; i < 90; i++) await new Promise<void>((ok) => requestAnimationFrame(() => ok()));
};

const microtask = () => new Promise((r) => setTimeout(r, 0));

describe('ChatStore', () => {
  let store: ChatStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatStore,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    });
    store = TestBed.inject(ChatStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  /** Soddisfa le risorse che partono da sole alla costruzione. */
  async function avvia(conversazioni: Conversazione[] = []) {
    await microtask();
    http.match('/api/conversazioni').forEach((r) =>
      r.flush({
        elementi: conversazioni,
        totale: conversazioni.length,
        pagina: 1,
        perPagina: 50,
      }),
    );
    http.match('/api/template').forEach((r) => r.flush([]));
    await microtask();
  }

  /**
   * Fa partire l'invio dalla schermata «nuova»: crea la conversazione e
   * risponde agli eventi iniziali dello stream. Restituisce la richiesta di
   * streaming ancora aperta, per pilotarla dal test.
   */
  async function invia(testo: string) {
    store.bozza.set(testo);
    store.invia();
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/conversazioni')
      .flush(conversazione('cnv-1'), { status: 201, statusText: 'Created' });
    await microtask();
    return http.expectOne((r) => r.method === 'POST' && r.url === '/api/conversazioni/cnv-1/messaggi');
  }

  it('mostra subito il messaggio inviato, prima di ogni risposta', async () => {
    await avvia();
    await invia('Che franchigie prevede?');

    const messaggi = store.messaggi();
    expect(messaggi.length).toBe(1);
    expect(messaggi[0].autore).toBe('utente');
    expect(messaggi[0].testo).toBe('Che franchigie prevede?');
    expect(store.bozza()).toBe('');
    expect(store.inRisposta()).toBe(true);
  });

  it('fa crescere la risposta a ogni evento di testo', async () => {
    await avvia();
    const stream = await invia('Domanda');

    let ricevuto = '';
    const manda = (evento: EventoStream) => {
      ricevuto += blocco(evento);
      stream.event({
        type: HttpEventType.DownloadProgress,
        loaded: ricevuto.length,
        partialText: ricevuto,
      } as HttpDownloadProgressEvent);
    };

    manda({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' });
    manda({ tipo: 'testo', delta: 'Sulle ' });
    manda({ tipo: 'testo', delta: 'franchigie…' });
    /* Il testo esce a ritmo di dattilografia, qualche carattere per frame. */
    await attendiDattilografia();

    const messaggi = store.messaggi();
    expect(messaggi.length).toBe(2);
    /* L'id ottimistico è stato riconciliato con quello del server: un
       ricaricamento a stream aperto non duplicherà il messaggio. */
    expect(messaggi[0].id).toBe('msg-8');
    expect(messaggi[1].id).toBe('msg-9');
    expect(messaggi[1].testo).toBe('Sulle franchigie…');
    expect(messaggi[1].inCorso).toBe(true);
  });

  it('consolida la coppia alla fine e ricarica lo storico', async () => {
    await avvia();
    const stream = await invia('Domanda');

    const eventi = [
      blocco({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' }),
      blocco({ tipo: 'testo', delta: 'Risposta.' }),
      blocco({
        tipo: 'citazione',
        citazione: {
          id: 'cit-1',
          documentoId: 'doc-pub-002',
          documentoTitolo: 'DIP Aggiuntivo',
          archivio: 'pubblico',
          posizione: { pagina: 8 },
          estratto: 'Il massimale…',
        },
      }),
      blocco({ tipo: 'fine' }),
    ].join('');
    stream.flush(eventi);

    expect(store.inRisposta()).toBe(false);
    const risposta = store.messaggi()[1];
    expect(risposta.inCorso).toBe(false);
    expect(risposta.citazioni.length).toBe(1);

    /* Titolo, ordinamento e contesto sono cambiati sul server: l'elenco si
       richiede da capo invece di ricalcolarli qui. */
    await microtask();
    expect(http.match('/api/conversazioni').length).toBe(1);
  });

  it('mostra ciò che la memoria ha imparato dallo scambio (RF-G-01) e chiude l’attività', async () => {
    await avvia();
    const stream = await invia('Come gestiamo le franchigie?');

    let ricevuto = blocco({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' });
    ricevuto += blocco({ tipo: 'testo', delta: 'Franchigia fissa.' });
    ricevuto += blocco({ tipo: 'attivita', etichetta: 'Cerco qualcosa da ricordare' });
    stream.event({
      type: HttpEventType.DownloadProgress,
      loaded: ricevuto.length,
      partialText: ricevuto,
    } as HttpDownloadProgressEvent);
    expect(store.messaggi()[1].attivita).toBe('Cerco qualcosa da ricordare');

    ricevuto += blocco({
      tipo: 'memoria',
      ricordi: [{ id: 'ric-9', testo: 'L’agenzia privilegia le franchigie fisse.', categoria: 'prassi', ambito: 'tenant' }],
    });
    ricevuto += blocco({ tipo: 'fine' });
    stream.flush(ricevuto);
    const risposta = store.messaggi()[1];
    expect(risposta.attivita).toBeUndefined();
    expect(risposta.ricordiAppresi?.map((r) => r.id)).toEqual(['ric-9']);
  });

  it('segnala la risposta non fondata sui documenti (RF-C-08)', async () => {
    await avvia();
    const stream = await invia('Copre la grandine?');

    stream.flush(
      [
        blocco({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' }),
        blocco({ tipo: 'testo', delta: 'Non ho trovato…' }),
        blocco({ tipo: 'non-supportato' }),
        blocco({ tipo: 'fine' }),
      ].join(''),
    );

    expect(store.messaggi()[1].nonSupportato).toBe(true);
  });

  it('conserva il testo parziale quando lo stream cade, e lo marca', async () => {
    await avvia();
    const stream = await invia('Domanda');

    stream.flush(
      [
        blocco({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' }),
        blocco({ tipo: 'testo', delta: 'Testo a metà' }),
        blocco({ tipo: 'errore', messaggio: 'Il servizio si è interrotto.' }),
      ].join(''),
    );

    const risposta = store.messaggi()[1];
    expect(risposta.testo).toBe('Testo a metà');
    expect(risposta.erroreStream).toContain('interrotto');
    expect(store.inRisposta()).toBe(false);
  });

  it('fermare la risposta interrompe la richiesta e conserva il parziale', async () => {
    await avvia();
    const stream = await invia('Domanda');

    let ricevuto = blocco({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' });
    ricevuto += blocco({ tipo: 'testo', delta: 'Prime parole' });
    stream.event({
      type: HttpEventType.DownloadProgress,
      loaded: ricevuto.length,
      partialText: ricevuto,
    } as HttpDownloadProgressEvent);

    store.ferma();

    expect(stream.cancelled).toBe(true);
    const risposta = store.messaggi()[1];
    expect(risposta.testo).toBe('Prime parole');
    expect(risposta.interrotto).toBe(true);
    expect(store.inRisposta()).toBe(false);
  });

  it('se l invio fallisce la bozza torna al composer', async () => {
    await avvia();
    store.bozza.set('Domanda importante');
    store.invia();

    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/conversazioni')
      .flush(
        { codice: 'ERRORE_INTERNO', messaggio: 'Non disponibile.' },
        { status: 500, statusText: 'Server Error' },
      );
    await microtask();

    expect(store.bozza()).toBe('Domanda importante');
    expect(store.messaggi().length).toBe(0);
  });

  it('senza conversazione i documenti scelti aspettano nella bozza', async () => {
    await avvia();

    store.aggiungiAlContesto({ id: 'doc-pub-002', titolo: 'DIP Aggiuntivo', archivio: 'pubblico' });

    expect(store.riferimentiBozza().map((r) => r.id)).toEqual(['doc-pub-002']);
    /* Nessuna chiamata al server: il contesto non esiste ancora. */
    expect(http.match((r) => r.url.includes('/contesto/')).length).toBe(0);
  });

  it('non referenzia due volte lo stesso documento', async () => {
    await avvia();
    const doc = { id: 'doc-pub-002', titolo: 'DIP Aggiuntivo', archivio: 'pubblico' as const };

    store.aggiungiRiferimento(doc);
    store.aggiungiRiferimento(doc);

    expect(store.riferimentiBozza().length).toBe(1);
  });

  /* --- Output della conversazione ------------------------------------- */

  /** Un messaggio del filo, con quel che serve a questi test e nulla di più. */
  function messaggio(
    id: string,
    autore: 'utente' | 'assistente',
    inviatoIl: string,
    documenti?: DocumentoGenerato[],
  ) {
    return {
      id,
      conversazioneId: 'cnv-1',
      autore,
      testo: 'testo',
      inviatoIl,
      documentiReferenziati: [],
      citazioni: [],
      provenienze: [],
      ...(documenti && { documenti }),
    };
  }

  const proposta: DocumentoGenerato = {
    id: 'doc-a',
    nome: 'Proposta Rossi',
    formato: 'pdf',
    template: 'Proposta breve',
    url: '/api/conversazioni/cnv-1/documenti/doc-a',
  };
  const confronto: DocumentoGenerato = {
    id: 'doc-b',
    nome: 'Confronto garanzie',
    formato: 'xlsx',
    url: '/api/conversazioni/cnv-1/documenti/doc-b',
  };

  async function conFilo() {
    await avvia([conversazione('cnv-1')]);
    store.apri('cnv-1');
    http
      .expectOne('/api/conversazioni/cnv-1/messaggi')
      .flush([
        messaggio('m-1', 'utente', '2026-08-26T09:00:00+02:00'),
        messaggio('m-2', 'assistente', '2026-08-26T09:01:00+02:00', [proposta]),
        messaggio('m-3', 'assistente', '2026-08-26T09:05:00+02:00', [confronto]),
      ]);
    await microtask();
  }

  it('l’output raccoglie i documenti prodotti, dal più recente', async () => {
    await conFilo();

    expect(store.output().map((d) => d.id)).toEqual(['doc-b', 'doc-a']);
    /* L'ora è quella della risposta che l'ha generato: di due versioni dello
       stesso documento è l'unica cosa che le distingue. */
    expect(store.output()[1].prodottoIl).toBe('2026-08-26T09:01:00+02:00');
    expect(store.output()[1].template).toBe('Proposta breve');
  });

  it('un documento arrivato in streaming entra nell’output senza ricaricare', async () => {
    await avvia();
    const stream = await invia('Preparami la proposta');

    let ricevuto = '';
    const manda = (evento: EventoStream) => {
      ricevuto += blocco(evento);
      stream.event({
        type: HttpEventType.DownloadProgress,
        loaded: ricevuto.length,
        partialText: ricevuto,
      } as HttpDownloadProgressEvent);
    };

    manda({ tipo: 'inizio', messaggioId: 'msg-9', messaggioUtenteId: 'msg-8' });
    manda({ tipo: 'documento', documento: proposta });
    await microtask();

    expect(store.output().map((d) => d.id)).toEqual(['doc-a']);
  });

  it('scarica un documento una volta sola, anche a due clic', async () => {
    /* jsdom non implementa `createObjectURL`: qui interessa la richiesta, non
       il file che il browser salverebbe. */
    const url = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    url.createObjectURL = () => 'blob:finto';
    url.revokeObjectURL = () => undefined;

    await conFilo();
    store.scaricaDocumento(store.output()[0]);
    store.scaricaDocumento(store.output()[0]);

    const richieste = http.match('/api/conversazioni/cnv-1/documenti/doc-b');
    expect(richieste.length).toBe(1);
    expect(store.documentoInScaricamento()).toBe('doc-b');

    richieste[0].flush(new Blob(['x']));
    expect(store.documentoInScaricamento()).toBeUndefined();

    delete url.createObjectURL;
    delete url.revokeObjectURL;
  });
});
