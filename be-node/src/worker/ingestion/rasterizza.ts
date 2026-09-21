import * as mupdf from 'mupdf';

/**
 * Le pagine di un PDF in PNG, una per pagina.
 *
 * Serve a chi guarda le pagine ma non sa leggere un PDF: DeepSeek prende
 * immagini e basta (collaudo del 12/09/2026, PIANO-ARCHIVIO-UNIPOL.md). Con
 * Anthropic non passa di qui — il PDF glielo si manda intero, ed è meglio:
 * il testo vettoriale non viene rasterizzato e nulla si perde.
 *
 * **150 dpi, pagina intera**: è l'unica variante che il collaudo ha promosso.
 * Le mezze pagine a 220 dpi sono state scartate — una pagina quasi persa e
 * una duplicata — e più risoluzione, sulla pagina intera, non ha comprato
 * niente. Chi tocca questo numero rifaccia il collaudo.
 */
export const DPI_TRASCRIZIONE = 150;

export function pagineInPng(pdf: Buffer, dpi = DPI_TRASCRIZIONE): Buffer[] {
  const scala = dpi / 72;
  const documento = mupdf.Document.openDocument(pdf, 'application/pdf');
  try {
    const png: Buffer[] = [];
    for (let i = 0; i < documento.countPages(); i++) {
      const pagina = documento.loadPage(i);
      /* Senza alpha e con gli extra (annotazioni, timbri): sulla pagina
         c'è quello che ci vedrebbe chi la stampa. */
      const pixmap = pagina.toPixmap(mupdf.Matrix.scale(scala, scala), mupdf.ColorSpace.DeviceRGB, false, true);
      png.push(Buffer.from(pixmap.asPNG()));
      pixmap.destroy();
      pagina.destroy();
    }
    return png;
  } finally {
    documento.destroy();
  }
}
