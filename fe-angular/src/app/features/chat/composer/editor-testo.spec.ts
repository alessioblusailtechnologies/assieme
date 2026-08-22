import {
  creaChipAllegato,
  creaChipDocumento,
  idChip,
  posizionaCursore,
  posizioneCursore,
  puntoDaPosizione,
  ripulisciSeVuoto,
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
});
