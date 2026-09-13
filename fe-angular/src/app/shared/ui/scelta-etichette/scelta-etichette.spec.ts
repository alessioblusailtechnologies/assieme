import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SceltaEtichette } from './scelta-etichette';

@Component({
  imports: [SceltaEtichette],
  template: `<ui-scelta-etichette [(scelte)]="scelte" [opzioni]="opzioni" />`,
})
class Ospite {
  readonly scelte = signal<string[]>(['in rinnovo']);
  readonly opzioni = ['in rinnovo', 'da richiamare', 'VIP'];
}

/**
 * La scelta delle etichette (13/09/2026): una tendina sul vocabolario, con
 * la creazione in fondo quando quella giusta non c'è.
 */
describe('SceltaEtichette', () => {
  async function monta() {
    await TestBed.configureTestingModule({ imports: [Ospite] }).compileComponents();
    const fixture = TestBed.createComponent(Ospite);
    fixture.detectChanges();
    const dom = fixture.nativeElement as HTMLElement;
    const campo = dom.querySelector('input') as HTMLInputElement;
    const scrivi = (testo: string) => {
      campo.value = testo;
      campo.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const voci = () =>
      [...dom.querySelectorAll('.tendina__voce')].map((v) => v.textContent?.replace(/\s+/g, ' ').trim());
    return { fixture, dom, campo, scrivi, voci };
  }

  it('propone le etichette che ci sono, tranne quelle già scelte', async () => {
    const { fixture, campo, voci } = await monta();
    campo.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(voci()).toEqual(['da richiamare', 'VIP']);
  });

  it('scrivendo filtra, e in fondo propone di creare quella che non c’è', async () => {
    const { scrivi, voci } = await monta();
    scrivi('ric');
    expect(voci()).toEqual(['da richiamare', 'Crea «ric»']);
  });

  it('non propone un doppione che differisce solo per le maiuscole', async () => {
    const { scrivi, voci } = await monta();
    scrivi('vip');
    expect(voci()).toEqual(['VIP']);
  });

  it('Invio sulla creazione aggiunge l’etichetta nuova e svuota il campo', async () => {
    const { fixture, campo, scrivi } = await monta();
    scrivi('Premium');
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(fixture.componentInstance.scelte()).toEqual(['in rinnovo', 'Premium']);
    expect(campo.value).toBe('');
  });

  it('la × toglie un’etichetta scelta', async () => {
    const { fixture, dom } = await monta();
    (dom.querySelector('.scelta__togli') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.scelte()).toEqual([]);
  });
});
