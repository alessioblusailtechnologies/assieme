import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { schemaFascia, type Fascia } from '../src/contratto/intestazione.js';
import { analizzaMarkdown, segmenti, testoPiano } from '../src/generazione/blocchi.js';
import { componiDocx } from '../src/generazione/docx.js';
import { generaDocumento, nomeFileGenerato } from '../src/generazione/generatore.js';
import {
  dimensioniImmagine,
  fasciaXlsx,
  tipoImmagine,
  type FasceDocumento,
} from '../src/generazione/intestazione.js';
import { componiPdf } from '../src/generazione/pdf.js';
import { componiXlsx } from '../src/generazione/xlsx.js';
import { leggiConPdfjs } from '../src/worker/ingestion/testimoni.js';

/**
 * La «prova per formato» chiesta dal piano: i file generati non devono solo
 * esistere, devono **riaprirsi** — il PDF con pdf-lib e pdfjs, DOCX e XLSX
 * come gli archivi che sono — e contenere ciò che ci abbiamo messo. Dall'11
 * /09/2026 ciò che ci mettiamo comprende l'intestazione e il piè di pagina
 * dell'agenzia, e la prova è che stiano dove l'agenzia li ha messi: su ogni
 * pagina, coi numeri giusti.
 */

/** Un PNG di un pixel: basta a provare che l'immagine entra nel file. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const piccolo = [{ type: 'textStyle' as const, attrs: { fontSize: 'piccolo' as const } }];

const INTESTAZIONE: Fascia = {
  type: 'doc',
  content: [
    {
      type: 'colonne',
      content: [
        {
          type: 'colonna',
          content: [
            { type: 'immagine', attrs: { id: 'img-000000000001.png', larghezza: 30, allineamento: 'left' } },
            { type: 'paragraph', content: [{ type: 'text', text: 'Assicurazioni Meridiana S.r.l.', marks: [{ type: 'bold' }] }] },
          ],
        },
        {
          type: 'colonna',
          content: [
            {
              type: 'paragraph',
              attrs: { textAlign: 'right' },
              content: [{ type: 'text', text: 'Corso Vinzaglio 12, Torino' }],
            },
          ],
        },
      ],
    },
  ],
};

const PIEDE: Fascia = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Iscrizione RUI A000123456 · Km&Servizi', marks: piccolo }],
    },
    {
      type: 'paragraph',
      attrs: { textAlign: 'right' },
      content: [
        { type: 'text', text: 'Pagina ', marks: piccolo },
        { type: 'campo', attrs: { nome: 'pagina' }, marks: piccolo },
        { type: 'text', text: ' di ', marks: piccolo },
        { type: 'campo', attrs: { nome: 'pagine' }, marks: piccolo },
      ],
    },
  ],
};

const FASCE: FasceDocumento = {
  intestazione: INTESTAZIONE,
  piede: PIEDE,
  immagini: new Map([['img-000000000001.png', { byte: PNG, tipo: 'png', larghezzaPx: 1, altezzaPx: 1 }]]),
  campi: { titolo: 'Confronto polizze', data: '11 settembre 2026', agenzia: 'Assicurazioni Meridiana S.r.l.' },
};

const SENZA_FASCE: FasceDocumento = {
  intestazione: { type: 'doc', content: [] },
  piede: { type: 'doc', content: [] },
  immagini: new Map(),
  campi: { titolo: 'x', data: 'y', agenzia: 'z' },
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

/** Il testo visibile di una parte di un DOCX, senza tag. */
const testoParte = (byte: Buffer, parte: RegExp): string =>
  Object.keys(new PizZip(byte).files)
    .filter((n) => parte.test(n))
    .map((n) => new PizZip(byte).files[n]!.asText())
    .join('\n');

