import type { PDFFont } from 'pdf-lib';

/**
 * La larghezza di un testo come `drawText` di pdf-lib lo disegna davvero.
 *
 * `widthOfTextAtSize` misura con la crenatura dei font standard («P.» e
 * «VA» si stringono), ma `drawText` disegna senza: la parola sulla carta è
 * più lunga di quanto misurato, e quella che segue le finisce addosso.
 * «P.IVA 0123» usciva «P.IVA0123» (11/09/2026), nelle intestazioni come nel
 * corpo dei documenti. Carattere per carattere non ci sono coppie da
 * crenare: misura e disegno tornano a coincidere.
 */
export function larghezzaTesto(font: PDFFont, testo: string, dimensione: number): number {
  let totale = 0;
  for (const carattere of testo) totale += font.widthOfTextAtSize(carattere, dimensione);
  return totale;
}
