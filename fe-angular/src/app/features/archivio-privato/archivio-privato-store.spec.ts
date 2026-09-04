import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ArchivioPrivatoStore } from './archivio-privato-store';
import { Cartella, DocumentoPrivato, Paginato, StatoElaborazione } from '@core/models';

function documento(id: string, stato: StatoElaborazione): DocumentoPrivato {
  return {
    id,
    archivio: 'privato',
    titolo: `Documento ${id}`,
    tipologia: 'preventivo',
    fileUrl: `/api/documenti-privati/${id}/file`,
    stato,
    dimensioneByte: 240_000,
    caricatoDa: 'utn-001',
    caricatoIl: '2026-08-04T10:00:00+02:00',
    etichette: [],
    documentoDiRiferimento: false,
    visibilita: 'tenant',
  };
}

const pagina = (elementi: DocumentoPrivato[]): Paginato<DocumentoPrivato> => ({
  elementi,
  totale: elementi.length,
  pagina: 1,
  perPagina: 20,
});

const oltreLAttesa = () => new Promise((r) => setTimeout(r, 400));

describe('ArchivioPrivatoStore', () => {
  let store: ArchivioPrivatoStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      /* Lo store legge dall'URL dove si sta guardando (la cartella aperta è un
         posto, e un posto ha un indirizzo): senza router non si costruisce. */
      providers: [
        ArchivioPrivatoStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(ArchivioPrivatoStore);
    http = TestBed.inject(HttpTestingController);
  });

  /* Come per l'archivio pubblico: qui si prova la logica, non la contabilità
     delle chiamate. Le richieste aperte si svuotano senza pretese. */
  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  /** Soddisfa le risorse che partono da sole alla costruzione. */
  async function avvia(elementi: DocumentoPrivato[], albero: Cartella[] = []) {
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne((r) => r.url.startsWith('/api/documenti-privati')).flush(pagina(elementi));
    http.match('/api/etichette').forEach((r) => r.flush([]));
    http.match('/api/spazio').forEach((r) =>
      r.flush({
        usatoByte: 1_000_000,
        limiteByte: 5_000_000_000,
        limiteFileByte: 20_000_000,
        numeroDocumenti: elementi.length,
      }),
    );
    // Fase 10: l'albero delle cartelle e l'anagrafica clienti.
    http.match('/api/cartelle').forEach((r) => r.flush({ radici: albero, daSistemare: 2 }));
    http
      .match('/api/clienti')
      .forEach((r) => r.flush({ elementi: [], totale: 0, pagina: 1, perPagina: 50 }));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('non interroga il server quando tutti i documenti sono assestati', async () => {
    await avvia([documento('a', 'pronto'), documento('b', 'errore')]);

    expect(store.inTransito()).toBe(false);
  });

  it('riconosce che c è ancora qualcosa in lavorazione', async () => {
    await avvia([documento('a', 'pronto'), documento('b', 'in-elaborazione')]);

    /* RF-B-05: finché un documento non è assestato lo stato va aggiornato da
       solo, e questo segnale è ciò che accende l'interrogazione periodica. */
    expect(store.inTransito()).toBe(true);
  });

  it('considera in transito anche la sola coda', async () => {
    await avvia([documento('a', 'in-coda')]);
    expect(store.inTransito()).toBe(true);
  });

  it('non considera attivo alcun filtro all apertura', async () => {
    await avvia([]);

    expect(store.filtriAttivi()).toBe(false);
    store.stato.set('errore');
    expect(store.filtriAttivi()).toBe(true);
  });

  it('riporta a pagina 1 quando cambia un filtro', async () => {
    await avvia([]);

    store.pagina.set(3);
    expect(store.pagina()).toBe(3);

    store.etichetta.set('Rossi Mario');
    expect(store.pagina()).toBe(1);
  });

  it('non manda la ricerca al server prima della fine dell attesa', async () => {
    await avvia([]);

    store.ricerca.set('rossi');
    expect(store.filtri().q).toBeUndefined();

    await oltreLAttesa();
    expect(store.filtri().q).toBe('rossi');
  });

  it('azzera tutti i filtri', async () => {
    await avvia([]);

    store.tipologia.set('polizza');
    store.stato.set('pronto');
    store.etichetta.set('RC Auto');
    store.soloRiferimenti.set(true);
    store.ricerca.set('qualcosa');
    await oltreLAttesa();

    store.azzeraFiltri();
    await oltreLAttesa();

    expect(store.filtriAttivi()).toBe(false);
    expect(store.filtri().q).toBeUndefined();
    expect(store.filtri().soloRiferimenti).toBe(false);
  });

  it('mette i file in coda e segna l avanzamento', async () => {
    await avvia([]);

    const file = new File(['contenuto'], 'preventivo.pdf', { type: 'application/pdf' });
    store.carica([file]);

    expect(store.coda().length).toBe(1);
    expect(store.coda()[0].nome).toBe('preventivo.pdf');
    expect(store.coda()[0].stato).toBe('in-corso');
    expect(store.caricamentiInCorso()).toBe(1);

    const richiesta = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/documenti-privati',
    );
    richiesta.flush({ creati: [documento('nuovo', 'in-coda')] });

    expect(store.coda()[0].stato).toBe('completato');
    expect(store.caricamentiInCorso()).toBe(0);
  });

  it('riporta nella coda il motivo del rifiuto', async () => {
    await avvia([]);

    store.carica([new File(['x'], 'enorme.pdf')]);
    http
      .expectOne((r) => r.method === 'POST' && r.url === '/api/documenti-privati')
      .flush(
        { codice: 'FILE_TROPPO_GRANDE', messaggio: '«enorme.pdf» supera il limite di 20 MB.' },
        { status: 413, statusText: 'Payload Too Large' },
      );

    /* Un caricamento rifiutato deve dire *perché*: "non riuscito" lascia
       l'utente a riprovare all'infinito con lo stesso file. */
    expect(store.coda()[0].stato).toBe('errore');
    expect(store.coda()[0].messaggio).toContain('supera il limite');
  });

  it('svuota dalla coda solo ciò che si è concluso', async () => {
    await avvia([]);

    store.carica([new File(['x'], 'primo.pdf')]);
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ creati: [documento('n', 'in-coda')] });

    store.svuotaCoda();
    expect(store.coda().length).toBe(0);
  });

  // --- Cartelle (Fase 10) ---------------------------------------------------

  const cartella = (id: string, nome: string, figli: Cartella[] = []): Cartella => ({
    id,
    nome,
    percorso: nome,
    descrizioneDaUtente: false,
    documenti: 0,
    documentiTotali: 0,
    figli,
  });

  it('aprire una cartella e aprire «Da sistemare» sono due viste che si escludono', async () => {
    await avvia([], [cartella('c1', 'Clienti')]);

    await store.apri('c1');
    expect(store.filtri().cartellaId).toBe('c1');
    expect(store.filtri().daSistemare).toBe(false);

    /* Il non collocato non sta *in* nessuna cartella: chiederlo dentro una
       cartella non vorrebbe dire niente, e il filtro deve dirlo. */
    await store.apriDaSistemare();
    expect(store.filtri().daSistemare).toBe(true);
    expect(store.filtri().cartellaId).toBeUndefined();

    await store.apri(undefined);
    expect(store.filtri().cartellaId).toBeUndefined();
    expect(store.filtri().daSistemare).toBe(false);
  });

  it('la cartella aperta non conta come filtro attivo', async () => {
    await avvia([], [cartella('c1', 'Clienti')]);

    await store.apri('c1');
    /* Altrimenti «Azzera i filtri» ti sposterebbe fuori dalla cartella invece
       di ripulire la ricerca: sarebbe un pulsante che fa due cose. */
    expect(store.filtriAttivi()).toBe(false);

    store.ricerca.set('rossi');
    expect(store.filtriAttivi()).toBe(true);
  });

  it('appiattisce l albero per le tendine di spostamento', async () => {
    await avvia(
      [],
      [cartella('c1', 'Clienti', [cartella('c2', 'Rossi Mario')]), cartella('u1', 'Utils')],
    );

    expect(store.cartelleInPiano().map((c) => c.id)).toEqual(['c1', 'c2', 'u1']);
    await store.apri('c2');
    expect(store.cartellaCorrente()?.nome).toBe('Rossi Mario');
  });

  it('dà la catena per risalire da una cartella profonda', async () => {
    /* Clienti › Rossi Mario › Auto: è il caso in cui prima si restava
       intrappolati, perché le briciole si fermavano alla radice. */
    const auto = cartella('c3', 'Auto');
    auto.parentId = 'c2';
    const rossi = cartella('c2', 'Rossi Mario', [auto]);
    rossi.parentId = 'c1';
    await avvia([], [cartella('c1', 'Clienti', [rossi])]);

    await store.apri('c3');
    expect(store.catenaCartelle().map((c) => c.nome)).toEqual([
      'Clienti',
      'Rossi Mario',
      'Auto',
    ]);

    // E si risale davvero: aprire il penultimo anello porta un livello sopra.
    await store.apri('c2');
    expect(store.cartellaCorrente()?.nome).toBe('Rossi Mario');
    expect(store.catenaCartelle().map((c) => c.nome)).toEqual(['Clienti', 'Rossi Mario']);

    // Alla radice la catena è vuota: non si è dentro niente.
    await store.apri(undefined);
    expect(store.catenaCartelle()).toEqual([]);
  });

  it('mostra quanti documenti aspettano di essere sistemati', async () => {
    await avvia([], [cartella('c1', 'Clienti')]);
    expect(store.quantiDaSistemare()).toBe(2);
  });
});
