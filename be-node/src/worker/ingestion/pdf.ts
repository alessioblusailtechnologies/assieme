import { PDFDocument } from 'pdf-lib';

/**
 * Spezzatura del PDF in blocchi di pagine.
 *
 * Serve per due motivi, entrambi duri: l'API accetta al massimo 100 pagine
 * per richiesta sui modelli a contesto 200K (Haiku), e un set informativo
 * vero ne ha 212; e blocchi più piccoli tengono l'output di ogni chiamata
 * dentro `max_tokens` senza troncare.
 */
export async function contaPagine(pdf: Buffer): Promise<number> {
  const documento = await PDFDocument.load(pdf, { ignoreEncryption: true });
  return documento.getPageCount();
}

/** Estrae le pagine [da, a] (1-based, inclusive) in un PDF autonomo. */
export async function estraiPagine(pdf: Buffer, da: number, a: number): Promise<Buffer> {
  const sorgente = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const destinazione = await PDFDocument.create();
  const indici = [];
  for (let i = da - 1; i < a; i++) indici.push(i);
  const pagine = await destinazione.copyPages(sorgente, indici);
  for (const pagina of pagine) destinazione.addPage(pagina);
  return Buffer.from(await destinazione.save());
}

/** I blocchi [da, a] in cui spezzare un documento di `totale` pagine. */
export function blocchi(totale: number, pagineNelBlocco: number): Array<[number, number]> {
  const esito: Array<[number, number]> = [];
  for (let da = 1; da <= totale; da += pagineNelBlocco) {
    esito.push([da, Math.min(da + pagineNelBlocco - 1, totale)]);
  }
  return esito;
}
