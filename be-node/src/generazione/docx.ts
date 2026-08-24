import Docxtemplater from 'docxtemplater';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PizZip from 'pizzip';

import type { Blocco, Segmento } from './blocchi.js';

/**
 * Il compositore DOCX: i template precaricati si impaginano con la libreria
 * `docx` (testata con logo e firma, filo del colore primario, recapiti e
 * numero di pagina in calce); i template del tenant (RF-D-12) sono file DOCX
 * veri con segnaposto `{{…}}`, riempiti con docxtemplater — l'impaginazione
 * resta la loro, che è il punto della fedeltà.
 */

export interface OpzioniDocx {
  titolo: string;
  blocchi: Blocco[];
  fonti: string[];
  identita: { colorePrimario: string; recapiti: string; firma: string };
  logo?: { byte: Buffer; tipo: string };
}

/** I campi dello schema dei segnaposto (RF-D-12), comuni a DOCX e XLSX. */
export interface CampiTemplate {
  titolo: string;
  data: string;
  destinatario: string;
  contenuto: string;
  fonti: string;
}

const colorePulito = (hex: string): string => hex.replace('#', '');

export async function componiDocx(opzioni: OpzioniDocx): Promise<Buffer> {
  const colore = colorePulito(opzioni.identita.colorePrimario);
  const testo = (s: Segmento[], dimensione = 22): TextRun[] =>
    s.map((x) => new TextRun({ text: x.testo, bold: x.grassetto, size: dimensione }));

  const figli: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: opzioni.titolo, bold: true, size: 32, color: colore })],
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
                color: colore,
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
                        shading: { fill: colore, color: 'auto' },
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
        children: [new TextRun({ text: 'Fonti', bold: true, size: 25, color: colore })],
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

  const logo = opzioni.logo
    ? new ImageRun({
        data: opzioni.logo.byte,
        type: opzioni.logo.tipo === 'image/png' ? 'png' : 'jpg',
        transformation: { width: 96, height: 34 },
      })
    : undefined;

  const documento = new Document({
    creator: 'VELIA',
    title: opzioni.titolo,
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: colore, space: 4 } },
                children: [
                  ...(logo ? [logo, new TextRun({ text: '   ' })] : []),
                  new TextRun({ text: opzioni.identita.firma, bold: true, size: 20, color: colore }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'c8c8c8', space: 4 } },
                children: [new TextRun({ text: opzioni.identita.recapiti, size: 16, color: '737373' })],
              }),
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT, ' di ', PageNumber.TOTAL_PAGES], size: 16, color: '737373' }),
                ],
              }),
            ],
          }),
        },
        children: figli,
      },
    ],
  });

  return Packer.toBuffer(documento);
}

// ---------------------------------------------------------------------------
// Template del tenant: segnaposto {{…}}
// ---------------------------------------------------------------------------

const PARTI_TESTUALI = /^word\/(document|header\d*|footer\d*)\.xml$/;

/**
 * I segnaposto presenti nel file. Word spezza il testo in run arbitrarie:
 * togliendo i tag XML le run tornano contigue e `{{contenuto}}` si legge
 * anche se Word l'ha spezzato in tre.
 */
export function segnapostoDocx(byte: Buffer): string[] {
  const zip = new PizZip(byte);
  const trovati = new Set<string>();
  for (const nome of Object.keys(zip.files)) {
    if (!PARTI_TESTUALI.test(nome)) continue;
    const testo = zip.files[nome]!.asText().replace(/<[^>]+>/g, '');
    for (const m of testo.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)) trovati.add(m[1]!);
  }
  return [...trovati];
}

/** Riempie un template DOCX del tenant coi campi dello schema (RF-D-12). */
export function riempiDocx(byte: Buffer, campi: CampiTemplate): Buffer {
  const documento = new Docxtemplater(new PizZip(byte), {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  documento.render(campi);
  return documento.getZip().generate({ type: 'nodebuffer' });
}
