import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { BarraSuperiore } from './barra-superiore';
import { RICOMINCIA } from '@core/auth/ricomincia';
import { TokenStore } from '@core/auth/token-store';
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
  let ricomincia: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    ricomincia = vi.fn();
    await TestBed.configureTestingModule({
      imports: [BarraSuperiore],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RICOMINCIA, useValue: ricomincia },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
    localStorage.removeItem('velia.token');
  });

  async function monta(sessione: Sessione = SESSIONE) {
    const fixture = TestBed.createComponent(BarraSuperiore);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne('/api/sessione').flush(sessione);
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

  it('chiude i cognomi composti senza spazi', async () => {
    /* La forma breve imita l'indirizzo di posta, e un indirizzo non ha
       spazi: `De Vincentis` deve dare `a.devincentis`, non `a.de vincentis`. */
    const dom = (
      await monta({
        ...SESSIONE,
        utente: { ...SESSIONE.utente, nome: 'Alessio', cognome: 'De Vincentis' },
      })
    ).nativeElement as HTMLElement;

    expect(dom.querySelector('.identita__nome')?.textContent?.trim()).toBe('a.devincentis');
  });

  it('mostra l icona utente con il nome per esteso raggiungibile', async () => {
    const dom = (await monta()).nativeElement as HTMLElement;
    const avatar = dom.querySelector('.avatar');

    expect(avatar?.querySelector('ui-icon')).toBeTruthy();
    /* Un'icona non dice nulla a chi non vede: il nome per esteso deve
       restare raggiungibile. */
    expect(avatar?.getAttribute('aria-label')).toContain('Marta Ferrero');
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

  it('esci toglie il token e riparte da una pagina nuova sulla porta', async () => {
    /* 14/09/2026: con la sola navigazione gli store tenevano i dati di chi
       era uscito, e il successivo utente, anche di un altro tenant, li vedeva. */
    const token = TestBed.inject(TokenStore);
    token.imposta('accesso', 'aggiornamento');
    const fixture = await monta();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.esci')?.click();

    expect(token.tokenAccesso()).toBeUndefined();
    expect(ricomincia).toHaveBeenCalledWith('/accesso');
  });
});
