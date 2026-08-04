import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { DocumentoPubblico, Paginato, TipologiaDocumento } from '@core/models';
import { ElencoDocumenti } from './elenco-documenti';

const COMPAGNIA = { id: 'cmp-generali', nome: 'Generali Italia' };
const RAMO = { id: 'ram-auto', nome: 'RC Auto e veicoli', codice: 'rc-auto' };

function documento(
  id: string,
  tipologia: TipologiaDocumento,
  corrente = true,
): DocumentoPubblico {
  return {
    id,
    archivio: 'pubblico',
    titolo: `Documento ${id}`,
    tipologia,
    fileUrl: `/api/documenti/${id}/file`,
    numeroPagine: 18,
    compagnia: COMPAGNIA,
    ramo: RAMO,
    prodotto: 'Active Veicoli AUTOPIÙ con Telematica',
    edizione: corrente
      ? { id: 'edz-2', etichetta: 'ed. 04/2026', validaDal: '2026-04-01', corrente: true }
      : {
          id: 'edz-1',
          etichetta: 'ed. 09/2025',
          validaDal: '2025-09-01',
          validaAl: '2026-03-31',
          corrente: false,
        },
    preferito: false,
  };
}

const PAGINA: Paginato<DocumentoPubblico> = {
  elementi: [
    documento('doc-1', 'dip-aggiuntivo'),
    documento('doc-2', 'condizioni-assicurazione', false),
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

    http.match('/api/compagnie').forEach((r) => r.flush([]));
    http.match('/api/rami').forEach((r) => r.flush([]));

    /*
     * AG Grid crea le celle a componente Angular fuori dal ciclo che ha
     * disegnato la griglia: servono un altro giro di macrotask e una
     * rilevazione in più perché compaiano. Senza, le colonne con
     * `valueGetter` si vedono e quelle con `cellRenderer` restano vuote — e
     * si scambia un problema di tempi per un modulo mancante.
     */
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('disegna una riga per documento', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.querySelectorAll('.ag-row').length).toBe(2);
  });

  it('mostra prodotto, compagnia e ramo nelle prime colonne', async () => {
    const testo = ((await monta()).nativeElement as HTMLElement).textContent ?? '';

    expect(testo).toContain('Active Veicoli AUTOPIÙ con Telematica');
    expect(testo).toContain('Generali Italia');
    expect(testo).toContain('RC Auto e veicoli');
  });

  it('distingue le righe dello stesso prodotto con la tipologia', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    /* È la tipologia a dire quale documento è la riga: senza, due righe
       dello stesso prodotto sarebbero indistinguibili. In forma breve,
       perché per esteso manderebbe a capo la colonna. */
    const tag = Array.from(dom.querySelectorAll('p-tag')).map((t) => t.textContent?.trim());
    expect(tag).toContain('DIP Agg.');
    expect(tag).toContain('CdA');
  });

  it('mostra edizione e stato', async () => {
    const testo = ((await monta()).nativeElement as HTMLElement).textContent ?? '';

    expect(testo).toContain('ed. 04/2026');
    expect(testo).toContain('corrente');
    expect(testo).toContain('superata');
  });

  it('non mostra più la colonna della data di decorrenza', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const intestazioni = Array.from(dom.querySelectorAll('.ag-header-cell-text')).map((h) =>
      h.textContent?.trim(),
    );

    expect(intestazioni).toContain('Prodotto');
    expect(intestazioni).toContain('Tipologia');
    expect(intestazioni).not.toContain('In vigore dal');
    /* L'ordine conta: la tipologia si legge insieme al prodotto. */
    expect(intestazioni.indexOf('Tipologia')).toBe(intestazioni.indexOf('Prodotto') + 1);
  });

  it('offre su ogni riga il collegamento per aprire il documento', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const azioni = dom.querySelectorAll('app-cella-azione a');

    expect(azioni.length).toBe(2);
    /* Un collegamento e non un pulsante: in un archivio si confrontano
       documenti tenendone aperti due o tre, e serve il clic centrale. */
    expect(azioni[0].getAttribute('href')).toContain('/archivio/pubblico/doc-1');
    expect(azioni[0].getAttribute('aria-label')).toContain('Documento doc-1');
  });

  it('mostra il conteggio dei documenti nella testata', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.querySelector('.testata__conteggio')?.textContent).toContain('2 documenti');
  });

  it('mostra il percorso di navigazione', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    const briciole = dom.querySelector('p-breadcrumb');
    expect(briciole).toBeTruthy();
    expect(briciole?.textContent).toContain('Home');
    /* Stessa etichetta della voce nella barra laterale: chiamare in due modi
       la stessa schermata è il tipo di incoerenza che tutti notano. */
    expect(briciole?.textContent).toContain('Archivio pubblico');
  });

  it('conserva un h1 anche senza titolo a schermo', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const h1 = dom.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe('Archivio pubblico');
    expect(h1?.classList.contains('visually-hidden')).toBe(true);
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
