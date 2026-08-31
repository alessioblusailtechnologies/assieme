import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { Paginato, SetInformativo } from '@core/models';
import { ElencoDocumenti } from './elenco-documenti';

const COMPAGNIA = { id: 'cmp-generali', nome: 'Generali Italia' };
const RAMO = { id: 'ram-auto', nome: 'RC Auto e veicoli', codice: 'rc-auto' };

function setInformativo(chiave: string, corrente = true, preferito = false): SetInformativo {
  return {
    chiave,
    prodotto: 'Active Veicoli AUTOPIÙ con Telematica',
    compagnia: COMPAGNIA,
    ramo: RAMO,
    edizione: corrente
      ? { id: 'edz-2', etichetta: 'ed. 04/2026', validaDal: '2026-04-01', corrente: true }
      : {
          id: 'edz-1',
          etichetta: 'ed. 09/2025',
          validaDal: '2025-09-01',
          validaAl: '2026-03-31',
          corrente: false,
        },
    documenti: [
      { id: `${chiave}-dip`, titolo: 'DIP', tipologia: 'dip', numeroPagine: 4, preferito },
      {
        id: `${chiave}-cond`,
        titolo: 'Condizioni',
        tipologia: 'condizioni-assicurazione',
        numeroPagine: 96,
        preferito: false,
      },
    ],
    preferito,
  };
}

const PAGINA: Paginato<SetInformativo> = {
  elementi: [setInformativo('set-1'), setInformativo('set-2', false)],
  totale: 2,
  pagina: 1,
  perPagina: 12,
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

  async function monta(risposta: Paginato<SetInformativo> | 'errore' = PAGINA) {
    const fixture: ComponentFixture<ElencoDocumenti> = TestBed.createComponent(ElencoDocumenti);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));

    const elenco = http.expectOne((r) => r.url.startsWith('/api/set-informativi'));
    if (risposta === 'errore') {
      elenco.flush({ codice: 'X', messaggio: 'ko' }, { status: 500, statusText: 'KO' });
    } else {
      elenco.flush(risposta);
    }

    http.match('/api/compagnie').forEach((r) => r.flush([]));
    http.match('/api/rami').forEach((r) => r.flush([]));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('disegna una riga per set, chiusa: i documenti non si vedono ancora', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    expect(dom.querySelectorAll('tbody tr.set').length).toBe(2);
    expect(dom.querySelectorAll('tbody tr.documento').length).toBe(0);

    const testo = dom.textContent ?? '';
    expect(testo).toContain('Active Veicoli AUTOPIÙ con Telematica');
    expect(testo).toContain('Generali Italia');
    expect(testo).toContain('RC Auto e veicoli');
    expect(testo).toContain('2 documenti');
  });

  it('il clic sulla riga espande i documenti del set, con tipologia, pagine e azione per aprire', async () => {
    const fixture = await monta();
    const dom = fixture.nativeElement as HTMLElement;

    dom.querySelector<HTMLTableRowElement>('tr.set')!.click();
    fixture.detectChanges();

    const sottoRighe = Array.from(dom.querySelectorAll('tbody tr.documento'));
    expect(sottoRighe.length).toBe(2);
    expect(sottoRighe[0].textContent).toContain('DIP');
    expect(sottoRighe[0].textContent).toContain('4 pagg.');
    expect(sottoRighe[1].textContent).toContain('Condizioni di Assicurazione');

    /* Un collegamento e non un pulsante: in un archivio si confrontano
       documenti tenendone aperti due o tre, e serve il clic centrale. */
    const apri = sottoRighe[0].querySelector('app-cella-apri a');
    expect(apri?.getAttribute('href')).toContain('/archivio/pubblico/set-1-dip');

    const triangolo = dom.querySelector('tr.set .espandi');
    expect(triangolo?.getAttribute('aria-expanded')).toBe('true');

    /* Un secondo clic richiude. */
    dom.querySelector<HTMLTableRowElement>('tr.set')!.click();
    fixture.detectChanges();
    expect(dom.querySelectorAll('tbody tr.documento').length).toBe(0);
  });

  it('la stella marca il set intero senza espandere la riga: un PUT per ogni documento', async () => {
    const fixture = await monta();
    const dom = fixture.nativeElement as HTMLElement;

    dom.querySelector<HTMLButtonElement>('.stella')!.click();
    fixture.detectChanges();

    /* Il clic sulla stella non è un clic di riga. */
    expect(dom.querySelectorAll('tbody tr.documento').length).toBe(0);

    const richieste = http.match((r) => r.url.includes('/preferito'));
    expect(richieste.map((r) => `${r.request.method} ${r.request.url}`)).toEqual([
      'PUT /api/documenti/set-1-dip/preferito',
      'PUT /api/documenti/set-1-cond/preferito',
    ]);
    richieste.forEach((r) => r.flush({}));
  });

  it('non etichetta le edizioni correnti e marca solo le superate', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const testo = dom.textContent ?? '';

    expect(testo).toContain('ed. 04/2026');
    expect(testo).toContain('ed. 09/2025');

    /* Con il filtro sulle sole correnti acceso di default, scrivere
       "corrente" su ogni riga ripete un'informazione che non distingue
       nulla. Si marca l'eccezione. */
    expect(testo).not.toContain('corrente');
    expect(testo).toContain('fino al 31/03/2026');
    expect(dom.querySelectorAll('.is-superata').length).toBe(1);
  });

  it('mostra il conteggio dei set nella testata', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    expect(dom.querySelector('.testata__conteggio')?.textContent).toContain('2 set informativi');
  });

  it('mostra il percorso di navigazione', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    const briciole = dom.querySelector('ui-briciole');
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

  it('non disegna la tabella quando non ci sono risultati', async () => {
    const dom = (await monta({ elementi: [], totale: 0, pagina: 1, perPagina: 12 })).nativeElement;

    expect(dom.querySelector('.ui-tabella')).toBeFalsy();
    expect(dom.querySelector('ui-stato-vuoto')).toBeTruthy();
  });

  it('mostra lo stato di errore al posto della tabella', async () => {
    const dom = (await monta('errore')).nativeElement as HTMLElement;

    expect(dom.querySelector('.ui-tabella')).toBeFalsy();
    expect(dom.textContent).toContain("Non siamo riusciti a caricare l'archivio");
  });
});
