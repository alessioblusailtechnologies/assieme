import ExcelJS from 'exceljs';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { riconosciFormato, estensionePerFormato } from '../src/api/archivio-privato/formati.js';
import { markdownDaOriginale, markdownDaHtml } from '../src/worker/ingestion/estrattori.js';
import { impagina, pdfDaImmagine, PAGINE_MASSIME } from '../src/worker/ingestion/impagina.js';
import { contaPagine } from '../src/worker/ingestion/pdf.js';

/**
 * I formati oltre il PDF (01/09/2026): riconoscimento all'ingresso,
 * estrazione del testo e impaginazione nel PDF che il visualizzatore aprirà.
 * Niente database e niente modello: sono passaggi meccanici, e devono
 * restare tali.
 */

const file = (nome: string, contenuto: Buffer | string, mimetype = 'application/octet-stream') => ({
  nome,
  mimetype,
  contenuto: typeof contenuto === 'string' ? Buffer.from(contenuto, 'utf8') : contenuto,
  troncato: false,
});

async function docxDiProva(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Polizza Rossi', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('La garanzia '),
              new TextRun({ text: 'cristalli', bold: true }),
              new TextRun(' ha franchigia di € 200.'),
            ],
          }),
          new Paragraph({ text: 'Dolo del conducente', bullet: { level: 0 } }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Garanzia')] }),
                  new TableCell({ children: [new Paragraph('Massimale')] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('RCA')] }),
                  new TableCell({ children: [new Paragraph('6.450.000 €')] }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

async function xlsxDiProva(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const foglio = libro.addWorksheet('Listino');
  foglio.addRow(['Garanzia', 'Premio']);
  foglio.addRow(['RCA', 340]);
  foglio.addRow(['Cristalli', 45]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe('riconoscimento dei formati', () => {
  it('accetta ciò che dichiara di essere, e solo se i byte gli danno ragione', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    const bytePdf = Buffer.from(await pdf.save());

    expect(riconosciFormato(file('polizza.pdf', bytePdf, 'application/pdf'))).toBe('pdf');
    expect(riconosciFormato(file('note.md', '# Titolo\n\ntesto'))).toBe('markdown');
    expect(riconosciFormato(file('note.txt', 'solo testo'))).toBe('testo');
    expect(riconosciFormato(file('listino.csv', 'a;b\n1;2'))).toBe('csv');
    expect(riconosciFormato(file('polizza.docx', await docxDiProva()))).toBe('docx');
    expect(riconosciFormato(file('listino.xlsx', await xlsxDiProva()))).toBe('xlsx');

    /* Il nome dice PDF, i byte dicono altro: si rifiuta all'ingresso, non
       dieci minuti dopo con un errore di ingestion incomprensibile. */
    expect(riconosciFormato(file('finto.pdf', 'non sono un pdf'))).toBeUndefined();
    /* Un binario travestito da testo: il byte nullo lo smaschera. */
    expect(riconosciFormato(file('finto.txt', Buffer.from([0x41, 0x00, 0x42])))).toBeUndefined();
    expect(riconosciFormato(file('archivio.zip', 'PK'))).toBeUndefined();
  });

  it('un’immagine incollata in chat entra col nome che le dà il composer', () => {
    /* Un PNG 1×1 valido: qui conta la firma, non il contenuto. */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    /* Il nome ha un punto dentro (l'ora): l'estensione è l'ultima, non la prima. */
    expect(riconosciFormato(file('Immagine incollata 9.05.png', png, 'image/png'))).toBe('immagine');
    expect(estensionePerFormato('immagine', 'Immagine incollata 9.05.png')).toBe('.png');
    /* Un finto PNG non entra: lo dice la firma, non il nome. */
    expect(riconosciFormato(file('Immagine incollata 9.05.png', 'GIF89a', 'image/png'))).toBeUndefined();
  });

  it('il mimetype vale quando l’estensione manca, e l’estensione decide dove si conserva', () => {
    expect(riconosciFormato(file('appunti', 'due righe', 'text/markdown'))).toBe('markdown');
    expect(estensionePerFormato('markdown', 'note.markdown')).toBe('.markdown');
    expect(estensionePerFormato('markdown', 'appunti')).toBe('.md');
    expect(estensionePerFormato('immagine', 'foto.JPG')).toBe('.jpg');
  });
});

describe('estrazione del testo', () => {
  it('un .docx conserva titoli, grassetti, elenchi e soprattutto tabelle', async () => {
    const markdown = await markdownDaOriginale('docx', await docxDiProva());
    expect(markdown).toContain('# Polizza Rossi');
    expect(markdown).toContain('**cristalli**');
    expect(markdown).toContain('- Dolo del conducente');
    expect(markdown).toContain('| Garanzia | Massimale |');
    expect(markdown).toContain('| RCA | 6.450.000 € |');
  });

  it('un .xlsx diventa una sezione per foglio, coi valori come si leggevano', async () => {
    const markdown = await markdownDaOriginale('xlsx', await xlsxDiProva());
    expect(markdown).toContain('## Listino');
    expect(markdown).toContain('| Garanzia | Premio |');
    expect(markdown).toContain('| RCA | 340 |');
  });

  it('un .csv riconosce il separatore e le virgolette', async () => {
    const italiano = await markdownDaOriginale(
      'csv',
      Buffer.from('Garanzia;Massimale\nCristalli;"con ""franchigia"" 200"\n', 'utf8'),
    );
    expect(italiano).toContain('| Garanzia | Massimale |');
    expect(italiano).toContain('| Cristalli | con "franchigia" 200 |');

    const virgole = await markdownDaOriginale('csv', Buffer.from('a,b\n1,2\n', 'utf8'));
    expect(virgole).toContain('| a | b |');
    expect(virgole).toContain('| 1 | 2 |');
  });

  it('un .md passa com’è, senza BOM e senza fine riga di Windows', async () => {
    const markdown = await markdownDaOriginale('markdown', Buffer.from('﻿# Titolo\r\n\r\ntesto\r\n', 'utf8'));
    expect(markdown).toBe('# Titolo\n\ntesto');
  });

  it('l’HTML si legge solo nei tag che mammoth produce', () => {
    expect(markdownDaHtml('<h2>Titolo</h2><p>uno <strong>due</strong></p><ol><li>a</li><li>b</li></ol>')).toBe(
      '## Titolo\n\nuno **due**\n\n1. a\n2. b',
    );
  });
});

describe('impaginazione', () => {
  it('la mappa delle pagine combacia col PDF, pagina per pagina', async () => {
    const markdown = Array.from(
      { length: 40 },
      (_, i) => `## Sezione ${i + 1}\n\nTesto della sezione ${i + 1}, abbastanza lungo da occupare spazio nella pagina.`,
    ).join('\n\n');
    const esito = await impagina('Polizza Rossi', markdown);

    expect(esito.pagine.length).toBe(await contaPagine(esito.pdf));
    expect(esito.pagine.length).toBeGreaterThan(1);
    /* Il titolo del documento apre la prima pagina, e il Markdown della
       pagina è quello che finirà sotto l'ancora `[pag. 1]`. */
    expect(esito.pagine[0]).toContain('# Polizza Rossi');
    expect(esito.pagine[0]).toContain('## Sezione 1');
    expect(esito.pagine.join('\n')).toContain('## Sezione 40');
    /* Nessuna sezione si perde e nessuna compare due volte. */
    for (let i = 1; i <= 40; i++) {
      const titolo = new RegExp(`^## Sezione ${i}$`, 'm');
      const quante = esito.pagine.filter((p) => titolo.test(p)).length;
      expect(quante).toBe(1);
    }
  });

  it('il titolo del file non si somma a quello che il documento ha già', async () => {
    const suo = await impagina('appunti-agenzia', '# Prassi di agenzia\n\nSi segnala sempre la franchigia.');
    expect(suo.pagine[0]).toContain('# Prassi di agenzia');
    expect(suo.pagine[0]).not.toContain('appunti-agenzia');

    /* Un CSV o un .txt un titolo non ce l'hanno: quello del file serve. */
    const senza = await impagina('listino-2026', '| Garanzia | Premio |\n| --- | --- |\n| RCA | 340 |');
    expect(senza.pagine[0]).toContain('# listino-2026');
  });

  it('le tabelle restano tabelle anche nella mappa', async () => {
    const esito = await impagina('Listino', '| Garanzia | Premio |\n| --- | --- |\n| RCA | 340 |');
    expect(esito.pagine[0]).toContain('| Garanzia | Premio |');
    expect(esito.pagine[0]).toContain('| RCA | 340 |');
  });

  it('oltre il tetto si tronca, e lo si dice', async () => {
    const enorme = Array.from({ length: 20000 }, (_, i) => `Paragrafo numero ${i + 1} del documento.`).join('\n\n');
    const esito = await impagina('Enorme', enorme);
    expect(esito.pagine.length).toBe(PAGINE_MASSIME);
    expect(esito.pagine.at(-1)).toContain('troncato');
  });

  it('un’immagine diventa un PDF di una pagina', async () => {
    /* Un PNG 1×1 valido, in base64: basta a pdf-lib per incorporarlo. */
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const pdf = await pdfDaImmagine(png);
    expect(await contaPagine(pdf)).toBe(1);
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  });
});
