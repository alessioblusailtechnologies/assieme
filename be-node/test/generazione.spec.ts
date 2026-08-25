import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { analizzaMarkdown, segmenti, testoPiano } from '../src/generazione/blocchi.js';
import { componiDocx, riempiDocx, segnapostoDocx, type CampiTemplate } from '../src/generazione/docx.js';
import { generaDocumento, nomeFileGenerato } from '../src/generazione/generatore.js';
import { componiPdf } from '../src/generazione/pdf.js';
import { componiXlsx, riempiXlsx, segnapostoXlsx } from '../src/generazione/xlsx.js';

/**
 * La «prova per formato» chiesta dal piano: i file generati non devono solo
 * esistere, devono **riaprirsi** — il PDF con pdf-lib, DOCX e XLSX come gli
 * archivi che sono — e contenere il testo che ci abbiamo messo. È il criterio
 * con cui le librerie sono state scelte (pdf-lib, docx, exceljs,
 * docxtemplater): un download che Word rifiuta è la funzione al contrario.
 */

const IDENTITA = {
  colorePrimario: '#2f4b7c',
  recapiti: 'Corso Vinzaglio 12, Torino · 011 561 8420',
  firma: 'Assicurazioni Meridiana S.r.l.',
};

const TESTO = [
  '# Confronto delle garanzie',
  '',
  'La garanzia **Furto e Rapina** prevede uno scoperto del 10%.',
  '',
  '- Franchigia: 500 euro',
  '- Scoperto minimo: 250 euro',
  '',
  '| Garanzia | Franchigia |',
  '| --- | --- |',
  '| Furto | 500 € |',
  '| Kasko | 1.000 € |',
].join('\n');

const FONTI = ['Km&Servizi UnipolSai — art. 12, p. 34'];

const CAMPI: CampiTemplate = {
  titolo: 'Riepilogo garanzie',
  data: '25 agosto 2026',
  destinatario: 'Rossi Mario',
  contenuto: 'Prima riga del contenuto.\nSeconda riga del contenuto.',
  fonti: 'Km&Servizi UnipolSai — p. 34',
};

/** Il testo visibile di un DOCX: le run di document.xml, senza tag. */
const testoDocx = (byte: Buffer): string =>
  new PizZip(byte).files['word/document.xml']!.asText().replace(/<[^>]+>/g, '');

async function docxDiProva(paragrafi: string[]): Promise<Buffer> {
  const documento = new Document({
    sections: [{ children: paragrafi.map((t) => new Paragraph({ children: [new TextRun(t)] })) }],
  });
  return Packer.toBuffer(documento);
}

async function xlsxDiProva(celle: Record<string, string>): Promise<Buffer> {
  const cartella = new ExcelJS.Workbook();
  const foglio = cartella.addWorksheet('Modello');
  for (const [riferimento, valore] of Object.entries(celle)) foglio.getCell(riferimento).value = valore;
  return Buffer.from(await cartella.xlsx.writeBuffer());
}

describe('analisi del testo in blocchi', () => {
  it('titoli, grassetti, elenchi e tabelle diventano blocchi distinti', () => {
    const blocchi = analizzaMarkdown(TESTO);
    expect(blocchi.map((b) => b.tipo)).toEqual([
      'titolo',
      'paragrafo',
      'voce-elenco',
      'voce-elenco',
      'tabella',
    ]);
    const tabella = blocchi.at(-1)!;
    expect(tabella.tipo === 'tabella' && tabella.righe).toEqual([
      ['Garanzia', 'Franchigia'],
      ['Furto', '500 €'],
      ['Kasko', '1.000 €'],
    ]);
  });

  it('i segmenti separano il grassetto e la versione piatta lo riassorbe', () => {
    expect(segmenti('con **Furto** e rapina')).toEqual([
      { testo: 'con ', grassetto: false },
      { testo: 'Furto', grassetto: true },
      { testo: ' e rapina', grassetto: false },
    ]);
    expect(testoPiano(analizzaMarkdown('La **garanzia** vale'))).toEqual(['La garanzia vale']);
  });
});