describe('analisi del testo in blocchi', () => {
  it('titoli, grassetti, elenchi e tabelle diventano blocchi distinti', () => {
    const blocchi = analizzaMarkdown(TESTO);
    expect(blocchi.map((b) => b.tipo)).toEqual(['titolo', 'paragrafo', 'voce-elenco', 'voce-elenco', 'tabella']);
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

describe('lo schema delle fasce', () => {
  it('accetta ciò che l’editor produce e scarta gli attributi che non conosce', () => {
    const esito = schemaFascia.safeParse({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'center', id: 'x' }, content: [{ type: 'text', text: 'Ciao' }] }],
    });
    expect(esito.success).toBe(true);
    expect(esito.success && esito.data.content[0]).toEqual({
      type: 'paragraph',
      attrs: { textAlign: 'center' },
      content: [{ type: 'text', text: 'Ciao' }],
    });
    expect(schemaFascia.safeParse(INTESTAZIONE).success).toBe(true);
    expect(schemaFascia.safeParse(PIEDE).success).toBe(true);
  });

  it('rifiuta ciò che i documenti non sanno riprodurre', () => {
    const conNodo = (nodo: unknown) => schemaFascia.safeParse({ type: 'doc', content: [nodo] }).success;
    expect(conNodo({ type: 'table', content: [] })).toBe(false);
    expect(conNodo({ type: 'bulletList', content: [] })).toBe(false);
    expect(conNodo({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://x' } }] }] })).toBe(false);
    expect(conNodo({ type: 'immagine', attrs: { id: '../../altro-tenant/logo.png', larghezza: 30 } })).toBe(false);
    expect(conNodo({ type: 'colonne', content: [{ type: 'colonna', content: [{ type: 'paragraph' }] }] })).toBe(false);
  });
});

describe('le immagini, dai byte', () => {
  it('PNG: tipo e dimensioni dall’IHDR', () => {
    expect(tipoImmagine(PNG)).toBe('png');
    expect(dimensioniImmagine(PNG)).toEqual({ larghezzaPx: 1, altezzaPx: 1 });
  });

  it('JPEG: dimensioni dal primo SOF, dopo i segmenti che lo precedono', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01,
    ]);
    expect(tipoImmagine(jpeg)).toBe('jpg');
    expect(dimensioniImmagine(jpeg)).toEqual({ altezzaPx: 32, larghezzaPx: 64 });
    expect(tipoImmagine(Buffer.from('GIF89a'))).toBeUndefined();
  });
});

describe('PDF (pdf-lib)', () => {
  it('l’intestazione e il piè stanno su ogni pagina, coi numeri di pagina risolti', async () => {
    const lungo = Array.from({ length: 70 }, (_, i) => `Paragrafo numero ${i}, con un po’ di testo per riempire la riga.`).join('\n\n');
    const byte = await componiPdf({ titolo: 'Confronto polizze', blocchi: analizzaMarkdown(lungo), fonti: FONTI, fasce: FASCE });
    const documento = await PDFDocument.load(byte);
    expect(documento.getTitle()).toBe('Confronto polizze');
    const pagine = documento.getPageCount();
    expect(pagine).toBeGreaterThan(1);

    const letture = await leggiConPdfjs(byte);
    letture.forEach((lettura, i) => {
      expect(lettura.testo).toContain('Assicurazioni Meridiana S.r.l.');
      expect(lettura.testo).toContain('Corso Vinzaglio 12, Torino');
      expect(lettura.testo).toContain('Iscrizione RUI A000123456');
      expect(lettura.testo).toContain(`Pagina ${i + 1} di ${pagine}`);
    });
  });

  it('senza fasce il documento si apre lo stesso, e non porta niente in testa né in calce', async () => {
    const byte = await componiPdf({ titolo: 'Nudo', blocchi: analizzaMarkdown(TESTO), fonti: [], fasce: SENZA_FASCE });
    const [pagina] = await leggiConPdfjs(byte);
    expect(pagina!.righe[0]).toBe('Nudo');
    expect(pagina!.testo).not.toContain('Pagina');
  });

  it('lo spazio dopo una parola crenata resta, nelle fasce come nel corpo', async () => {
    /* pdf-lib misura con la crenatura e disegna senza: «P.IVA 0123» usciva
       «P.IVA0123» (11/09/2026). La misura ora è carattere per carattere. */
    const conPartitaIva: Fascia = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'P.IVA 01234567890 · AVVISO' }] }],
    };
    const byte = await componiPdf({
      titolo: 'Crenatura',
      blocchi: analizzaMarkdown('Nel corpo: P.IVA 01234567890 e VAT AVAILABLE.'),
      fonti: [],
      fasce: { ...SENZA_FASCE, intestazione: conPartitaIva },
    });
    const [pagina] = await leggiConPdfjs(byte);
    expect(pagina!.testo).toContain('P.IVA 01234567890 · AVVISO');
    expect(pagina!.testo).toContain('Nel corpo: P.IVA 01234567890 e VAT AVAILABLE.');
  });

  it('un’immagine che manca non ferma il documento', async () => {
    const byte = await componiPdf({
      titolo: 'Senza logo',
      blocchi: analizzaMarkdown('Testo.'),
      fonti: [],
      fasce: { ...FASCE, immagini: new Map() },
    });
    expect((await leggiConPdfjs(byte))[0]!.testo).toContain('Assicurazioni Meridiana S.r.l.');
  });
});

