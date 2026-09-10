import ExcelJS from 'exceljs';

import { testoPiano, type Blocco } from './blocchi.js';
import { fasciaXlsx, type FasceDocumento } from './intestazione.js';

/**
 * Il compositore XLSX: il layout di VELIA con exceljs (titolo su una fascia
 * colorata, testo su celle unite, tabelle su colonne vere, fonti in coda) e
 * l'intestazione e il piè di pagina dell'agenzia nelle fasce di stampa di
 * Excel (11/09/2026): solo testo, in sinistra, centro e destra, perché è
 * tutto quello che un'intestazione di Excel sa portare in ogni programma.
 */

export interface OpzioniXlsx {
  titolo: string;
  blocchi: Blocco[];
  fonti: string[];
  fasce: FasceDocumento;
}

const COLONNE = 6;

/** L'accento del layout di VELIA, in ARGB. */
const ACCENTO = 'FF2F4B7C';

export async function componiXlsx(opzioni: OpzioniXlsx): Promise<Buffer> {
  const cartella = new ExcelJS.Workbook();
  cartella.creator = 'VELIA';
  const foglio = cartella.addWorksheet('Analisi');
  for (let i = 1; i <= COLONNE; i++) foglio.getColumn(i).width = 26;

  const intestazione = fasciaXlsx(opzioni.fasce.intestazione, opzioni.fasce.campi);
  const piede = fasciaXlsx(opzioni.fasce.piede, opzioni.fasce.campi);
  foglio.headerFooter = {
    ...(intestazione && { oddHeader: intestazione }),
    ...(piede && { oddFooter: piede }),
  };

  const grigio = { argb: 'FF737373' };

  const rigaUnita = (
    testo: string,
    stile: Partial<ExcelJS.Font> = {},
    riempimento?: string,
  ): ExcelJS.Row => {
    const riga = foglio.addRow([testo]);
    foglio.mergeCells(riga.number, 1, riga.number, COLONNE);
    const cella = riga.getCell(1);
    cella.font = { size: 10, ...stile };
    cella.alignment = { wrapText: true, vertical: 'top' };
    if (riempimento) {
      cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: riempimento } };
    }
    return riga;
  };

  rigaUnita(opzioni.titolo, { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }, ACCENTO).height = 26;
  foglio.addRow([]);

  for (const blocco of opzioni.blocchi) {
    if (blocco.tipo === 'tabella') {
      blocco.righe.forEach((valori, indice) => {
        const riga = foglio.addRow(valori);
        riga.eachCell((cella) => {
          cella.alignment = { wrapText: true, vertical: 'top' };
          cella.border = {
            top: { style: 'thin', color: { argb: 'FFC8C8C8' } },
            bottom: { style: 'thin', color: { argb: 'FFC8C8C8' } },
            left: { style: 'thin', color: { argb: 'FFC8C8C8' } },
            right: { style: 'thin', color: { argb: 'FFC8C8C8' } },
          };
          if (indice === 0) {
            cella.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENTO } };
          }
        });
      });
      foglio.addRow([]);
    } else if (blocco.tipo === 'titolo') {
      rigaUnita(blocco.testo, { bold: true, size: [13, 12, 11][blocco.livello - 1]! });
    } else {
      for (const riga of testoPiano([blocco])) rigaUnita(riga);
    }
  }

  if (opzioni.fonti.length) {
    foglio.addRow([]);
    rigaUnita('Fonti', { bold: true, size: 12 });
    for (const fonte of opzioni.fonti) rigaUnita(fonte, { italic: true, size: 9, color: grigio });
  }

  return Buffer.from(await cartella.xlsx.writeBuffer());
}
