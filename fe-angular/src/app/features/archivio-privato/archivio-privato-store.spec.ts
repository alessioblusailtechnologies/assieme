import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { ArchivioPrivatoStore } from './archivio-privato-store';
import { DocumentoPrivato, Paginato, StatoElaborazione } from '@core/models';

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
      providers: [ArchivioPrivatoStore, provideHttpClient(), provideHttpClientTesting()],
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

  /** Soddisfa le tre risorse che partono da sole alla costruzione. */
  async function avvia(elementi: DocumentoPrivato[]) {
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
});
