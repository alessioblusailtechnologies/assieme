import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { Editor } from '@tiptap/core';

import { Fascia, Intestazione } from '@core/models';
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

const VUOTA: Intestazione = {
  intestazione: { type: 'doc', content: [] },
  piede: { type: 'doc', content: [] },
};

/** I nodi e i segni ammessi dal contratto: tutto il resto è un 400. */
const NODI = new Set(['paragraph', 'text', 'hardBreak', 'campo', 'immagine', 'colonne', 'colonna']);
const SEGNI = new Set(['bold', 'italic', 'underline', 'textStyle']);

function fuoriSchema(fascia: Fascia): string[] {
  const trovati: string[] = [];
  const visita = (n: { type: string; content?: unknown[]; marks?: { type: string }[] }): void => {
    if (!NODI.has(n.type)) trovati.push(n.type);
    for (const m of n.marks ?? []) if (!SEGNI.has(m.type)) trovati.push(m.type);
    for (const figlio of (n.content ?? []) as (typeof n)[]) visita(figlio);
  };
  for (const b of fascia.content) visita(b as Parameters<typeof visita>[0]);
  return trovati;
}

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

  const editore = (nome: 'intestazione' | 'piede'): Editor =>
    (fixture.componentInstance as unknown as { editori: Record<string, Editor> }).editori[nome]!;

  const ultima = (): Intestazione => emesse[emesse.length - 1]!;

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

  it('la barra mette il grassetto sul testo selezionato', async () => {
    const dom = await monta();
    editore('intestazione').commands.insertContent('Agenzia Rossi');
    editore('intestazione').commands.selectAll();
    clic(dom, 'Grassetto');

    expect(ultima().intestazione.content).toEqual([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Agenzia Rossi', marks: [{ type: 'bold' }] }],
      },
    ]);
    expect(dom.querySelector('[aria-label="Grassetto"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('i campi si inseriscono dal menù, nella fascia dove sta il cursore', async () => {
    const dom = await monta();
    /* L'etichetta nel margine porta il cursore nella fascia (jsdom non fa girare gli eventi di fuoco). */
    clic(dom, 'Piè di pagina');
    editore('piede').commands.insertContent('Pagina ');
    fixture.detectChanges();
    clic(dom, 'Campo');
    clic(dom, 'N. pagina');

    expect(ultima().piede.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Pagina ' },
          { type: 'campo', attrs: { nome: 'pagina' } },
        ],
      },
    ]);
    expect(ultima().intestazione.content).toEqual([]);
    expect(dom.querySelector('.fascia.is-attiva')?.getAttribute('aria-label')).toBe(
      'Piè di pagina',
    );
  });

  it('allineamento, dimensione e colonne escono nella forma del contratto', async () => {
    const dom = await monta();
    const editor = editore('intestazione');
    editor.commands.focus();
    editor.commands.insertContent('Via Roma 1');
    editor.commands.selectAll();
    clic(dom, 'Allinea a destra');
    editor.commands.impostaDimensione('piccolo');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    clic(dom, 'Due colonne');

    const [paragrafo, colonne] = ultima().intestazione.content;
    expect(paragrafo).toEqual({
      type: 'paragraph',
      attrs: { textAlign: 'right' },
      content: [
        {
          type: 'text',
          text: 'Via Roma 1',
          marks: [{ type: 'textStyle', attrs: { fontSize: 'piccolo' } }],
        },
      ],
    });
    expect(colonne).toEqual({
      type: 'colonne',
      content: [
        { type: 'colonna', content: [{ type: 'paragraph' }] },
        { type: 'colonna', content: [{ type: 'paragraph' }] },
      ],
    });
    /* Col cursore nelle colonne, il pulsante diventa «Togli colonne». */
    expect(dom.textContent).toContain('Togli colonne');
  });

  it('quello che si incolla e non sta nello schema si perde all’ingresso', async () => {
    await monta();
    editore('intestazione').commands.insertContent(
      '<h1>Titolo</h1><ul><li>uno</li></ul><table><tr><td>cella</td></tr></table>' +
        '<p><a href="https://esempio.it">sito</a> <span style="color: rgb(200, 0, 0); font-family: Comic Sans MS">rosso</span></p>',
    );

    const fascia = ultima().intestazione;
    expect(fuoriSchema(fascia)).toEqual([]);
    expect(JSON.stringify(fascia)).toContain('#c80000');
    expect(JSON.stringify(fascia)).not.toContain('Comic');
  });

  it('con un’immagine selezionata la barra ne dice la larghezza, e larghezza e allineamento vanno nel nodo', async () => {
    const dom = await monta({
      intestazione: {
        type: 'doc',
        content: [
          {
            type: 'immagine',
            attrs: { id: 'img-0123456789ab.png', larghezza: 30, allineamento: 'left' },
          },
        ],
      },
      piede: { type: 'doc', content: [] },
    });
    editore('intestazione').commands.setNodeSelection(0);
    fixture.detectChanges();

    const campo = dom.querySelector<HTMLInputElement>('.larghezza input')!;
    expect(campo.value).toBe('30');
    expect(dom.querySelector('[aria-label="Grassetto"]')).toBeNull();
    campo.value = '50';
    campo.dispatchEvent(new Event('input'));
    clic(dom, 'Allinea al centro');

    expect(ultima().intestazione.content[0]).toEqual({
      type: 'immagine',
      attrs: { id: 'img-0123456789ab.png', larghezza: 50, allineamento: 'center' },
    });
  });

  it('«Testo accanto» fa scorrere il testo a fianco del logo, alla distanza scelta; al centro torna sotto', async () => {
    const dom = await monta({
      intestazione: {
        type: 'doc',
        content: [
          {
            type: 'immagine',
            attrs: { id: 'img-0123456789ab.png', larghezza: 30, allineamento: 'left' },
          },
          { type: 'paragraph', content: [{ type: 'text', text: 'Agenzia Rossi' }] },
        ],
      },
      piede: { type: 'doc', content: [] },
    });
    editore('intestazione').commands.setNodeSelection(0);
    fixture.detectChanges();
    clic(dom, 'Testo accanto');

    expect(ultima().intestazione.content[0]).toEqual({
      type: 'immagine',
      attrs: {
        id: 'img-0123456789ab.png',
        larghezza: 30,
        allineamento: 'left',
        testo: 'accanto',
        distanza: 3,
      },
    });
    /* Nell'editor l'immagine galleggia: il paragrafo dopo le scorre accanto. */
    const figura = dom.querySelector<HTMLElement>('.immagine-fascia')!;
    expect(figura.classList).toContain('is-accanto');
    expect(figura.style.float).toBe('left');
    expect(dom.querySelector('[aria-pressed="true"]')?.textContent).toContain('Testo accanto');

    const distanza = [...dom.querySelectorAll<HTMLLabelElement>('.larghezza')]
      .find((l) => l.textContent?.includes('Distanza'))!
      .querySelector('input')!;
    distanza.value = '6';
    distanza.dispatchEvent(new Event('input'));
    expect(ultima().intestazione.content[0]).toMatchObject({
      attrs: { testo: 'accanto', distanza: 6 },
    });

    clic(dom, 'Allinea al centro');
    expect(ultima().intestazione.content[0]).toEqual({
      type: 'immagine',
      attrs: { id: 'img-0123456789ab.png', larghezza: 30, allineamento: 'center' },
    });
    expect(figura.style.float).toBe('');
  });

  it('un nuovo valore ricarica le fasce senza entrare nella cronologia', async () => {
    const dom = await monta();
    fixture.componentRef.setInput('valore', {
      intestazione: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Caricata' }] }],
      },
      piede: { type: 'doc', content: [] },
    });
    fixture.detectChanges();

    expect(editore('intestazione').getText()).toBe('Caricata');
    expect(dom.querySelector<HTMLButtonElement>('[aria-label="Annulla"]')?.disabled).toBe(true);
  });

  it('chi non amministra vede il foglio senza barra, e non può scriverci', async () => {
    const dom = await monta(VUOTA, false);
    expect(dom.querySelector('.barra')).toBeNull();
    expect(editore('intestazione').isEditable).toBe(false);
  });
});
