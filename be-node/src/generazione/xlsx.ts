import ExcelJS from 'exceljs';

import { testoPiano, type Blocco } from './blocchi.js';
import type { CampiTemplate } from './docx.js';

/**
 * Il compositore XLSX: i precaricati («Report interno») si costruiscono con
 * exceljs — testata col colore primario, testo su celle unite, tabelle su
 * colonne vere, fonti in coda; i template del tenant sono cartelle XLSX con
 * segnaposto `{{…}}` nelle celle, riempiti al loro posto (il foglio, con
 * formati e formule, resta il loro).
 */

export interface OpzioniXlsx {
  titolo: string;
  blocchi: Blocco[];
  fonti: string[];
  identita: { colorePrimario: string; recapiti: string; firma: string };
}

const COLONNE = 6;

const argb = (hex: string): string => `FF${hex.replace('#', '').toUpperCase()}`;

export async function componiXlsx(opzioni: OpzioniXlsx): Promise<Buffer> {
  const cartella = new ExcelJS.Workbook();
  cartella.creator = 'VELIA';
  const foglio = cartella.addWorksheet('Analisi');
  for (let i = 1; i <= COLONNE; i++) foglio.getColumn(i).width = 26;

  const tinta = argb(opzioni.identita.colorePrimario);
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

  rigaUnita(opzioni.titolo, { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }, tinta).height = 26;
  if (opzioni.identita.firma) {
    rigaUnita(opzioni.identita.firma, { size: 9, color: grigio });
  }
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
            cella.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tinta } };
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
  if (opzioni.identita.recapiti) {
    foglio.addRow([]);
    rigaUnita(opzioni.identita.recapiti, { size: 8, color: grigio });
  }

  return Buffer.from(await cartella.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Template del tenant: segnaposto {{…}} nelle celle
// ---------------------------------------------------------------------------

export async function segnapostoXlsx(byte: Buffer): Promise<string[]> {
  const cartella = new ExcelJS.Workbook();
  await cartella.xlsx.load(byte as unknown as ExcelJS.Buffer);
  const trovati = new Set<string>();
  cartella.eachSheet((foglio) => {
    foglio.eachRow((riga) => {
      riga.eachCell((cella) => {
        for (const m of cella.text.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)) trovati.add(m[1]!);
      });
    });
  });
  return [...trovati];
}

/**
 * Riempie un template XLSX del tenant: i campi brevi si sostituiscono nella
 * cella; `{{contenuto}}` e `{{fonti}}` diventano la prima riga del loro
 * blocco più una riga inserita (con lo stile della cella di partenza) per
 * ogni riga successiva.
 */
export async function riempiXlsx(byte: Buffer, campi: CampiTemplate): Promise<Buffer> {
  const cartella = new ExcelJS.Workbook();
  await cartella.xlsx.load(byte as unknown as ExcelJS.Buffer);

  const brevi: Array<[RegExp, string]> = [
    [/\{\{\s*titolo\s*\}\}/g, campi.titolo],
    [/\{\{\s*data\s*\}\}/g, campi.data],
    [/\{\{\s*destinatario\s*\}\}/g, campi.destinatario],
  ];
  const blocchi: Array<[RegExp, string[]]> = [
    [/\{\{\s*contenuto\s*\}\}/, campi.contenuto.split('\n').filter(Boolean)],
    [/\{\{\s*fonti\s*\}\}/, campi.fonti.split('\n').filter(Boolean)],
  ];

  cartella.eachSheet((foglio) => {
    /* Prima i campi brevi e il censimento dei blocchi, poi gli inserimenti
       dal basso verso l'alto: i numeri di riga già censiti restano validi. */
    const daEspandere: Array<{ riga: number; colonna: number; righe: string[] }> = [];
    foglio.eachRow((riga, numeroRiga) => {
      riga.eachCell((cella, numeroColonna) => {
        if (typeof cella.value !== 'string') return;
        let testo = cella.value;
        for (const [espressione, valore] of brevi) testo = testo.replace(espressione, valore);
        for (const [espressione, righe] of blocchi) {
          if (espressione.test(testo)) {
            daEspandere.push({ riga: numeroRiga, colonna: numeroColonna, righe: righe.length ? righe : [''] });
            testo = testo.replace(espressione, righe[0] ?? '');
          }
        }
        if (testo !== cella.value) cella.value = testo;
      });
    });

    for (const blocco of daEspandere.sort((a, b) => b.riga - a.riga)) {
      for (let i = blocco.righe.length - 1; i >= 1; i--) {
        const nuova = foglio.insertRow(blocco.riga + 1, [], 'i');
        nuova.getCell(blocco.colonna).value = blocco.righe[i];
      }
      const cella = foglio.getRow(blocco.riga).getCell(blocco.colonna);
      cella.alignment = { ...cella.alignment, wrapText: true };
    }
  });

  return Buffer.from(await cartella.xlsx.writeBuffer());
}
