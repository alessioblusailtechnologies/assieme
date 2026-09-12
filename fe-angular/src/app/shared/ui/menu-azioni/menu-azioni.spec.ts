import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MenuAzioni, type VoceMenu } from './menu-azioni';

/**
 * Le voci raggruppate (12/09/2026) e il verso in cui si apre.
 *
 * Il raccoglitore sotto una risposta raccoglie tre famiglie in un elenco
 * solo invece di annidare un secondo menù; e il pulsante che lo apre può
 * stare in fondo allo schermo, dove sotto non c'è posto.
 */
@Component({
  imports: [MenuAzioni],
  template: `
    <button #innesco type="button" (click)="menu().apri($event)">apri</button>
    <ui-menu-azioni [voci]="voci()" />
  `,
})
class Ospite {
  readonly menu = viewChild.required(MenuAzioni);
  readonly innesco = viewChild.required<{ nativeElement: HTMLButtonElement }>('innesco');
  readonly voci = signal<VoceMenu[]>([]);
}

describe('MenuAzioni', () => {
  function monta(voci: VoceMenu[]) {
    const fixture = TestBed.createComponent(Ospite);
    fixture.componentInstance.voci.set(voci);
    fixture.detectChanges();
    const radice: HTMLElement = fixture.nativeElement;
    return {
      fixture,
      apri: (riquadro?: Partial<DOMRect>) => {
        const bottone = fixture.componentInstance.innesco().nativeElement;
        if (riquadro) {
          bottone.getBoundingClientRect = () =>
            ({ left: 20, top: 100, bottom: 120, ...riquadro }) as DOMRect;
        }
        bottone.click();
        fixture.detectChanges();
      },
      menu: () => radice.querySelector<HTMLElement>('[role="menu"]'),
      gruppi: () => [...radice.querySelectorAll('.gruppo')].map((e) => e.textContent?.trim()),
      voci: () => [...radice.querySelectorAll('.voce__etichetta')].map((e) => e.textContent?.trim()),
    };
  }

  const CON_GRUPPI: VoceMenu[] = [
    { gruppo: 'Invia email', etichetta: 'A me', azione: () => undefined },
    { gruppo: 'Invia email', etichetta: 'A un altro indirizzo…', azione: () => undefined },
    { gruppo: 'Esporta come', etichetta: 'Word', dettaglio: 'docx', azione: () => undefined },
    { gruppo: 'Esporta come', etichetta: 'PDF', dettaglio: 'pdf', azione: () => undefined },
  ];

  it('scrive l’intestazione una volta per famiglia, non una per voce', () => {
    const m = monta(CON_GRUPPI);
    m.apri();

    expect(m.gruppi()).toEqual(['Invia email', 'Esporta come']);
    /* Le voci restano tutte, e nell'ordine in cui sono state date. */
    expect(m.voci()).toEqual(['A me', 'A un altro indirizzo…', 'Word', 'PDF']);
  });

  it('senza gruppi resta l’elenco piatto di sempre', () => {
    const m = monta([
      { etichetta: 'Rinomina', azione: () => undefined },
      { etichetta: 'Elimina', azione: () => undefined },
    ]);
    m.apri();

    expect(m.gruppi()).toEqual([]);
    expect(m.voci()).toEqual(['Rinomina', 'Elimina']);
  });

  it('si apre sotto il pulsante se c’è posto, sopra se il pulsante sta in fondo', () => {
    const m = monta(CON_GRUPPI);

    /* Pulsante in cima: il menù scende, appena sotto il suo bordo. */
    m.apri({ top: 100, bottom: 120 });
    expect(m.menu()?.style.top).toBe('124px');

    /* Lo stesso pulsante in fondo allo schermo: sotto non ci sta, e sale
       sopra il bordo alto invece di uscire dalla finestra. */
    const fondo = window.innerHeight;
    m.apri({ top: fondo - 30, bottom: fondo - 10 });
    expect(Number.parseInt(m.menu()!.style.top, 10)).toBeLessThan(fondo - 30);
  });
});
