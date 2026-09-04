import {
  creaChipAllegato,
  creaChipDocumento,
  idChip,
  posizionaCursore,
  posizioneCursore,
  puntoDaPosizione,
  ripulisciSeVuoto,
  scriviDopoChip,
  sostituisciIntervallo,
  testoEditor,
} from './editor-testo';

/** Un editor con «Ciao », un chip, « come va» — il caso tipico. */
function editorDiProva(): { radice: HTMLDivElement; chip: HTMLElement } {
  const radice = document.createElement('div');
  document.body.append(radice);
  const chip = creaChipDocumento({ id: 'doc-1', titolo: 'DIP Danni', archivio: 'pubblico' }, () => undefined);
  radice.append(document.createTextNode('Ciao '), chip, document.createTextNode(' come va'));
  return { radice, chip };
}

/** La struttura dell'editor in una riga: `[doc-1]" "[doc-2]`. */
function mappa(radice: HTMLElement): string {
  return Array.from(radice.childNodes)
    .map((n) =>
      n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).classList.contains('riferimento')
        ? `[${(n as HTMLElement).getAttribute('data-id')}]`
        : JSON.stringify(n.textContent),
    )
    .join('');
}

describe('editor-testo', () => {
  afterEach(() => document.body.replaceChildren());

  it('il testo esclude i chip e conta i <br> come a capo', () => {
    const { radice } = editorDiProva();
    expect(testoEditor(radice)).toBe('Ciao  come va');
    radice.append(document.createElement('br'), document.createTextNode('fine'));
    expect(testoEditor(radice)).toBe('Ciao  come va\nfine');
  });

  it('gli id dei chip, nell’ordine del testo', () => {
    const { radice } = editorDiProva();
    radice.append(creaChipDocumento({ id: 'doc-2', titolo: 'CdA', archivio: 'privato' }, () => undefined));
    expect(idChip(radice)).toEqual(['doc-1', 'doc-2']);
  });

  it('il chip ha icona, titolo e la × che richiama chi lo toglie', () => {
    let tolto = false;
    const chip = creaChipDocumento({ id: 'x', titolo: 'Preventivo Rossi', archivio: 'privato' }, () => (tolto = true));
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(chip.querySelector('.riferimento__titolo')?.textContent).toBe('Preventivo Rossi');
    (chip.querySelector('button') as HTMLButtonElement).click();
    expect(tolto).toBe(true);
    const allegato = creaChipAllegato({ chiave: 1, nome: 'polizza.pdf', stato: 'caricamento' }, () => undefined);
    expect(allegato.textContent).toContain('caricamento…');
    expect(allegato.querySelector('button')).toBeNull();
  });

  it('la posizione del cursore salta i chip', () => {
    const { radice } = editorDiProva();
    const dopo = radice.lastChild as Text; // ' come va'
    const selezione = document.getSelection()!;
    const intervallo = document.createRange();
    intervallo.setStart(dopo, 5); // dopo 'Ciao ' (5) + ' come' (5)
    intervallo.collapse(true);
    selezione.removeAllRanges();
    selezione.addRange(intervallo);
    expect(posizioneCursore(radice, selezione)).toBe(10);
  });

  it('puntoDaPosizione trova il nodo di testo giusto, prima o dopo il chip', () => {
    const { radice } = editorDiProva();
    expect(puntoDaPosizione(radice, 2)).toEqual({ nodo: radice.firstChild, offset: 2 });
    expect(puntoDaPosizione(radice, 7)).toEqual({ nodo: radice.lastChild, offset: 2 });
    expect(puntoDaPosizione(radice, 99)).toEqual({ nodo: radice, offset: 3 });
  });

  it('sostituisciIntervallo: la «@dip» diventa il chip e il cursore resta dopo', () => {
    const radice = document.createElement('div');
    document.body.append(radice);
    radice.append(document.createTextNode('Leggi @dip per favore'));
    const chip = creaChipDocumento({ id: 'doc-1', titolo: 'DIP', archivio: 'pubblico' }, () => undefined);
    sostituisciIntervallo(radice, 6, 10, chip);
    expect(testoEditor(radice)).toBe('Leggi  per favore');
    expect(idChip(radice)).toEqual(['doc-1']);
    expect(posizioneCursore(radice, document.getSelection())).toBe(6);
  });

  it('posizionaCursore e ripulisciSeVuoto', () => {
    const { radice } = editorDiProva();
    posizionaCursore(radice, 13);
    expect(posizioneCursore(radice, document.getSelection())).toBe(13);
    expect(ripulisciSeVuoto(radice)).toBe(false);
    const vuoto = document.createElement('div');
    vuoto.append(document.createElement('br'));
    expect(ripulisciSeVuoto(vuoto)).toBe(true);
    expect(vuoto.childNodes.length).toBe(0);
  });

  it('scriviDopoChip fonde col testo che segue e lascia il cursore dopo lo spazio', () => {
    const radice = document.createElement('div');
    document.body.append(radice);
    const chip = creaChipDocumento({ id: 'doc-1', titolo: 'DIP', archivio: 'pubblico' }, () => undefined);
    radice.append(chip, document.createTextNode('poi'));

    scriviDopoChip(radice, chip, ' ');

    /* Un nodo di testo solo: `normalize()` ha fuso lo spazio con «poi». */
    expect(mappa(radice)).toBe('[doc-1]" poi"');
    const selezione = document.getSelection()!;
    expect(selezione.focusNode).toBe(chip.nextSibling);
    expect(selezione.focusOffset).toBe(1);
  });

  /*
   * Il difetto: i chip non contano caratteri, quindi in `[A]" "[B]` la
   * posizione di testo 1 è due punti diversi del DOM. Chiedere lo spazio
   * «alla posizione dopo B» lo faceva finire prima di B, e il cursore con
   * lui — in mezzo ai due riferimenti.
   */
  it('il secondo riferimento non lascia il cursore fra i due chip', () => {
    const radice = document.createElement('div');
    document.body.append(radice);

    // Primo: si digita «@», si sceglie, e dopo il chip resta uno spazio.
    radice.append(document.createTextNode('@'));
    const primo = creaChipDocumento({ id: 'doc-1', titolo: 'DIP', archivio: 'pubblico' }, () => undefined);
    sostituisciIntervallo(radice, 0, 1, primo);
    scriviDopoChip(radice, primo, ' ');
    expect(mappa(radice)).toBe('[doc-1]" "');
    expect(posizioneCursore(radice, document.getSelection())).toBe(1);

    // Secondo: la «@» si scrive in coda e diventa il chip lì dov'era.
    sostituisciIntervallo(radice, 1, 1, document.createTextNode('@'));
    const secondo = creaChipDocumento({ id: 'doc-2', titolo: 'CdA', archivio: 'privato' }, () => undefined);
    sostituisciIntervallo(radice, 1, 2, secondo);
    scriviDopoChip(radice, secondo, ' ');

    expect(mappa(radice)).toBe('[doc-1]" "[doc-2]" "');
    expect(idChip(radice)).toEqual(['doc-1', 'doc-2']);
    expect(testoEditor(radice)).toBe('  ');

    const selezione = document.getSelection()!;
    expect(selezione.focusNode).toBe(secondo.nextSibling);
    expect(selezione.focusOffset).toBe(1);
  });
});