describe('PDF (pdf-lib)', () => {
  it('il documento si riapre, con le pagine e il titolo dichiarati', async () => {
    const byte = await componiPdf({
      titolo: 'Confronto polizze',
      blocchi: analizzaMarkdown(TESTO),
      fonti: FONTI,
      identita: IDENTITA,
    });
    expect(byte.subarray(0, 5).toString()).toBe('%PDF-');
    const documento = await PDFDocument.load(byte);
    expect(documento.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(documento.getTitle()).toBe('Confronto polizze');
  });

  it('la carta intestata del tenant fa da sfondo e il file resta apribile', async () => {
    const carta = await PDFDocument.create();
    const font = await carta.embedFont(StandardFonts.Helvetica);
    carta.addPage().drawText('CARTA INTESTATA', { x: 40, y: 800, size: 14, font });
    const byte = await componiPdf({
      titolo: 'Su carta intestata',
      blocchi: analizzaMarkdown('Testo sopra la carta.'),
      fonti: [],
      identita: IDENTITA,
      sfondo: Buffer.from(await carta.save()),
    });
    const documento = await PDFDocument.load(byte);
    expect(documento.getPageCount()).toBe(1);
  });

  it('un testo lungo scorre su più pagine', async () => {
    const byte = await componiPdf({
      titolo: 'Lungo',
      blocchi: analizzaMarkdown(Array.from({ length: 80 }, (_, i) => `Paragrafo numero ${i}.`).join('\n\n')),
      fonti: [],
      identita: IDENTITA,
    });
    expect((await PDFDocument.load(byte)).getPageCount()).toBeGreaterThan(1);
  });
});

describe('DOCX (docx + docxtemplater)', () => {
  it('il precaricato si apre come archivio DOCX e porta testo, fonti e identità', async () => {
    const byte = await componiDocx({
      titolo: 'Riepilogo',
      blocchi: analizzaMarkdown(TESTO),
      fonti: FONTI,
      identita: IDENTITA,
    });
    const testo = testoDocx(byte);
    expect(testo).toContain('Furto e Rapina');
    expect(testo).toContain('Km&amp;Servizi UnipolSai');
    expect(new PizZip(byte).files['word/document.xml']).toBeDefined();
  });

  it('il template del tenant si riempie sui segnaposto, anche spezzati in più run', async () => {
    const modello = await docxDiProva(['Oggetto: {{titolo}} del {{data}}', '{{contenuto}}', 'Fonti: {{fonti}}']);
    expect(segnapostoDocx(modello).sort()).toEqual(['contenuto', 'data', 'fonti', 'titolo']);
    const byte = riempiDocx(modello, CAMPI);
    const testo = testoDocx(byte);
    expect(testo).toContain('Oggetto: Riepilogo garanzie del 25 agosto 2026');
    expect(testo).toContain('Prima riga del contenuto.');
    expect(testo).not.toContain('{{');
  });

  it('una carta intestata senza segnaposto: titolo, testo e fonti in coda a ciò che c’è', async () => {
    const modello = await docxDiProva(['Agenzia Meridiana — via Roma 1']);
    expect(segnapostoDocx(modello)).toEqual([]);
    const testo = testoDocx(riempiDocx(modello, CAMPI));
    expect(testo.indexOf('Agenzia Meridiana')).toBeLessThan(testo.indexOf('Riepilogo garanzie'));
    expect(testo.indexOf('Riepilogo garanzie')).toBeLessThan(testo.indexOf('Prima riga del contenuto.'));
    expect(testo).toContain('p. 34'); // le fonti in coda («&» nell'XML è escapato)
    expect(testo).not.toContain('{{');
  });
});

describe('XLSX (exceljs)', () => {
  it('il precaricato si riapre e le righe della tabella stanno su colonne vere', async () => {
    const byte = await componiXlsx({
      titolo: 'Report interno',
      blocchi: analizzaMarkdown(TESTO),
      fonti: FONTI,
      identita: IDENTITA,
    });
    const cartella = new ExcelJS.Workbook();
    await cartella.xlsx.load(byte as unknown as ExcelJS.Buffer);
    const foglio = cartella.getWorksheet('Analisi')!;
    expect(foglio.getCell('A1').text).toBe('Report interno');
    const valori: string[][] = [];
    foglio.eachRow((riga) => {
      valori.push([riga.getCell(1).text, riga.getCell(2).text]);
    });
    expect(valori).toContainEqual(['Garanzia', 'Franchigia']);
    expect(valori).toContainEqual(['Furto', '500 €']);
  });

  it('il template del tenant si riempie e {{contenuto}} espande righe sotto la sua cella', async () => {
    const modello = await xlsxDiProva({ A1: 'Titolo: {{titolo}}', A3: '{{contenuto}}', A5: 'dopo' });
    expect(await segnapostoXlsx(modello)).toEqual(expect.arrayContaining(['titolo', 'contenuto']));
    const byte = await riempiXlsx(modello, CAMPI);
    const cartella = new ExcelJS.Workbook();
    await cartella.xlsx.load(byte as unknown as ExcelJS.Buffer);
    const foglio = cartella.getWorksheet('Modello')!;
    expect(foglio.getCell('A1').text).toBe('Titolo: Riepilogo garanzie');
    expect(foglio.getCell('A3').text).toBe('Prima riga del contenuto.');
    expect(foglio.getCell('A4').text).toBe('Seconda riga del contenuto.');
    expect(foglio.getCell('A6').text).toBe('dopo'); // la riga inserita spinge il resto in giù
  });

  it('un foglio intestato senza segnaposto: il testo va sotto, titolo in testa', async () => {
    const modello = await xlsxDiProva({ A1: 'Agenzia Meridiana' });
    const byte = await riempiXlsx(modello, CAMPI);
    const cartella = new ExcelJS.Workbook();
    await cartella.xlsx.load(byte as unknown as ExcelJS.Buffer);
    const foglio = cartella.getWorksheet('Modello')!;
    expect(foglio.getCell('A1').text).toBe('Agenzia Meridiana');
    expect(foglio.getCell('A3').text).toBe('Riepilogo garanzie');
    expect(foglio.getCell('A5').text).toBe('Prima riga del contenuto.');
    expect(foglio.getCell('A6').text).toBe('Seconda riga del contenuto.');
  });
});

describe('la facciata generaDocumento', () => {
  it('sceglie il compositore dal formato e nomina il file con la regola del mock', async () => {
    const file = await generaDocumento({
      template: { nome: 'Proposta di rinnovo', formato: 'docx', personalizzato: false },
      titolo: 'Proposta di rinnovo',
      testo: 'Testo della proposta.',
      fonti: [],
      identita: IDENTITA,
    });
    expect(file.contentType).toContain('wordprocessingml');
    expect(file.nomeFile).toBe('proposta-di-rinnovo.docx');
    expect(testoDocx(file.byte)).toContain('Testo della proposta.');
    expect(nomeFileGenerato('Carta intestata Méridiana', 'pdf')).toBe('carta-intestata-m-ridiana.pdf');
  });
});
