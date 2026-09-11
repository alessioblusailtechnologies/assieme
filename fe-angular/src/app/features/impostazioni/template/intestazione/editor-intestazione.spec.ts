import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Editor } from '@tiptap/core';

import { ElementoTesto, Intestazione } from '@core/models';
import { CasellaTesto } from './casella-testo';
import { EditorIntestazione } from './editor-intestazione';

/* jsdom non misura niente: ProseMirror chiede i rettangoli per scorrere fino al cursore. */
function rettangoliFinti(): void {
  const vuoto = (): DOMRect => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  });
  const lista = (): DOMRectList =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = vuoto;
  Range.prototype.getClientRects = lista;
  Element.prototype.getClientRects ??= lista;
  document.elementFromPoint ??= () => null;
}

const casella = (altro: Partial<ElementoTesto> = {}): ElementoTesto => ({
  tipo: 'testo',
  id: 'nome',
  x: 60,
  y: 8,
  larghezza: 80,
  altezza: 6,
  verticale: 'top',
  dimensione: 9,
  famiglia: 'sans',
  colore: '#262626',
  paragrafi: [{ type: 'paragraph', content: [{ type: 'text', text: 'Agenzia Rossi' }] }],
  ...altro,
});

const VUOTA: Intestazione = {
  intestazione: { altezza: 0, elementi: [] },
  piede: { altezza: 0, elementi: [] },
};

/** Il logo alto 30 mm e il nome accanto, più in alto: la situazione di chi vuole centrare il testo sul logo. */
const LOGO_E_NOME: Intestazione = {
  intestazione: {
    altezza: 40,
    elementi: [
      {
        tipo: 'immagine',
        id: 'logo',
        x: 20,
        y: 5,
        larghezza: 30,
        altezza: 30,
        immagine: 'img-0123456789ab.png',
      },
      casella(),
    ],
  },
  piede: { altezza: 0, elementi: [] },
};

