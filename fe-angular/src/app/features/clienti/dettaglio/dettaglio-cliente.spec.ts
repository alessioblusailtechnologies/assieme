import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { DettaglioCliente } from './dettaglio-cliente';
import type { DocumentoPrivato, Paginato, StatoElaborazione } from '@core/models';

const ID_CLIENTE = 'cca716c8-c95b-45e5-8004-cc650c4590e5';

function documento(id: string, stato: StatoElaborazione): DocumentoPrivato {
  return {
    id,
    archivio: 'privato',
    titolo: `Documento ${id}`,
    tipologia: 'polizza',
    fileUrl: `/api/documenti-privati/${id}/file`,
    stato,
    dimensioneByte: 240_000,
    caricatoDa: 'utn-001',
    caricatoIl: '2026-09-13T19:53:07+02:00',
    etichette: [],
    documentoDiRiferimento: false,
    visibilita: 'tenant',
    cliente: { id: ID_CLIENTE, nome: 'Rossi Mario' },
  };
}

const pagina = (elementi: DocumentoPrivato[]): Paginato<DocumentoPrivato> => ({
  elementi,
  totale: elementi.length,
  pagina: 1,
  perPagina: 100,
});

const unGiro = () => new Promise((r) => setTimeout(r, 0));

describe('DettaglioCliente, documenti', () => {
  let fixture: ComponentFixture<DettaglioCliente>;
  let componente: DettaglioCliente;
  let http: HttpTestingController;

  const elenco = (elementi: DocumentoPrivato[]) =>
    http
      .match((r) => r.method === 'GET' && r.url.startsWith('/api/documenti-privati'))
      .forEach((r) => r.flush(pagina(elementi)));

  async function apriScheda(): Promise<ComponentFixture<DettaglioCliente>> {
    const scheda = TestBed.createComponent(DettaglioCliente);
    scheda.componentRef.setInput('id', ID_CLIENTE);
    scheda.detectChanges();
    await unGiro();
    elenco([]);
    await unGiro();
    return scheda;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DettaglioCliente],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = await apriScheda();
    componente = fixture.componentInstance;
  });

  it('la riga del file compare alla scelta, e il cliente viaggia col caricamento', () => {
    componente['carica']([new File(['contenuto'], 'polizza.pdf', { type: 'application/pdf' })]);

    /* Prima di qualunque risposta: era qui il momento in cui non succedeva nulla. */
    expect(componente['inSalita']().map((v) => v.nome)).toEqual(['polizza.pdf']);

    const invio = http.expectOne((r) => r.method === 'POST' && r.url === '/api/documenti-privati');
    const corpo = invio.request.body as FormData;
    expect([...corpo.keys()]).toEqual(['clienteId', 'file']);
    expect(corpo.get('clienteId')).toBe(ID_CLIENTE);

    invio.flush({ creati: [documento('nuovo', 'in-coda')] });
    /* Nasce intestato: nessuna seconda richiesta per assegnarlo. */
    expect(http.match((r) => r.url.endsWith('/assegna'))).toHaveLength(0);
  });

  it('la riga provvisoria cede il posto al documento vero, senza vuoto in mezzo', async () => {
    componente['carica']([new File(['x'], 'polizza.pdf')]);
    http.expectOne((r) => r.method === 'POST').flush({ creati: [documento('nuovo', 'in-coda')] });
    TestBed.tick();

    /* Il server ha risposto ma l'elenco non è ancora tornato: la riga resta. */
    expect(componente['inSalita']()).toHaveLength(1);

    await unGiro();
    elenco([documento('nuovo', 'in-coda')]);
    await unGiro();

    expect(componente['inSalita']()).toHaveLength(0);
    /* Ed è quello che accende l'aggiornamento periodico dello stato. */
    expect(componente['inTransito']()).toBe(true);
  });

  it('un caricamento rifiutato resta sulla riga, col motivo', () => {
    componente['carica']([new File(['x'], 'enorme.pdf')]);
    http.expectOne((r) => r.method === 'POST').flush(
      { codice: 'FILE_TROPPO_GRANDE', messaggio: '«enorme.pdf» supera il limite di 20 MB per file.' },
      { status: 413, statusText: 'Payload Too Large' },
    );

    const [riga] = componente['inSalita']();
    expect(riga?.errore).toContain('supera il limite');
  });

  it('uscire e rientrare durante la salita: le righe restano e l elenco si rilegge alla fine', async () => {
    /* 14/09/2026: dieci file caricati, indietro e di nuovo nella scheda, e la
       scheda restava vuota fino al refresh. */
    componente['carica']([new File(['x'], 'a.pdf'), new File(['y'], 'b.pdf')]);
    const invio = http.expectOne((r) => r.method === 'POST');

    /* Si esce: la scheda muore, il caricamento no. Si rientra, e il server
       non ha ancora nessuna riga, perché il lotto le crea tutte alla fine. */
    fixture.destroy();
    const rientro = (await apriScheda()).componentInstance;
    expect(rientro['inSalita']().map((v) => v.nome)).toEqual(['a.pdf', 'b.pdf']);

    invio.flush({ creati: [documento('a', 'in-coda'), documento('b', 'in-coda')] });
    TestBed.tick();
    await unGiro();
    elenco([documento('a', 'in-coda'), documento('b', 'in-coda')]);
    await unGiro();

    expect(rientro['documenti']().map((d) => d.id)).toEqual(['a', 'b']);
    expect(rientro['inSalita']()).toHaveLength(0);
  });

  it('le righe di un altro cliente non entrano nella scheda', async () => {
    fixture.componentRef.setInput('id', 'altro-cliente');
    componente['carica']([new File(['x'], 'di-un-altro.pdf')]);

    fixture.destroy();
    const rientro = (await apriScheda()).componentInstance;

    expect(rientro['inSalita']()).toHaveLength(0);
  });
});
