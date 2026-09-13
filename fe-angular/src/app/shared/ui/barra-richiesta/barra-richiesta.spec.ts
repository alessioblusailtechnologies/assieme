import { Component, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BarraRichiesta } from './barra-richiesta';
import type { RiferimentoBarra } from './riferimenti-in-linea';

const SET = 'cmp-unipol:Km&Servizi:ed-7';

@Component({
  imports: [BarraRichiesta],
  template: `<ui-barra-richiesta [(testo)]="testo" [(riferimenti)]="riferimenti" />`,
})
class Ospite {
  readonly testo = signal(`Confronta @[documento:d1] con @[prodotto:${SET}] e scrivi a @[cliente:c1] ogni lunedì`);
  readonly riferimenti = signal<RiferimentoBarra[]>([
    { tipo: 'documento', chiave: 'd1', titolo: 'Polizza Rossi', archivio: 'privato' },
    { tipo: 'prodotto', chiave: SET, titolo: 'Km&Servizi, ed. 07/2026', documenti: [] },
    { tipo: 'cliente', chiave: 'c1', titolo: 'Rossi Mario' },
  ]);
}

/**
 * La barra della richiesta (14/09/2026): una richiesta riaperta ritrova i
 * chip dov'erano, e togliere un chip toglie il suo riferimento.
 */
describe('BarraRichiesta', () => {
  async function monta() {
    await TestBed.configureTestingModule({
      imports: [Ospite],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(Ospite);
    fixture.detectChanges();
    const editor = (fixture.nativeElement as HTMLElement).querySelector('.campo__testo') as HTMLElement;
    return { fixture, editor };
  }

  it('ricostruisce i chip al loro posto fra le parole', async () => {
    const { editor } = await monta();

    const sequenza = Array.from(editor.childNodes).map((n) =>
      n.nodeType === Node.TEXT_NODE ? `testo:${n.textContent}` : `chip:${(n as HTMLElement).textContent?.trim()}`,
    );
    expect(sequenza).toEqual([
      'testo:Confronta ',
      'chip:Polizza Rossi',
      'testo: con ',
      'chip:Km&Servizi, ed. 07/2026',
      'testo: e scrivi a ',
      'chip:Rossi Mario',
      'testo: ogni lunedì',
    ]);
  });

  it('la × di un chip toglie il marcatore dal testo e il riferimento dalla lista', async () => {
    const { fixture, editor } = await monta();

    const chipProdotto = Array.from(editor.querySelectorAll<HTMLElement>('.riferimento')).find((c) =>
      c.textContent?.includes('Km&Servizi'),
    )!;
    (chipProdotto.querySelector('.riferimento__togli') as HTMLButtonElement).click();
    fixture.detectChanges();

    const ospite = fixture.componentInstance;
    expect(ospite.testo()).toBe('Confronta @[documento:d1] con  e scrivi a @[cliente:c1] ogni lunedì');
    expect(ospite.riferimenti().map((r) => r.chiave)).toEqual(['d1', 'c1']);
  });

  it('un riferimento che non si risolve resta un chip che lo dice, e il marcatore non si perde', async () => {
    const { fixture } = await monta();
    const ospite = fixture.componentInstance;
    ospite.riferimenti.set([]);
    ospite.testo.set('Leggi @[documento:sparito] e basta');
    fixture.detectChanges();

    const editor = (fixture.nativeElement as HTMLElement).querySelector('.campo__testo') as HTMLElement;
    expect(editor.querySelector('.riferimento')?.textContent).toContain('Riferimento non più disponibile');
    expect(ospite.testo()).toBe('Leggi @[documento:sparito] e basta');
  });
});