describe('EditorIntestazione', () => {
  let fixture: ComponentFixture<EditorIntestazione>;
  let emesse: Intestazione[];

  beforeAll(rettangoliFinti);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorIntestazione],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  async function monta(valore: Intestazione = VUOTA, modificabile = true): Promise<HTMLElement> {
    fixture = TestBed.createComponent(EditorIntestazione);
    fixture.componentRef.setInput('valore', valore);
    fixture.componentRef.setInput('modificabile', modificabile);
    emesse = [];
    fixture.componentInstance.cambiato.subscribe((i) => emesse.push(i));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const ultima = (): Intestazione => emesse[emesse.length - 1]!;

  async function aggiorna(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function clic(dom: HTMLElement, etichetta: string): void {
    /* Le voci del menù hanno l'esempio accanto: conta l'etichetta, non tutto il testo. */
    const pulsante = [...dom.querySelectorAll('button')].find(
      (b) =>
        b.getAttribute('aria-label') === etichetta ||
        (b.querySelector('.voce__etichetta') ?? b).textContent?.trim() === etichetta,
    );
    if (!pulsante) throw new Error(`Nessun pulsante «${etichetta}»`);
    pulsante.click();
    fixture.detectChanges();
  }

  /** Un clic (o l'inizio di un trascinamento) su un elemento: jsdom non ha PointerEvent, e i gestori leggono solo le coordinate. */
  function premi(bersaglio: Element, opzioni: MouseEventInit = {}): void {
    bersaglio.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 0,
        clientY: 0,
        ...opzioni,
      }),
    );
    fixture.detectChanges();
  }

  function rilascia(): void {
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    fixture.detectChanges();
  }

  const elemento = (dom: HTMLElement, id: string): HTMLElement =>
    dom.querySelector<HTMLElement>(`[data-id="${id}"]`)!;

  function editorDi(id: string): Editor {
    const caselle = fixture.debugElement
      .queryAll(By.directive(CasellaTesto))
      .map((d) => d.componentInstance as CasellaTesto);
    return caselle.find((c) => c.idElemento() === id)!.editor!;
  }

  function tasto(dom: HTMLElement, key: string, altro: KeyboardEventInit = {}): void {
    dom
      .querySelector('.foglio')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...altro }),
      );
    fixture.detectChanges();
  }

  it('ogni elemento sta alle sue coordinate, in millimetri alla scala del foglio', async () => {
    const dom = await monta(LOGO_E_NOME);
    const nome = elemento(dom, 'nome');
    expect(nome.style.left).toBe('calc(60 * var(--mm))');
    expect(nome.style.top).toBe('calc(8 * var(--mm))');
    expect(nome.style.width).toBe('calc(80 * var(--mm))');
    expect(nome.style.fontSize).toBe('calc(9 * var(--pt))');
    expect(elemento(dom, 'logo').style.height).toBe('calc(30 * var(--mm))');
    expect(dom.querySelector('[data-fascia="intestazione"]')!.getAttribute('style')).toContain(
      'calc(40 * var(--mm))',
    );
  });

  it('logo e nome selezionati, «Centra in verticale»: il nome a metà del logo', async () => {
    const dom = await monta(LOGO_E_NOME);
    premi(elemento(dom, 'logo'));
    rilascia();
    premi(elemento(dom, 'nome'), { shiftKey: true });
    rilascia();
    expect(dom.querySelectorAll('.cornice-selezione')).toHaveLength(2);
    clic(dom, 'Centra in verticale');

    const [logo, nome] = ultima().intestazione.elementi;
    expect(logo).toMatchObject({ y: 5 });
    /* Il centro del logo è a 20 mm: la casella alta 6 mm comincia a 17. */
    expect(nome).toMatchObject({ y: 17 });
  });

  it('il testo a metà della casella: la si allunga quanto il logo e ci resta centrato', async () => {
    const dom = await monta(LOGO_E_NOME);
    premi(elemento(dom, 'nome'));
    rilascia();
    const altezza = [...dom.querySelectorAll<HTMLInputElement>('.misura input')].find((i) =>
      i.closest('label')?.textContent?.trim().startsWith('A'),
    )!;
    altezza.value = '30';
    altezza.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    clic(dom, 'Testo a metà');
    clic(dom, 'Allinea in alto');

    expect(ultima().intestazione.elementi[1]).toMatchObject({
      altezza: 30,
      verticale: 'middle',
      y: 0,
    });
    expect(elemento(dom, 'nome').style.justifyContent).toBe('center');
  });

  it('trascinare sposta, e con Alt senza agganciarsi: la fascia si allunga se l’elemento scende sotto', async () => {
    const dom = await monta(LOGO_E_NOME);
    /* In jsdom la fascia non ha misure: un pixel vale un millimetro. */
    premi(elemento(dom, 'nome'), { clientX: 0, clientY: 0 });
    document.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 12.3, clientY: 40, altKey: true }),
    );
    rilascia();

    expect(ultima().intestazione.elementi[1]).toMatchObject({ x: 72.3, y: 48 });
    expect(ultima().intestazione.altezza).toBe(54);
    /* Un gesto è una voce sola della cronologia. */
    clic(dom, 'Annulla');
    expect(ultima().intestazione.elementi[1]).toMatchObject({ x: 60, y: 8 });
    expect(ultima().intestazione.altezza).toBe(40);
  });

  it('dalla tastiera: frecce di mezzo millimetro (tutte in una voce), Canc toglie, Ctrl+Z rimette', async () => {
    const dom = await monta(LOGO_E_NOME);
    premi(elemento(dom, 'logo'));
    rilascia();
    tasto(dom, 'ArrowRight');
    tasto(dom, 'ArrowRight');
    tasto(dom, 'ArrowDown', { shiftKey: true });
    expect(ultima().intestazione.elementi[0]).toMatchObject({ x: 21, y: 10 });
    tasto(dom, 'z', { ctrlKey: true });
    expect(ultima().intestazione.elementi[0]).toMatchObject({ x: 20, y: 5 });

    tasto(dom, 'Delete');
    expect(ultima().intestazione.elementi.map((e) => e.id)).toEqual(['nome']);
    tasto(dom, 'z', { ctrlKey: true });
    expect(ultima().intestazione.elementi.map((e) => e.id)).toEqual(['logo', 'nome']);
  });

  it('con la casella selezionata la barra vale per tutto il suo testo: grassetto, corpo e colore diventano della casella', async () => {
    const valore: Intestazione = {
      ...LOGO_E_NOME,
      intestazione: {
        ...LOGO_E_NOME.intestazione,
        elementi: [
          casella({
            paragrafi: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Agenzia ' },
                  {
                    type: 'text',
                    text: 'Rossi',
                    marks: [{ type: 'textStyle', attrs: { fontSize: 14 } }],
                  },
                ],
              },
            ],
          }),
        ],
      },
    };
    const dom = await monta(valore);
    premi(elemento(dom, 'nome'));
    rilascia();
    /* Due corpi diversi: il campo resta vuoto. */
    const corpo = dom.querySelector<HTMLInputElement>('[aria-label="Corpo in punti"]')!;
    expect(corpo.value).toBe('');
    clic(dom, 'Grassetto');
    corpo.value = '11';
    corpo.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const [nome] = ultima().intestazione.elementi as ElementoTesto[];
    expect(nome!.dimensione).toBe(11);
    expect(nome!.paragrafi).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Agenzia ', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'Rossi', marks: [{ type: 'bold' }] },
        ],
      },
    ]);
    expect(dom.querySelector('[aria-label="Grassetto"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('mentre si scrive la barra vale per i pezzi selezionati', async () => {
    const dom = await monta(LOGO_E_NOME);
    const casellaCmp = fixture.debugElement.queryAll(By.directive(CasellaTesto))[0]!
      .componentInstance as CasellaTesto;
    const componente = fixture.componentInstance as unknown as { scriviIn(id: string): void };
    componente.scriviIn('nome');
    await aggiorna();
    expect(casellaCmp.editor!.isEditable).toBe(true);
    /* «Rossi»: dopo «Agenzia ». */
    editorDi('nome').commands.setTextSelection({ from: 9, to: 14 });
    fixture.detectChanges();
    clic(dom, 'Grassetto');

    const [, nome] = ultima().intestazione.elementi as ElementoTesto[];
    expect(nome!.paragrafi[0]!.content).toEqual([
      { type: 'text', text: 'Agenzia ' },
      { type: 'text', text: 'Rossi', marks: [{ type: 'bold' }] },
    ]);
    expect(dom.querySelector('.cornice-selezione.is-scrittura')).toBeTruthy();
  });

  it('«Testo» aggiunge una casella dove non copre niente e ci si scrive subito; se resta vuota, se ne va', async () => {
    const dom = await monta(LOGO_E_NOME);
    clic(dom, 'Testo');
    await aggiorna();
    const nuova = ultima().intestazione.elementi[2] as ElementoTesto;
    expect(nuova).toMatchObject({ tipo: 'testo', larghezza: 80, altezza: 5 });
    /* Né sul logo né sul nome. */
    const siToccano = (
      a: typeof nuova,
      b: { x: number; y: number; larghezza: number; altezza: number },
    ) =>
      a.x < b.x + b.larghezza &&
      b.x < a.x + a.larghezza &&
      a.y < b.y + b.altezza &&
      b.y < a.y + a.altezza;
    for (const altro of LOGO_E_NOME.intestazione.elementi)
      expect(siToccano(nuova, altro)).toBe(false);
    expect(ultima().intestazione.altezza).toBe(40);
    expect(editorDi(nuova.id).isEditable).toBe(true);

    editorDi(nuova.id).commands.insertContent('Via Roma 1');
    expect((ultima().intestazione.elementi[2] as ElementoTesto).paragrafi).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Via Roma 1' }] },
    ]);

    clic(dom, 'Testo');
    await aggiorna();
    expect(ultima().intestazione.elementi).toHaveLength(4);
    /* Un clic sul fondo della fascia: si smette di scrivere, e la casella vuota sparisce. */
    premi(dom.querySelector('[data-fascia="intestazione"]')!);
    rilascia();
    expect(ultima().intestazione.elementi).toHaveLength(3);
  });

  it('un campo senza casella in scrittura arriva in una casella sua, nella fascia attiva', async () => {
    const dom = await monta();
    premi(dom.querySelector('[data-fascia="piede"]')!);
    rilascia();
    clic(dom, 'Campo');
    clic(dom, 'N. pagina');

    expect(ultima().intestazione.elementi).toEqual([]);
    expect(ultima().piede.elementi).toHaveLength(1);
    expect((ultima().piede.elementi[0] as ElementoTesto).paragrafi).toEqual([
      { type: 'paragraph', content: [{ type: 'campo', attrs: { nome: 'pagina' } }] },
    ]);
    /* La prima cosa in una fascia vuota non la rimpicciolisce. */
    expect(ultima().piede.altezza).toBe(16);
  });

  it('linea e riquadro sono forme col loro colore; allinea e distribuisci lavorano su tutti i selezionati', async () => {
    const dom = await monta(LOGO_E_NOME);
    clic(dom, 'Linea');
    const linea = ultima().intestazione.elementi[2]!;
    expect(linea).toMatchObject({ tipo: 'forma', altezza: 0.3, y: 37 });
    clic(dom, 'Blu');
    expect(ultima().intestazione.elementi[2]).toMatchObject({ colore: '#2f4b7c' });

    tasto(dom, 'a', { ctrlKey: true });
    clic(dom, 'Allinea a sinistra');
    expect(ultima().intestazione.elementi.map((e) => e.x)).toEqual([19.8, 19.8, 19.8]);
    clic(dom, 'Distribuisci in verticale');
    const [a, b, c] = ultima().intestazione.elementi;
    /* Il logo in cima e la linea in fondo restano; il nome in mezzo, a spazi uguali. */
    expect(a!.y).toBe(5);
    expect(c!.y).toBe(37);
    expect(b!.y - (a!.y + 30)).toBeCloseTo(c!.y - (b!.y + 6), 0);
  });

  it('un’immagine tiene le proporzioni quando se ne scrive la larghezza', async () => {
    const dom = await monta(LOGO_E_NOME);
    premi(elemento(dom, 'logo'));
    rilascia();
    const larghezza = [...dom.querySelectorAll<HTMLInputElement>('.misura input')].find((i) =>
      i.closest('label')?.textContent?.trim().startsWith('L'),
    )!;
    larghezza.value = '20';
    larghezza.dispatchEvent(new Event('change'));
    expect(ultima().intestazione.elementi[0]).toMatchObject({ larghezza: 20, altezza: 20 });
    expect(dom.querySelectorAll('.maniglia')).toHaveLength(4);
  });

  it('l’altezza della fascia non scende sotto il suo elemento più basso', async () => {
    const dom = await monta(LOGO_E_NOME);
    const campo = [...dom.querySelectorAll<HTMLInputElement>('.misura input')].find((i) =>
      i.closest('label')?.textContent?.includes('Altezza intestazione'),
    )!;
    campo.value = '10';
    campo.dispatchEvent(new Event('change'));
    expect(ultima().intestazione.altezza).toBe(35);
    campo.value = '60';
    campo.dispatchEvent(new Event('change'));
    expect(ultima().intestazione.altezza).toBe(60);
  });

  it('un nuovo valore ricarica le fasce senza entrare nella cronologia', async () => {
    const dom = await monta();
    fixture.componentRef.setInput('valore', LOGO_E_NOME);
    await aggiorna();
    expect(editorDi('nome').getText()).toBe('Agenzia Rossi');
    expect(dom.querySelector<HTMLButtonElement>('[aria-label="Annulla"]')?.disabled).toBe(true);
  });

  it('chi non amministra vede il foglio senza barra, e non sposta né scrive', async () => {
    const dom = await monta(LOGO_E_NOME, false);
    expect(dom.querySelector('.barra')).toBeNull();
    premi(elemento(dom, 'nome'));
    rilascia();
    expect(dom.querySelector('.cornice-selezione')).toBeNull();
    expect(editorDi('nome').isEditable).toBe(false);
    expect(emesse).toEqual([]);
  });
});
