import {
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { Blocco, Segmento } from './blocchi.js';
import { fasciaDocx, fasciaVuota, type FasceDocumento } from './intestazione.js';

/**
 * Il compositore DOCX: il layout di VELIA con la libreria `docx`, e in
 * testa e in calce l'intestazione e il piè di pagina dell'agenzia
 * (11/09/2026, `intestazione.ts`), come `Header` e `Footer` veri di Word:
 * chi apre il file li ritrova dove se li aspetta, e li può ritoccare.
 */

export interface OpzioniDocx {
  titolo: string;
  blocchi: Blocco[];
  fonti: string[];
  fasce: FasceDocumento;
}

/** L'accento del layout di VELIA: titoli e testata delle tabelle. */
const ACCENTO = '2f4b7c';

export async function componiDocx(opzioni: OpzioniDocx): Promise<Buffer> {
  const testo = (s: Segmento[], dimensione = 22): TextRun[] =>
    s.map((x) => new TextRun({ text: x.testo, bold: x.grassetto, size: dimensione }));

  const figli: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: opzioni.titolo, bold: true, size: 32, color: ACCENTO })],
      spacing: { after: 240 },
    }),
  ];

  for (const blocco of opzioni.blocchi) {
    switch (blocco.tipo) {
      case 'titolo':
        figli.push(
          new Paragraph({
            heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][blocco.livello - 1]!,
            children: [
              new TextRun({
                text: blocco.testo,
                bold: true,
                color: ACCENTO,
                size: [28, 25, 23][blocco.livello - 1]!,
              }),
            ],
            spacing: { before: 200, after: 120 },
          }),
        );
        break;
      case 'paragrafo':
        figli.push(new Paragraph({ children: testo(blocco.segmenti), spacing: { after: 120 } }));
        break;
      case 'voce-elenco':
        figli.push(
          new Paragraph({ children: testo(blocco.segmenti), bullet: { level: 0 }, spacing: { after: 60 } }),
        );
        break;
      case 'tabella': {
        const colonne = Math.max(...blocco.righe.map((r) => r.length));
        figli.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: blocco.righe.map(
              (riga, indice) =>
                new TableRow({
                  children: Array.from({ length: colonne }, (_, i) => {
                    const intestazione = indice === 0;
                    return new TableCell({
                      ...(intestazione && {
                        shading: { fill: ACCENTO, color: 'auto' },
                      }),
                      margins: { top: 60, bottom: 60, left: 100, right: 100 },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: riga[i] ?? '',
                              bold: intestazione,
                              size: 19,
                              ...(intestazione && { color: 'ffffff' }),
                            }),
                          ],
                        }),
                      ],
                    });
                  }),
                }),
            ),
          }),
          new Paragraph({ spacing: { after: 120 } }),
        );
        break;
      }
    }
  }

  if (opzioni.fonti.length) {
    figli.push(
      new Paragraph({
        children: [new TextRun({ text: 'Fonti', bold: true, size: 25, color: ACCENTO })],
        spacing: { before: 240, after: 120 },
      }),
      ...opzioni.fonti.map(
        (fonte) =>
          new Paragraph({
            children: [new TextRun({ text: fonte, italics: true, size: 19, color: '737373' })],
            bullet: { level: 0 },
            spacing: { after: 40 },
          }),
      ),
    );
  }

  const { intestazione, piede } = opzioni.fasce;
  const documento = new Document({
    creator: 'VELIA',
    title: opzioni.titolo,
    sections: [
      {
        ...(!fasciaVuota(intestazione) && {
          headers: { default: new Header({ children: fasciaDocx(intestazione, opzioni.fasce) }) },
        }),
        ...(!fasciaVuota(piede) && {
          footers: { default: new Footer({ children: fasciaDocx(piede, opzioni.fasce) }) },
        }),
        children: figli,
      },
    ],
  });

  return Packer.toBuffer(documento);
}
