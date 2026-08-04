import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { DocumentoPubblico, Paginato } from '@core/models';
import { ElencoDocumenti } from './elenco-documenti';

function documento(id: string, titolo: string, corrente = true): DocumentoPubblico {
  return {
    id,
    archivio: 'pubblico',
    titolo,
    tipologia: 'dip-aggiuntivo',
    fileUrl: `/api/documenti/${id}/file`,
    numeroPagine: 18,
    compagnia: { id: 'cmp-generali', nome: 'Generali Italia' },
    ramo: { id: 'ram-auto', nome: 'RC Auto e veicoli', codice: 'rc-auto' },
    prodotto: 'Active Veicoli AUTOPIÙ con Telematica',
    edizione: { id: 'edz-1', etichetta: 'ed. 04/2026', validaDal: '2026-04-01', corrente },
    preferito: false,
  };
}

const PAGINA: Paginato<DocumentoPubblico> = {
  elementi: [
    documento('doc-1', 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica'),
    documento('doc-2', 'Condizioni di Assicurazione — Active Veicoli', false),
  ],
  totale: 2,
  pagina: 1,
  perPagina: 20,
};

describe('ElencoDocumenti', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ElencoDocumenti],
      providers: [
        ArchivioPubblicoStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  async function monta(risposta: Paginato<DocumentoPubblico> | 'errore' = PAGINA) {
    const fixture: ComponentFixture<ElencoDocumenti> = TestBed.createComponent(ElencoDocumenti);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));

    const elenco = http.expectOne((r) => r.url.startsWith('/api/documenti'));
    if (risposta === 'errore') {
      elenco.flush({ codice: 'X', messaggio: 'ko' }, { status: 500, statusText: 'KO' });
    } else {
      elenco.flush(risposta);
    }

    /* Compagnie e rami alimentano le tendine dei filtri: se restassero in
       sospeso la griglia si disegnerebbe comunque, ma il template leggerebbe
       segnali a metà. */
    http.match('/api/compagnie').forEach((r) => r.flush([]));
    http.match('/api/rami').forEach((r) => r.flush([]));

    fixture.detectChanges();
    await fixture.whenStable();

    /*
     * AG Grid crea le celle a componente Angular fuori dal ciclo che ha
     * disegnato la griglia: servono un altro giro di macrotask e una
     * rilevazione in più perché compaiano. Senza, le colonne con
     * `valueGetter` si vedono e quelle con `cellRenderer` restano vuote — e
     * si scambia un problema di tempi per un modulo mancante.
     */
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('monta la griglia AG Grid quando ci sono risultati', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.querySelector('ag-grid-angular')).toBeTruthy();
  });

  it('disegna una riga per documento con titolo e compagnia', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    /*
     * Verifica sostanziale: se mancasse un modulo AG Grid la griglia si
     * monterebbe lo stesso ma resterebbe vuota. Cerchiamo il contenuto vero
     * delle celle, non il tag del componente.
     */
    const righe = dom.querySelectorAll('.ag-row');
    expect(righe.length).toBe(2);

    const testo = dom.textContent ?? '';
    expect(testo).toContain('DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica');
    expect(testo).toContain('Generali Italia');
  });

  it('distingue le edizioni correnti da quelle superate', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const testo = dom.textContent ?? '';

    /* RF-A-04: sapere quale edizione si sta guardando è metà del lavoro. */
    expect(testo).toContain('corrente');
    expect(testo).toContain('superata');
  });

  it('mostra il conteggio dei risultati nella testata', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.querySelector('.testata__conteggio')?.textContent).toContain('2 documenti');
  });

  it('mostra il percorso di navigazione', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    const briciole = dom.querySelector('p-breadcrumb');
    expect(briciole).toBeTruthy();
    expect(briciole?.textContent).toContain('Archivi');
    expect(briciole?.textContent).toContain('Pubblico');
  });

  it('non mostra più il badge di sola lettura', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.textContent).not.toContain('sola lettura');
  });

  it('non disegna la griglia quando non ci sono risultati', async () => {
    const dom = (await monta({ elementi: [], totale: 0, pagina: 1, perPagina: 20 })).nativeElement;

    expect(dom.querySelector('ag-grid-angular')).toBeFalsy();
    expect(dom.querySelector('ui-stato-vuoto')).toBeTruthy();
  });

  it('mostra lo stato di errore al posto della griglia', async () => {
    const dom = (await monta('errore')).nativeElement as HTMLElement;

    expect(dom.querySelector('ag-grid-angular')).toBeFalsy();
    expect(dom.textContent).toContain("Non siamo riusciti a caricare l'archivio");
  });
});