describe('DOCX (docx)', () => {
  it('intestazione e piè sono Header e Footer veri, con l’immagine e i campi di pagina', async () => {
    const byte = await componiDocx({ titolo: 'Riepilogo', blocchi: analizzaMarkdown(TESTO), fonti: FONTI, fasce: FASCE });
    const corpo = testoParte(byte, /^word\/document\.xml$/).replace(/<[^>]+>/g, '');
    expect(corpo).toContain('Furto e Rapina');
    expect(corpo).toContain('Km&amp;Servizi UnipolSai');

    const testa = testoParte(byte, /^word\/header\d*\.xml$/);
    expect(testa.replace(/<[^>]+>/g, '')).toContain('Assicurazioni Meridiana S.r.l.');
    expect(testa).toContain('<w:drawing>');
    expect(Object.keys(new PizZip(byte).files).some((n) => n.startsWith('word/media/'))).toBe(true);

    const piede = testoParte(byte, /^word\/footer\d*\.xml$/);
    expect(piede.replace(/<[^>]+>/g, '')).toContain('Iscrizione RUI A000123456');
    expect(piede).toMatch(/PAGE/);
    expect(piede).toMatch(/NUMPAGES/);
  });

  it('senza fasce il documento non ha né Header né Footer', async () => {
    const byte = await componiDocx({ titolo: 'Nudo', blocchi: analizzaMarkdown(TESTO), fonti: [], fasce: SENZA_FASCE });
    const nomi = Object.keys(new PizZip(byte).files);
    expect(nomi.some((n) => /^word\/(header|footer)\d*\.xml$/.test(n))).toBe(false);
  });
});

describe('XLSX (exceljs)', () => {
  it('le righe della tabella stanno su colonne vere, e le fasce in quelle di stampa', async () => {
    const byte = await componiXlsx({ titolo: 'Report interno', blocchi: analizzaMarkdown(TESTO), fonti: FONTI, fasce: FASCE });
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
    expect(foglio.headerFooter.oddHeader).toBe('&LAssicurazioni Meridiana S.r.l.&RCorso Vinzaglio 12, Torino');
    expect(foglio.headerFooter.oddFooter).toBe('&LIscrizione RUI A000123456 · Km&&Servizi&RPagina &P di &N');
  });

  it('le fasce di Excel: le colonne vanno nelle tre sezioni, la data è un campo di Excel', () => {
    const tre: Fascia = {
      type: 'doc',
      content: [
        {
          type: 'colonne',
          content: ['A', 'B', 'C'].map((t) => ({
            type: 'colonna' as const,
            content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: t }] }],
          })),
        },
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'campo', attrs: { nome: 'data' } }] },
      ],
    };
    expect(fasciaXlsx(tre, FASCE.campi)).toBe('&LA&CB\n&D&RC');
  });
});

describe('la facciata generaDocumento', () => {
  it('sceglie il compositore dal formato e nomina il file', async () => {
    const file = await generaDocumento({
      formato: 'docx',
      nome: 'Proposta di rinnovo',
      titolo: 'Proposta di rinnovo',
      testo: 'Testo della proposta.',
      fonti: [],
      fasce: FASCE,
    });
    expect(file.contentType).toContain('wordprocessingml');
    expect(file.nomeFile).toBe('proposta-di-rinnovo.docx');
    expect(testoParte(file.byte, /^word\/document\.xml$/)).toContain('Testo della proposta.');
    expect(nomeFileGenerato('Carta intestata Méridiana', 'pdf')).toBe('carta-intestata-m-ridiana.pdf');
  });
});
