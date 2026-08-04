import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { DocumentoPubblico, Paginato, Prodotto } from '@core/models';
import { ElencoDocumenti } from './elenco-documenti';

const COMPAGNIA = { id: 'cmp-generali', nome: 'Generali Italia' };
const RAMO = { id: 'ram-auto', nome: 'RC Auto e veicoli', codice: 'rc-auto' };
const EDIZIONE = { id: 'edz-1', etichetta: 'ed. 04/2026', validaDal: '2026-04-01', corrente: true };

function documento(id: string, titolo: string): DocumentoPubblico {
  return {
    id,
    archivio: 'pubblico',
    titolo,
    tipologia: 'dip-aggiuntivo',
    fileUrl: `/api/documenti/${id}/file`,
    numeroPagine: 18,
    compagnia: COMPAGNIA,
    ramo: RAMO,
    prodotto: 'Active Veicoli AUTOPIÙ con Telematica',
    edizione: EDIZIONE,
    preferito: false,
  };
}

const PRODOTTO: Prodotto = {
  id: 'prd-generali-autopiu',
  nome: 'Active Veicoli AUTOPIÙ con Telematica',
  compagnia: COMPAGNIA,
  ramo: RAMO,
  edizioneCorrente: EDIZIONE,
  numeroEdizioni: 2,
  numeroDocumenti: 2,
  preferito: false,
  documenti: [
    documento('doc-1', 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica'),
    documento('doc-2', 'Condizioni di Assicurazione — Active Veicoli'),
  ],
};

const ALTRO: Prodotto = {
  ...PRODOTTO,
  id: 'prd-unipol-km',
  nome: 'KM Sicuri Auto',
  compagnia: { id: 'cmp-unipolsai', nome: 'UnipolSai Assicurazioni' },
  numeroDocumenti: 1,
  numeroEdizioni: 1,
  documenti: [documento('doc-3', 'DIP — KM Sicuri Auto')],
};

const PAGINA: Paginato<Prodotto> = {
  elementi: [PRODOTTO, ALTRO],
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

  async function monta(risposta: Paginato<Prodotto> | 'errore' = PAGINA) {
    const fixture: ComponentFixture<ElencoDocumenti> = TestBed.createComponent(ElencoDocumenti);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));

    const elenco = http.expectOne((r) => r.url.startsWith('/api/prodotti'));
    if (risposta === 'errore') {
      elenco.flush({ codice: 'X', messaggio: 'ko' }, { status: 500, statusText: 'KO' });
    } else {
      elenco.flush(risposta);
    }

    http.match('/api/compagnie').forEach((r) => r.flush([]));
    http.match('/api/rami').forEach((r) => r.flush([]));

    await stabilizza(fixture);
    return fixture;
  }

  /**
   * AG Grid crea le celle a componente Angular fuori dal ciclo che ha
   * disegnato la griglia: servono un altro giro di macrotask e una
   * rilevazione in più perché compaiano. Senza, le colonne con `valueGetter`
   * si vedono e quelle con `cellRenderer` restano vuote — e si scambia un
   * problema di tempi per un modulo mancante.
   */
  async function stabilizza(fixture: ComponentFixture<ElencoDocumenti>) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('elenca i prodotti, non i singoli documenti', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    /* Due prodotti, non i tre documenti che contengono: è tutto il senso
       del cambio di modello. */
    expect(dom.querySelectorAll('.ag-row').length).toBe(2);

    const testo = dom.textContent ?? '';
    expect(testo).toContain('Active Veicoli AUTOPIÙ con Telematica');
    expect(testo).toContain('Generali Italia');
    /* I titoli dei documenti compaiono solo aprendo la riga. */
    expect(testo).not.toContain('DIP Aggiuntivo — Active Veicoli');
  });

  it('mostra la consistenza del set informativo su ogni riga', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const testo = dom.textContent ?? '';

    /* Risponde in anticipo alla domanda «vale la pena aprire?». */
    expect(testo).toContain('2 documenti · 2 edizioni');
    /* L'edizione unica non si dice: è il caso normale. */
    expect(testo).toContain('1 documento');
    expect(testo).not.toContain('1 documento · 1 edizioni');
  });

  it('apre il prodotto e mostra i suoi documenti', async () => {
    const fixture = await monta();
    const store = TestBed.inject(ArchivioPubblicoStore);

    store.alternaEspansione(PRODOTTO.id);
    await stabilizza(fixture);

    const dom = fixture.nativeElement as HTMLElement;
    /* Una riga in più: il prodotto e la sua diramazione. */
    expect(dom.querySelectorAll('.ag-row').length).toBe(3);
    expect(dom.textContent).toContain('DIP Aggiuntivo — Active Veicoli');
    expect(dom.textContent).toContain('Set informativo');
  });

  it('richiude il prodotto', async () => {
    const fixture = await monta();
    const store = TestBed.inject(ArchivioPubblicoStore);

    store.alternaEspansione(PRODOTTO.id);
    await stabilizza(fixture);
    store.alternaEspansione(PRODOTTO.id);
    await stabilizza(fixture);

    const dom = fixture.nativeElement as HTMLElement;
    expect(dom.querySelectorAll('.ag-row').length).toBe(2);
    expect(dom.textContent).not.toContain('DIP Aggiuntivo — Active Veicoli');
  });

  it('mostra il conteggio dei prodotti nella testata', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.querySelector('.testata__conteggio')?.textContent).toContain('2 prodotti');
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
