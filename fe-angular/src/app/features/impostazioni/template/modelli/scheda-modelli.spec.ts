import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';

import { ModelloRiferimento } from '@core/models';
import { SessioneStore } from '@core/auth/sessione-store';
import { SchedaModelli } from './scheda-modelli';

const modello = (extra: Partial<ModelloRiferimento>): ModelloRiferimento => ({
  id: 'tpl-1',
  nome: 'Proposta breve',
  formato: 'docx',
  descrizione: '',
  intestazioneAgenzia: true,
  anteprima: 'pronta',
  caricatoIl: '2026-09-11T10:00:00+02:00',
  ...extra,
});

describe('SchedaModelli', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SchedaModelli>;
  const amministratore = signal(true);

  beforeEach(async () => {
    amministratore.set(true);
    await TestBed.configureTestingModule({
      imports: [SchedaModelli],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessioneStore, useValue: { puo: () => amministratore() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture?.destroy();
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush([]));
  });

  async function monta(modelli: ModelloRiferimento[]): Promise<HTMLElement> {
    fixture = TestBed.createComponent(SchedaModelli);
    fixture.detectChanges();
    /* Non `whenStable`: la richiesta dell'elenco è pendente finché non la si esaudisce. */
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne('/api/template').flush(modelli);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('ogni modello dice formato, anteprima e intestazione; l’anteprima in preparazione lo dice', async () => {
    const dom = await monta([
      modello({ id: 'tpl-1', nome: 'Proposta breve', formato: 'docx', anteprima: 'in-corso' }),
      modello({
        id: 'tpl-2',
        nome: 'Modulo compagnia',
        formato: 'pdf',
        intestazioneAgenzia: false,
      }),
      modello({ id: 'tpl-3', nome: 'Presentazione', formato: 'pptx', anteprima: 'errore' }),
    ]);
    const schede = [...dom.querySelectorAll('.modello')];
    expect(schede.map((s) => s.querySelector('.modello__formato')?.textContent?.trim())).toEqual([
      'Word',
      'PDF',
      'PowerPoint',
    ]);
    expect(schede[0]!.textContent).toContain('anteprima in preparazione');
    expect(schede[1]!.textContent).toContain('Anteprima');
    expect(schede[2]!.textContent).toContain('Scarica');
    expect(schede[1]!.querySelector('.segmento.is-scelto')?.textContent?.trim()).toBe('la sua');
  });

  it('l’intestazione si cambia con un clic, e «quando usarlo» si salva uscendo dal campo', async () => {
    const dom = await monta([modello({})]);

    const laSua = [...dom.querySelectorAll<HTMLButtonElement>('.segmento')].find(
      (b) => b.textContent?.trim() === 'la sua',
    )!;
    laSua.click();
    const intestazione = http.expectOne({ method: 'PATCH', url: '/api/template/tpl-1' });
    expect(intestazione.request.body).toEqual({ intestazioneAgenzia: false });
    intestazione.flush([modello({ intestazioneAgenzia: false })]);
    fixture.detectChanges();

    const campo = dom.querySelector<HTMLInputElement>('.modello__descrizione')!;
    campo.value = '  Per i preventivi RC Auto da una pagina ';
    campo.dispatchEvent(new Event('blur'));
    const descrizione = http.expectOne({ method: 'PATCH', url: '/api/template/tpl-1' });
    expect(descrizione.request.body).toEqual({
      descrizione: 'Per i preventivi RC Auto da una pagina',
    });
    descrizione.flush([modello({ descrizione: 'Per i preventivi RC Auto da una pagina' })]);

    /* Uscire di nuovo senza cambiare niente non manda niente. */
    fixture.detectChanges();
    dom.querySelector<HTMLInputElement>('.modello__descrizione')!.dispatchEvent(new Event('blur'));
    http.expectNone({ method: 'PATCH', url: '/api/template/tpl-1' });
  });

  it('chi non amministra legge soltanto: niente campi, niente caricamento', async () => {
    amministratore.set(false);
    const dom = await monta([modello({ descrizione: 'Per i preventivi' })]);
    expect(dom.querySelector('.modello__descrizione')).toBeNull();
    expect(dom.querySelector('.segmenti')).toBeNull();
    expect(dom.textContent).toContain('Per i preventivi');
    expect(dom.textContent).not.toContain('Carica modelli');
  });
});
