import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Accordion } from './accordion';

@Component({
  imports: [Accordion],
  template: `
    <ui-accordion etichetta="Fonti" riepilogo="19 passaggi in 3 documenti">
      <p class="dentro">contenuto</p>
    </ui-accordion>
  `,
})
class Ospite {}

describe('Accordion', () => {
  function monta() {
    const fixture = TestBed.createComponent(Ospite);
    fixture.detectChanges();
    const radice: HTMLElement = fixture.nativeElement;
    return {
      fixture,
      testata: () => radice.querySelector<HTMLButtonElement>('.testata')!,
      contenuto: () => radice.querySelector('.dentro'),
    };
  }

  it('nasce chiusa, con etichetta e riepilogo già parlanti', () => {
    const { testata, contenuto } = monta();
    expect(contenuto()).toBeNull();
    expect(testata().getAttribute('aria-expanded')).toBe('false');
    expect(testata().textContent).toContain('Fonti');
    expect(testata().textContent).toContain('19 passaggi in 3 documenti');
  });

  it('si apre e si richiude dalla testata, e lo dice ad aria-expanded', () => {
    const { fixture, testata, contenuto } = monta();
    testata().click();
    fixture.detectChanges();
    expect(contenuto()?.textContent).toBe('contenuto');
    expect(testata().getAttribute('aria-expanded')).toBe('true');
    testata().click();
    fixture.detectChanges();
    expect(contenuto()).toBeNull();
  });
});
