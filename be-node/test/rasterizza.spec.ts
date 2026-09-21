import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { promptBloccoImmagini } from '../src/worker/ingestion/convenzioni.js';
import { DPI_TRASCRIZIONE, pagineInPng } from '../src/worker/ingestion/rasterizza.js';

/**
 * Le pagine in PNG: servono a chi guarda le pagine ma non sa leggere un PDF
 * (dal 19/09/2026 il trascrittore sta su DeepSeek, che prende immagini). Con
 * Anthropic questa strada non si percorre: il PDF gli va intero.
 */

async function pdfDiProva(pagine: number): Promise<Buffer> {
  const documento = await PDFDocument.create();
  const font = await documento.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pagine; n++) {
    /* A4 in punti: 595 × 842. */
    const pagina = documento.addPage([595, 842]);
    pagina.drawText(`Pagina ${n} - franchigia 300 euro`, { x: 60, y: 760, size: 18, font });
  }
  return Buffer.from(await documento.save());
}

describe('la rasterizzazione delle pagine', () => {
  it('una PNG per pagina, nell’ordine, alla risoluzione del collaudo', async () => {
    const png = pagineInPng(await pdfDiProva(3));
    expect(png).toHaveLength(3);
    for (const byte of png) {
      // Firma PNG: \x89PNG\r\n\x1a\n
      expect(byte.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      /* Larghezza e altezza stanno nell'IHDR, big endian, dal byte 16. */
      const larghezza = byte.readUInt32BE(16);
      const altezza = byte.readUInt32BE(20);
      /* Il pixel di scarto è l'arrotondamento di mupdf, che tira su. */
      expect(Math.abs(larghezza - (595 / 72) * DPI_TRASCRIZIONE)).toBeLessThanOrEqual(1);
      expect(Math.abs(altezza - (842 / 72) * DPI_TRASCRIZIONE)).toBeLessThanOrEqual(1);
    }
    /* Pagine diverse, immagini diverse: se fossero tutte la prima, questo
       confronto passerebbe inosservato. */
    expect(png[0]!.equals(png[1]!)).toBe(false);
  });

  it('un PDF di una pagina sola dà una immagine sola', async () => {
    expect(pagineInPng(await pdfDiProva(1))).toHaveLength(1);
  });
});

describe('il prompt delle pagine-immagine', () => {
  it('a pagina singola dice quale pagina è, e da dove numerare l’ancora', () => {
    const testo = promptBloccoImmagini(47, 212, 1);
    expect(testo).toContain("l'immagine allegata");
    expect(testo).toContain('la pagina 47 del PDF complessivo');
    expect(testo).toContain('[pag. 47]');
    expect(testo).toContain('212 pagine');
  });

  it('a più pagine dichiara l’intervallo, così le ancore non slittano', () => {
    const testo = promptBloccoImmagini(10, 212, 3);
    expect(testo).toContain('le 3 immagini allegate');
    expect(testo).toContain('dalla 10 alla 12');
    expect(testo).toContain('[pag. 10]');
  });
});
