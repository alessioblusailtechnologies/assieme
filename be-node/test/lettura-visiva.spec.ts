import { describe, expect, it } from 'vitest';

import { blocchiDi, spacchettaAncore } from '../src/worker/ingestion/lettura-visiva.js';
import { giudica, type PaginaDaGiudicare } from '../src/worker/ingestion/testimoni.js';

/**
 * La lettura visiva senza chiamate: la spezzatura in blocchi, lo
 * spacchettamento delle ancore e — soprattutto — il giudizio dei due
 * testimoni, che è la parte che decide quali pagine tornano davanti al
 * modello. Sono le stesse soglie di `tools/testimone-ocr.mjs`.
 */

const pdfjsDi = (testo: string) => ({
  testo,
  righe: testo.split('\n'),
  caratteri: testo.length,
});
const ocrDi = (corpo: string) => ({ corpo, header: '', footer: '' });

/** Una pagina con le tre letture allineate, da variare caso per caso. */
function pagina(n: number, parti: Partial<PaginaDaGiudicare>): PaginaDaGiudicare {
  return {
    pagina: n,
    trascrizione: '',
    pdfjs: pdfjsDi(''),
    ocr: ocrDi(''),
    ...parti,
  };
}

describe('la spezzatura in blocchi', () => {
  it('dieci pagine per blocco, l’ultimo corto', () => {
    expect(blocchiDi(23, 10)).toEqual([
      [1, 10],
      [11, 20],
      [21, 23],
    ]);
    expect(blocchiDi(4, 10)).toEqual([[1, 4]]);
  });
});

describe('lo spacchettamento delle ancore', () => {
  it('una pagina per ancora, il testo in mezzo, le pagine vuote come stringa vuota', () => {
    const markdown = ['[pag. 5]', '', '## Art. 1', 'Testo della cinque.', '', '[pag. 6]', '', '[pag. 7]', '', 'Testo della sette.'].join('\n');
    const pagine = spacchettaAncore(markdown, 5, 7);
    expect(pagine.get(5)).toBe('## Art. 1\nTesto della cinque.');
    expect(pagine.get(6)).toBe('');
    expect(pagine.get(7)).toBe('Testo della sette.');
  });

  it('un’ancora fuori dal blocco si ignora: quella pagina si rilancia', () => {
    const pagine = spacchettaAncore('[pag. 3]\n\nTesto.\n\n[pag. 99]\n\nAltrove.', 3, 4);
    expect([...pagine.keys()]).toEqual([3]);
  });
});

describe('il giudizio dei testimoni', () => {
  it('una trascrizione fedele è ok', () => {
    const [g] = giudica([
      pagina(1, {
        trascrizione: 'La franchigia è di € 500 e il massimale di € 6.450.000.',
        pdfjs: pdfjsDi('La franchigia è di € 500 e il massimale di € 6.450.000.'),
        ocr: ocrDi('La franchigia è di € 500 e il massimale di € 6.450.000.'),
      }),
    ]);
    expect(g!.esito).toBe('ok');
  });

  it('un numero che i due testimoni vedono e la trascrizione no è CERTO', () => {
    const [g] = giudica([
      pagina(1, {
        trascrizione: 'La franchigia è di € 500.',
        pdfjs: pdfjsDi('La franchigia è di € 500 e il massimale di € 6.450.000.'),
        ocr: ocrDi('La franchigia è di € 500 e il massimale di € 6.450.000.'),
      }),
    ]);
    expect(g!.esito).toBe('certo');
    /* Il punto delle migliaia è un separatore anche per il tokenizzatore:
       l'importo si presenta a pezzi, ma il buco si vede lo stesso. */
    expect(g!.note.join(' ')).toContain('450');
  });

  it('un numero visto da un solo testimone si guarda, non si condanna', () => {
    const [g] = giudica([
      pagina(1, {
        trascrizione: 'La franchigia è di € 500.',
        pdfjs: pdfjsDi('La franchigia è di € 500.'),
        ocr: ocrDi('La franchigia è di € 500 e il massimale di € 6.450.000.'),
      }),
    ]);
    expect(g!.esito).toBe('guarda');
  });

  it('senza testo pdfjs (scansione) giudica il solo OCR, e lo dice', () => {
    const [g] = giudica([
      pagina(1, {
        trascrizione: 'Massimale € 1.000.000.',
        pdfjs: pdfjsDi(''),
        ocr: ocrDi('Massimale € 1.000.000. Franchigia € 250.'),
      }),
    ]);
    expect(g!.esito).toBe('guarda');
    expect(g!.note.join(' ')).toContain('pdfjs cieco');
  });

  it('una pagina non trascritta va guardata', () => {
    const [g] = giudica([pagina(1, { trascrizione: undefined })]);
    expect(g!.esito).toBe('guarda');
    expect(g!.note.join(' ')).toContain('mancante');
  });

  it('il piè di pagina che torna su ogni pagina è cornice, non un buco', () => {
    /* Il numero di pagina del piè cambia a ogni foglio: senza il
       riconoscimento della cornice, ogni pagina risulterebbe «persa». */
    const pagine = [1, 2, 3, 4].map((n) =>
      pagina(n, {
        trascrizione: `Testo della pagina ${n} del contratto.`,
        pdfjs: pdfjsDi(`Set informativo - Pag. ${n} di 4\nTesto della pagina ${n} del contratto.`),
        ocr: ocrDi(`Set informativo - Pag. ${n} di 4\nTesto della pagina ${n} del contratto.`),
      }),
    );
    expect(giudica(pagine).map((g) => g.esito)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('qualche parola di scarto è rumore, una frase saltata no', () => {
    const comune = 'Le garanzie operano nei limiti indicati in polizza.';
    const [poche] = giudica([
      pagina(1, {
        trascrizione: comune,
        pdfjs: pdfjsDi(`${comune} salvo diverso`),
        ocr: ocrDi(`${comune} salvo diverso`),
      }),
    ]);
    expect(poche!.esito).toBe('ok');

    const [molte] = giudica([
      pagina(1, {
        trascrizione: comune,
        pdfjs: pdfjsDi(`${comune} La compagnia non risponde dei danni cagionati da dolo o colpa grave dell'assicurato.`),
        ocr: ocrDi(`${comune} La compagnia non risponde dei danni cagionati da dolo o colpa grave dell'assicurato.`),
      }),
    ]);
    expect(molte!.esito).toBe('guarda');
  });
});