describe('l’anteprima di un’immagine incollata', () => {
  const DATI = 'data:image/png;base64,iVBORw0KGgo=';

  it('prende il posto dell’icona nel chip del documento', () => {
    const chip = creaChipDocumento(
      { id: 'all-1', titolo: 'Immagine incollata 9.05', archivio: 'conversazione', anteprima: DATI },
      () => undefined,
    );
    const img = chip.querySelector('img.riferimento__anteprima');
    expect(img?.getAttribute('src')).toBe(DATI);
    /* In testa al chip c'è la miniatura, non l'icona dell'archivio: sarebbero
       due simboli per la stessa cosa. (L'unica altra svg è la × per togliere.) */
    expect(chip.firstElementChild).toBe(img);
    expect(chip.textContent).toContain('Immagine incollata 9.05');
  });

  it('resta anche mentre il server la sta leggendo, ma cede il posto all’errore', () => {
    const doc = { id: 'all-1', titolo: 'Immagine', archivio: 'conversazione' as const, anteprima: DATI };
    const inLavorazione = creaChipDocumento(doc, () => undefined, { stato: 'lavorazione' });
    expect(inLavorazione.querySelector('img')).not.toBeNull();

    const fallito = creaChipDocumento(doc, () => undefined, { stato: 'errore', messaggio: 'non letta' });
    expect(fallito.querySelector('img')).toBeNull();
    expect(fallito.querySelector('svg')).not.toBeNull();
  });

  it('c’è già sul chip transitorio, mentre l’immagine sale', () => {
    const chip = creaChipAllegato(
      { chiave: 1, nome: 'Immagine incollata 9.05.png', stato: 'caricamento', anteprima: DATI },
      () => undefined,
    );
    expect(chip.querySelector('img.riferimento__anteprima')).not.toBeNull();
    expect(chip.textContent).toContain('caricamento…');
  });
});
