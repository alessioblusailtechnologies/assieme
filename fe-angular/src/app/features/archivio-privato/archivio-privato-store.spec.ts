import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ArchivioPrivatoStore } from './archivio-privato-store';
import { Cliente, DocumentoPrivato, Paginato, StatoElaborazione } from '@core/models';

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
      /* Lo store legge dall'URL di chi si sta guardando (un filtro che si
         condivide è un posto, e un posto ha un indirizzo): senza router non
         si costruisce. */
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
  async function avvia(elementi: DocumentoPrivato[], clienti: Cliente[] = []) {
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
    // L'anagrafica: è l'asse su cui l'archivio si filtra.
    http
      .match((r) => r.url.startsWith('/api/clienti'))
      .forEach((r) =>
        r.flush({ elementi: clienti, totale: clienti.length, pagina: 1, perPagina: 50 }),
      );
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

  // --- Clienti --------------------------------------------------------------

  const cliente = (id: string, nome: string): Cliente => ({
    id,
    nome,
    tipo: 'persona',
    alias: [],
    etichette: [],
    stato: 'attivo',
    documenti: 0,
    creatoIl: '2026-09-01T10:00:00+02:00',
  });

  it('guardare un cliente e guardare «senza cliente» sono due viste che si escludono', async () => {
    await avvia([], [cliente('cl1', 'Rossi Mario')]);

    await store.apri('cl1');
    expect(store.filtri().clienteId).toBe('cl1');
    expect(store.filtri().senzaCliente).toBe(false);

    /* Chi non ha cliente non è «di» nessuno: chiederlo mentre se ne guarda
       uno non vorrebbe dire niente, e il filtro deve dirlo. */
    await store.apriSenzaCliente();
    expect(store.filtri().senzaCliente).toBe(true);
    expect(store.filtri().clienteId).toBeUndefined();

    await store.apri(undefined);
    expect(store.filtri().clienteId).toBeUndefined();
    expect(store.filtri().senzaCliente).toBe(false);
  });

  it('il cliente che si sta guardando non conta come filtro attivo', async () => {
    await avvia([], [cliente('cl1', 'Rossi Mario')]);

    await store.apri('cl1');
    /* Altrimenti «Azzera i filtri» ti porterebbe fuori dal cliente invece di
       ripulire la ricerca: sarebbe un pulsante che fa due cose. */
    expect(store.filtriAttivi()).toBe(false);

    store.ricerca.set('polizza');
    expect(store.filtriAttivi()).toBe(true);
  });

  it('sa dire quale cliente si sta guardando', async () => {
    await avvia([], [cliente('cl1', 'Rossi Mario'), cliente('cl2', 'Bianchi Luigi')]);

    await store.apri('cl2');
    expect(store.clienteCorrente()?.nome).toBe('Bianchi Luigi');

    await store.apri(undefined);
    expect(store.clienteCorrente()).toBeUndefined();
  });


  // --- Il lavoro in blocco --------------------------------------------------

  it('la selezione si commuta, si inverte tutta e si azzera', async () => {
    await avvia([documento('a', 'pronto'), documento('b', 'pronto')]);

    store.commuta('a');
    expect(store.selezionati()).toBe(1);
    expect(store.selezionato('a')).toBe(true);
    expect(store.tuttiSelezionati()).toBe(false);

    store.commutaTutti();
    expect(store.selezionati()).toBe(2);
    expect(store.tuttiSelezionati()).toBe(true);

    /* Con tutti selezionati, «seleziona tutti» diventa «deseleziona tutti»:
       è lo stesso gesto, e un secondo pulsante sarebbe uno in più da capire. */
    store.commutaTutti();
    expect(store.selezionati()).toBe(0);
  });

  it('assegna in blocco e poi lascia la selezione vuota', async () => {
    await avvia([documento('a', 'pronto'), documento('b', 'pronto')]);
    store.commutaTutti();

    store.assegna({ clienteId: 'cl1', aggiungiEtichette: ['2026'] });
    const richiesta = http.expectOne(
      (r) => r.method === 'POST' && r.url === '/api/documenti-privati/assegna',
    );
    expect(richiesta.request.body).toEqual({
      clienteId: 'cl1',
      aggiungiEtichette: ['2026'],
      documenti: ['a', 'b'],
    });
    richiesta.flush({ toccati: 2 });

    /* Dopo la scrittura la selezione si svuota: lasciarla piena invita a
       fare due volte lo stesso gesto su trenta documenti. */
    expect(store.selezionati()).toBe(0);
  });

  it('senza niente selezionato non scrive niente', async () => {
    await avvia([documento('a', 'pronto')]);
    store.assegna({ clienteId: 'cl1' });
    http.expectNone((r) => r.url === '/api/documenti-privati/assegna');
  });

  it('rinominare l’etichetta filtrata sposta anche il filtro', async () => {
    await avvia([documento('a', 'pronto')]);
    store.etichetta.set('rc auto');

    store.rinominaEtichetta('rc auto', 'RC Auto');
    http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/etichette/rc%20auto').flush({
      toccati: 1,
    });

    /* Altrimenti si resterebbe a guardare un'etichetta che non esiste più,
       cioè un elenco vuoto senza capire perché. */
    expect(store.etichetta()).toBe('RC Auto');
  });

  it('eliminare l’etichetta filtrata toglie il filtro', async () => {
    await avvia([documento('a', 'pronto')]);
    store.etichetta.set('da buttare');

    store.eliminaEtichetta('da buttare');
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/etichette/da%20buttare').flush({
      toccati: 3,
    });

    expect(store.etichetta()).toBeUndefined();
  });
});
