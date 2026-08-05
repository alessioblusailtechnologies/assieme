import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { DettaglioPrivato } from './dettaglio-privato';
import { DocumentoPrivato, StatoElaborazione } from '@core/models';

function documento(stato: StatoElaborazione, extra: Partial<DocumentoPrivato> = {}) {
  return {
    id: 'prv-1',
    archivio: 'privato',
    titolo: 'Preventivo Rossi Mario',
    tipologia: 'preventivo',
    fileUrl: '/api/documenti-privati/prv-1/file',
    stato,
    dimensioneByte: 1_887_436,
    numeroPagine: 12,
    caricatoDa: 'utn-001',
    caricatoIl: '2026-08-04T10:00:00+02:00',
    etichette: [],
    documentoDiRiferimento: false,
    visibilita: 'tenant',
    ...extra,
  } as DocumentoPrivato;
}

describe('DettaglioPrivato', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DettaglioPrivato],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  async function monta(doc: DocumentoPrivato) {
    const fixture: ComponentFixture<DettaglioPrivato> = TestBed.createComponent(DettaglioPrivato);
    fixture.componentRef.setInput('id', doc.id);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));

    http.expectOne('/api/documenti-privati/prv-1').flush(doc);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra il documento accanto ai metadati', async () => {
    const dom = await monta(documento('pronto'));

    /* Il documento è il motivo per cui si apre la scheda: senza, restano
       solo dei campi da compilare alla cieca. Da questa fase l'anteprima è
       il visualizzatore vero (RF-C-05), non più un segnaposto. */
    expect(dom.querySelector('ui-visualizzatore-pdf')).toBeTruthy();
  });

  it('al posto dell anteprima dice che il documento non è leggibile', async () => {
    const dom = await monta(
      documento('errore', {
        erroreElaborazione: 'Il documento è una scansione senza testo riconoscibile.',
      }),
    );

    /* Uno spazio vuoto identico a quello del documento pronto lascerebbe
       credere a un guasto dell'interfaccia invece che a un problema del
       file: il posto dell'anteprima è il posto dove dirlo. */
    const anteprima = dom.querySelector('.visualizzatore');
    expect(anteprima?.classList.contains('is-nonleggibile')).toBe(true);
    expect(anteprima?.textContent).toContain('non leggibile');
    expect(anteprima?.textContent).toContain('scansione senza testo');
  });

  it('durante l elaborazione dice che il documento sta arrivando', async () => {
    const dom = await monta(documento('in-elaborazione'));
    const anteprima = dom.querySelector('.visualizzatore');

    expect(anteprima?.classList.contains('is-attesa')).toBe(true);
    expect(anteprima?.textContent).toContain('Elaborazione in corso');
  });

  it('non promuove a riferimento un documento non elaborato', async () => {
    const dom = await monta(documento('errore', { erroreElaborazione: 'Non leggibile.' }));
    const pulsanti = Array.from(dom.querySelectorAll('button'));
    const riferimento = pulsanti.find((b) => b.textContent?.includes('Usa come riferimento'));

    /* Il server risponde comunque 409, ma un pulsante attivo che porta a un
       rifiuto è una promessa non mantenuta. */
    expect(riferimento?.disabled).toBe(true);
  });
});
