import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { BarraSuperiore } from './barra-superiore';
import { Sessione } from '@core/models';

const SESSIONE: Sessione = {
  utente: {
    id: 'utn-001',
    nome: 'Marta',
    cognome: 'Ferrero',
    email: 'm.ferrero@assicurazionimeridiana.it',
    ruolo: 'amministratore',
    tenantId: 'tnt-001',
  },
  tenant: { id: 'tnt-001', nome: 'Assicurazioni Meridiana S.r.l.', piano: 'agenzia' },
  permessi: [],
};

describe('BarraSuperiore', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BarraSuperiore],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  async function monta() {
    const fixture = TestBed.createComponent(BarraSuperiore);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne('/api/sessione').flush(SESSIONE);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('mostra il tenant a sinistra', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    /* RF-B-01 fonda il prodotto sull'isolamento fra agenzie: di chi siano i
       documenti a schermo deve avere risposta senza un clic. */
    expect(dom.querySelector('.contesto')?.textContent).toContain('Assicurazioni Meridiana');
  });

  it('mostra utente come n.cognome e il ruolo accanto', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;

    expect(dom.querySelector('.identita__nome')?.textContent?.trim()).toBe('m.ferrero');
    expect(dom.querySelector('.identita__ruolo')?.textContent?.trim()).toBe('amministratore');
  });

  it('mostra data e ora in formato italiano', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const orologio = dom.querySelector('.orologio')?.textContent?.trim() ?? '';

    /* gg/mm/aaaa hh:mm — non il formato americano, che su una data di
       decorrenza si presta a fraintendimenti veri. */
    expect(orologio).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it('espone la data leggibile alla macchina', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const attributo = dom.querySelector('time')?.getAttribute('datetime') ?? '';

    expect(Number.isNaN(Date.parse(attributo))).toBe(false);
  });
});
