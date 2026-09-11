import { Document, Header, Packer, Paragraph } from 'docx';
import ExcelJS from 'exceljs';
import { PDFDocument, PageSizes } from 'pdf-lib';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  schemaFascia,
  type ElementoTesto,
  type Fascia,
  type Paragrafo,
} from '../src/contratto/intestazione.js';
import { analizzaMarkdown, segmenti, testoPiano } from '../src/generazione/blocchi.js';
import { cartaPerSandbox } from '../src/generazione/carta.js';
import { componiDocx } from '../src/generazione/docx.js';
import { generaDocumento, nomeFileGenerato } from '../src/generazione/generatore.js';
import {
  dimensioniImmagine,
  fasciaXlsx,
  tipoImmagine,
  type FasceDocumento,
} from '../src/generazione/intestazione.js';
import { componiPdf } from '../src/generazione/pdf.js';
import { misureFasce, timbra } from '../src/generazione/timbra.js';
import { componiXlsx } from '../src/generazione/xlsx.js';
import { leggiConPdfjs } from '../src/worker/ingestion/testimoni.js';

/**
 * La «prova per formato» chiesta dal piano: i file generati non devono solo
 * esistere, devono **riaprirsi** — il PDF con pdf-lib e pdfjs, DOCX e XLSX
 * come gli archivi che sono — e contenere ciò che ci abbiamo messo. Dall'11
 * /09/2026 ciò che ci mettiamo comprende l'intestazione e il piè di pagina
 * dell'agenzia, e la prova è che stiano dove l'agenzia li ha messi: su ogni
 * pagina, coi numeri giusti, alle coordinate della tela.
 */

/** Un PNG di un pixel: basta a provare che l'immagine entra nel file. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const MM = 72 / 25.4;
const [, ALTEZZA_A4] = PageSizes.A4;

const paragrafo = (testo: string, allineamento?: 'center' | 'right'): Paragrafo => ({
  type: 'paragraph',
  ...(allineamento && { attrs: { textAlign: allineamento } }),
  content: [{ type: 'text', text: testo }],
});

const casella = (
  id: string,
  x: number,
  y: number,
  larghezza: number,
  altezza: number,
  paragrafi: Paragrafo[],
  altro: Partial<ElementoTesto> = {},
): ElementoTesto => ({
  tipo: 'testo',
  id,
  x,
  y,
  larghezza,
  altezza,
  verticale: 'top',
  dimensione: 9,
  famiglia: 'sans',
  colore: '#262626',
  paragrafi,
  ...altro,
});

/** Il logo a sinistra, il nome accanto centrato sull'altezza del logo, l'indirizzo a destra e una linea sotto. */
const INTESTAZIONE: Fascia = {
  altezza: 32,
  elementi: [
    { tipo: 'immagine', id: 'logo', x: 20, y: 8, larghezza: 30, altezza: 15, immagine: 'img-000000000001.png' },
    casella(
      'nome',
      55,
      8,
      70,
      15,
      [{ type: 'paragraph', content: [{ type: 'text', text: 'Assicurazioni Meridiana S.r.l.', marks: [{ type: 'bold' }] }] }],
      { verticale: 'middle', dimensione: 12 },
    ),
    casella('indirizzo', 130.2, 8, 60, 10, [paragrafo('Corso Vinzaglio 12, Torino', 'right')]),
    { tipo: 'forma', id: 'linea', x: 19.8, y: 28, larghezza: 170.4, altezza: 0.3, colore: '#2f4b7c' },
  ],
};

const PIEDE: Fascia = {
  altezza: 15,
  elementi: [
    casella('rui', 19.8, 4, 100, 4, [paragrafo('Iscrizione RUI A000123456 · Km&Servizi')], { dimensione: 7.5 }),
    casella(
      'pagina',
      130.2,
      4,
      60,
      4,
      [
        {
          type: 'paragraph',
          attrs: { textAlign: 'right' },
          content: [
            { type: 'text', text: 'Pagina ' },
            { type: 'campo', attrs: { nome: 'pagina' } },
            { type: 'text', text: ' di ' },
            { type: 'campo', attrs: { nome: 'pagine' } },
          ],
        },
      ],
      { dimensione: 7.5 },
    ),
  ],
};

const FASCE: FasceDocumento = {
  intestazione: INTESTAZIONE,
  piede: PIEDE,
  immagini: new Map([['img-000000000001.png', { byte: PNG, tipo: 'png', larghezzaPx: 1, altezzaPx: 1 }]]),
  campi: { titolo: 'Confronto polizze', data: '11 settembre 2026', agenzia: 'Assicurazioni Meridiana S.r.l.' },
};

const SENZA_FASCE: FasceDocumento = {
  intestazione: { altezza: 0, elementi: [] },
  piede: { altezza: 0, elementi: [] },
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

/** Dove pdfjs vede ogni pezzo di testo di una pagina: inizio, linea di base e larghezza, in punti. */
async function posizioni(pdf: Buffer, numero = 1): Promise<Array<{ testo: string; x: number; y: number; larghezza: number }>> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
    getDocument(o: { data: Uint8Array; useSystemFonts: boolean }): {
      promise: Promise<{
        getPage(n: number): Promise<{
          getTextContent(): Promise<{ items: Array<{ str?: string; transform: number[]; width: number }> }>;
        }>;
      }>;
    };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  const contenuto = await (await doc.getPage(numero)).getTextContent();
  return contenuto.items
    .filter((i) => i.str?.trim())
    .map((i) => ({ testo: i.str!, x: i.transform[4]!, y: i.transform[5]!, larghezza: i.width }));
}

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
      altezza: 12,
      elementi: [
        {
          tipo: 'testo',
          id: 'a',
          x: 20,
          y: 2,
          larghezza: 50,
          altezza: 5,
          ruota: 45,
          paragrafi: [{ type: 'paragraph', attrs: { textAlign: 'center', id: 'x' }, content: [{ type: 'text', text: 'Ciao' }] }],
        },
      ],
    });
    expect(esito.success).toBe(true);
    /* I valori che l'editor non manda prendono quelli di sempre; l'attributo sconosciuto se ne va. */
    expect(esito.success && esito.data.elementi[0]).toEqual({
      tipo: 'testo',
      id: 'a',
      x: 20,
      y: 2,
      larghezza: 50,
      altezza: 5,
      verticale: 'top',
      dimensione: 9,
      famiglia: 'sans',
      colore: '#262626',
      paragrafi: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Ciao' }] }],
    });
    expect(schemaFascia.safeParse(INTESTAZIONE).success).toBe(true);
    expect(schemaFascia.safeParse(PIEDE).success).toBe(true);
  });

  it('rifiuta ciò che i documenti non sanno riprodurre, e gli elementi fuori dalla fascia', () => {
    const conElemento = (elemento: unknown, altezza = 30) => schemaFascia.safeParse({ altezza, elementi: [elemento] }).success;
    const base = casella('t', 20, 2, 50, 5, [paragrafo('x')]);
    expect(conElemento({ ...base, tipo: 'tabella' })).toBe(false);
    expect(
      conElemento({ ...base, paragrafi: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'https://x' } }] }] }] }),
    ).toBe(false);
    expect(conElemento({ ...base, paragrafi: [{ type: 'bulletList', content: [] }] })).toBe(false);
    expect(conElemento({ ...base, famiglia: 'Comic Sans' })).toBe(false);
    expect(conElemento({ tipo: 'immagine', id: 'i', x: 0, y: 0, larghezza: 30, altezza: 10, immagine: '../../altro-tenant/logo.png' })).toBe(false);
    /* Sotto la fascia, o oltre il bordo destro del foglio. */
    expect(conElemento({ ...base, y: 28, altezza: 5 })).toBe(false);
    expect(conElemento({ ...base, x: 180, larghezza: 40 })).toBe(false);
    expect(conElemento({ ...base, y: 25, altezza: 5 })).toBe(true);
    /* Il flusso di paragrafi di prima non è più una fascia. */
    expect(schemaFascia.safeParse({ type: 'doc', content: [] }).success).toBe(false);
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

  it('ogni elemento sta alle sue coordinate: il nome a metà dell’altezza del logo, l’indirizzo sul margine destro', async () => {
    const byte = await componiPdf({ titolo: 'Titolo del corpo', blocchi: analizzaMarkdown('Corpo.'), fonti: [], fasce: FASCE });
    const parole = await posizioni(byte);
    const trova = (inizio: string) => parole.find((p) => p.testo.startsWith(inizio))!;

    /* Il nome: a 55 mm dal bordo, e la sua riga (12 pt × 1,3) centrata nei 15 mm del logo, che cominciano a 8 mm dall'alto. */
    const nome = trova('Assicurazioni');
    expect(nome.x).toBeCloseTo(55 * MM, 0);
    const cimaRiga = ALTEZZA_A4 - 8 * MM - (15 * MM - 12 * 1.3) / 2;
    expect(nome.y).toBeCloseTo(cimaRiga - 12 * 0.997, 0);

    /* L'indirizzo, allineato a destra nella sua casella: finisce a 190,2 mm. */
    const indirizzo = trova('Corso');
    expect(indirizzo.x + indirizzo.larghezza).toBeCloseTo(190.2 * MM, 0);

    /* Il piè comincia 15 mm sopra il bordo basso, e il RUI 4 mm più giù. */
    const rui = trova('Iscrizione');
    expect(rui.x).toBeCloseTo(19.8 * MM, 0);
    expect(rui.y).toBeCloseTo(15 * MM - 4 * MM - 7.5 * 0.997, 0);

    /* Il corpo comincia dopo i 32 mm della fascia e il respiro. */
    const titolo = trova('Titolo del corpo');
    expect(titolo.y).toBeLessThan(ALTEZZA_A4 - 32 * MM - 16);
  });

  it('il testo va a capo nella larghezza della casella, e la fascia si allunga se il testo sporge sotto', async () => {
    const lungo: FasceDocumento = {
      ...SENZA_FASCE,
      intestazione: {
        altezza: 10,
        elementi: [casella('t', 20, 2, 30, 6, [paragrafo('Via del Collaudo 1, 10100 Torino, telefono 011 1234567')])],
      },
    };
    const parole = await posizioni(await componiPdf({ titolo: 'T', blocchi: [], fonti: [], fasce: lungo }));
    const righe = new Set(parole.filter((p) => p.y > ALTEZZA_A4 - 40 * MM).map((p) => Math.round(p.y)));
    expect(righe.size).toBeGreaterThanOrEqual(3);
    for (const p of parole.filter((x) => x.y > ALTEZZA_A4 - 40 * MM)) expect(p.x + p.larghezza).toBeLessThanOrEqual((20 + 30) * MM + 0.5);
    /* Tre righe da 9 pt × 1,3 non stanno nei 10 mm della fascia: il corpo va più giù. */
    const conTesto = await misureFasce(lungo);
    const soloFascia = await misureFasce({ ...lungo, intestazione: { altezza: 10, elementi: [casella('t', 20, 2, 30, 6, [paragrafo('Via')])] } });
    expect(conTesto.altoMm).toBeGreaterThanOrEqual(soloFascia.altoMm);
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
    const conPartitaIva: Fascia = { altezza: 10, elementi: [casella('p', 20, 2, 120, 5, [paragrafo('P.IVA 01234567890 · AVVISO')])] };
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

  it('le famiglie e i corpi dei segni arrivano sulla carta', async () => {
    const misto: FasceDocumento = {
      ...SENZA_FASCE,
      intestazione: {
        altezza: 12,
        elementi: [
          casella('m', 20, 2, 150, 8, [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Times ', marks: [{ type: 'textStyle', attrs: { fontFamily: 'serif', fontSize: 14 } }] },
                { type: 'text', text: 'Courier', marks: [{ type: 'textStyle', attrs: { fontFamily: 'mono' } }, { type: 'italic' }] },
              ],
            },
          ]),
        ],
      },
    };
    const byte = await componiPdf({ titolo: 'T', blocchi: [], fonti: [], fasce: misto });
    const documento = await PDFDocument.load(byte);
    const font = documento.context
      .enumerateIndirectObjects()
      .map(([, o]) => String(o))
      .filter((s) => s.includes('/BaseFont'))
      .join(' ');
    expect(font).toContain('/Times-Roman');
    expect(font).toContain('/Courier-Oblique');
    expect((await leggiConPdfjs(byte))[0]!.testo).toContain('Times Courier');
  });
});

describe('DOCX (docx)', () => {
  it('intestazione e piè sono Header e Footer veri: caselle in cornici alle loro coordinate, logo e linea ancorati', async () => {
    const byte = await componiDocx({ titolo: 'Riepilogo', blocchi: analizzaMarkdown(TESTO), fonti: FONTI, fasce: FASCE });
    const corpo = testoParte(byte, /^word\/document\.xml$/);
    expect(corpo.replace(/<[^>]+>/g, '')).toContain('Furto e Rapina');
    expect(corpo.replace(/<[^>]+>/g, '')).toContain('Km&amp;Servizi UnipolSai');
    /* Header e footer a filo del bordo: le coordinate si contano da lì. */
    expect(corpo).toMatch(/<w:pgMar [^>]*w:header="0"[^>]*w:footer="0"/);

    const testa = testoParte(byte, /^word\/header\d*\.xml$/);
    const twip = (mm: number) => Math.round(mm * MM * 20);
    /* Il paragrafo alto quanto la fascia (32 mm), a cui sono ancorati logo e linea, dietro al testo. */
    expect(testa).toContain(`w:line="${twip(32)}" w:lineRule="exact"`);
    const ancore = testa.match(/<wp:anchor\b[\s\S]*?<\/wp:anchor>/g)!;
    expect(ancore).toHaveLength(2);
    const logo = ancore.find((a) => a.includes('pic:pic'))!;
    expect(logo).toContain('<wp:positionH relativeFrom="page"><wp:posOffset>720000</wp:posOffset>');
    expect(logo).toContain('<wp:positionV relativeFrom="paragraph"><wp:posOffset>288000</wp:posOffset>');
    expect(logo).toContain('behindDoc="1"');
    expect(ancore.find((a) => a.includes('<a:srgbClr val="2F4B7C"/>'))).toBeTruthy();
    /* Word vuole unici gli id dei disegni. */
    const ids = [...testa.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(new PizZip(byte).files).some((n) => n.startsWith('word/media/'))).toBe(true);

    /* Il nome: una cornice rispetto alla pagina, a 55 mm, già scesa a metà dei 15 mm della casella (una riga da 12 pt × 1,3). */
    const paragrafi = testa.match(/<w:p>[\s\S]*?<\/w:p>/g)!;
    const nome = paragrafi.find((p) => p.includes('Assicurazioni Meridiana S.r.l.'))!;
    const cornice = /<w:framePr [^>]*\/>/.exec(nome)![0];
    expect(cornice).toContain(`w:x="${twip(55)}"`);
    expect(cornice).toContain(`w:y="${twip(8 + (15 - (12 * 1.3) / MM) / 2)}"`);
    expect(cornice).toContain(`w:w="${twip(70)}"`);
    expect(cornice).toContain('w:hAnchor="page"');
    expect(cornice).toContain('w:vAnchor="page"');
    const indirizzo = paragrafi.find((p) => p.includes('Corso Vinzaglio'))!;
    expect(indirizzo).toContain('<w:jc w:val="right"/>');

    const piede = testoParte(byte, /^word\/footer\d*\.xml$/);
    expect(piede.replace(/<[^>]+>/g, '')).toContain('Iscrizione RUI A000123456');
    expect(piede).toMatch(/PAGE/);
    expect(piede).toMatch(/NUMPAGES/);
    /* Nel piè la cornice si conta dalla cima della fascia, che finisce sul fondo dell'A4. */
    const rui = piede.match(/<w:p>[\s\S]*?<\/w:p>/g)!.find((p) => p.includes('Iscrizione RUI'))!;
    expect(rui).toContain(`w:y="${twip(297 - 15 + 4)}"`);
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
    expect(foglio.headerFooter.oddHeader).toBe('&CAssicurazioni Meridiana S.r.l.&RCorso Vinzaglio 12, Torino');
    expect(foglio.headerFooter.oddFooter).toBe('&LIscrizione RUI A000123456 · Km&&Servizi&RPagina &P di &N');
  });

  it('le fasce di Excel: ogni casella nella sezione del terzo dove cade, dall’alto in basso; la data è un campo di Excel', () => {
    const tre: Fascia = {
      altezza: 20,
      elementi: [
        casella('c', 80, 2, 50, 4, [paragrafo('B')]),
        casella('a', 20, 2, 40, 4, [paragrafo('A')]),
        casella('r', 150, 2, 40, 4, [paragrafo('C')]),
        casella('d', 80, 8, 50, 4, [{ type: 'paragraph', content: [{ type: 'campo', attrs: { nome: 'data' } }] }]),
        { tipo: 'forma', id: 'f', x: 20, y: 15, larghezza: 170, altezza: 0.3, colore: '#000000' },
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

describe('la carta dell’agenzia su un documento consegnato (timbra)', () => {
  it('PDF: le fasce si disegnano su ogni pagina del file, coi numeri di pagina giusti', async () => {
    const consegnato = await PDFDocument.create();
    for (let i = 0; i < 3; i++) {
      const pagina = consegnato.addPage(PageSizes.A4);
      pagina.drawText(`Corpo della pagina ${i + 1}`, { x: 60, y: 400, size: 12 });
    }
    const timbrato = await timbra(Buffer.from(await consegnato.save()), 'pdf', FASCE);
    const letture = await leggiConPdfjs(timbrato);
    expect(letture).toHaveLength(3);
    letture.forEach((lettura, i) => {
      expect(lettura.testo).toContain(`Corpo della pagina ${i + 1}`);
      expect(lettura.testo).toContain('Assicurazioni Meridiana S.r.l.');
      expect(lettura.testo).toContain(`Pagina ${i + 1} di 3`);
    });
  });

  it('PDF in orizzontale: ciò che sta a destra resta sul bordo destro, ciò che sta a sinistra sul sinistro', async () => {
    const consegnato = await PDFDocument.create();
    const [larghezza, altezza] = PageSizes.A4;
    consegnato.addPage([altezza, larghezza]);
    const parole = await posizioni(await timbra(Buffer.from(await consegnato.save()), 'pdf', FASCE));
    const indirizzo = parole.find((p) => p.testo.startsWith('Corso'))!;
    const rui = parole.find((p) => p.testo.startsWith('Iscrizione'))!;
    expect(indirizzo.x + indirizzo.larghezza).toBeCloseTo((297 - (210 - 190.2)) * MM, 0);
    expect(rui.x).toBeCloseTo(19.8 * MM, 0);
  });

  it('Word: header e footer dell’agenzia al posto di quelli del documento, in ogni sezione, a filo del bordo', async () => {
    const altrui = new Header({ children: [new Paragraph('Carta di un altro ente')] });
    const consegnato = await Packer.toBuffer(
      new Document({
        evenAndOddHeaderAndFooters: true,
        sections: [
          {
            properties: { titlePage: true },
            headers: { default: altrui, first: altrui, even: altrui },
            children: [new Paragraph('Prima sezione')],
          },
          { children: [new Paragraph('Seconda sezione')] },
        ],
      }),
    );
    const timbrato = await timbra(consegnato, 'docx', FASCE);
    const zip = new PizZip(timbrato);
    const documento = zip.file('word/document.xml')!.asText();

    const sezioni = documento.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!;
    expect(sezioni.length).toBe(2);
    for (const sezione of sezioni) {
      expect(sezione).toContain('<w:headerReference w:type="default" r:id="rIdVeliaIntestazione"/>');
      expect(sezione).toContain('<w:footerReference w:type="default" r:id="rIdVeliaPiede"/>');
      expect(sezione).not.toMatch(/w:type="(first|even)"/);
      expect(sezione).not.toContain('titlePg');
      /* Le distanze di header e footer a zero, gli altri margini come li ha voluti il documento. */
      const margini = /<w:pgMar\b[^>]*\/>/.exec(sezione)![0];
      expect(margini).toContain('w:header="0"');
      expect(margini).toContain('w:footer="0"');
      expect(margini).toContain('w:top="1440"');
      expect(margini.match(/w:header=/g)).toHaveLength(1);
    }
    expect(zip.file('word/settings.xml')!.asText()).not.toContain('evenAndOddHeaders');
    expect(testoParte(timbrato, /^word\/velia-intestazione\.xml$/)).toContain('Assicurazioni Meridiana S.r.l.');
    expect(testoParte(timbrato, /^word\/velia-piede\.xml$/)).toContain('NUMPAGES');
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain('Target="velia-intestazione.xml"');
    expect(zip.file('[Content_Types].xml')!.asText()).toContain('PartName="/word/velia-intestazione.xml"');
    /* Il logo viaggia con la parte, sotto un nome suo. */
    const relsIntestazione = zip.file('word/_rels/velia-intestazione.xml.rels')!.asText();
    const logo = /Target="media\/([^"]+)"/.exec(relsIntestazione)![1]!;
    expect(zip.file(`word/media/${logo}`)).toBeTruthy();
    expect(testoParte(timbrato, /^word\/document\.xml$/)).toContain('Seconda sezione');

    /* Rifarlo non accumula: le parti di VELIA si sostituiscono. */
    const due = new PizZip(await timbra(timbrato, 'docx', FASCE));
    expect(due.file('word/_rels/document.xml.rels')!.asText().match(/rIdVeliaIntestazione/g)).toHaveLength(1);
  });

  it('Excel: le fasce di stampa su ogni foglio, davanti ai disegni come vuole lo schema', async () => {
    const cartella = new ExcelJS.Workbook();
    const primo = cartella.addWorksheet('Confronto');
    primo.addRow(['Garanzia', 'Franchigia']);
    const logo = cartella.addImage({ buffer: PNG as unknown as ExcelJS.Buffer, extension: 'png' });
    primo.addImage(logo, { tl: { col: 3, row: 1 }, ext: { width: 20, height: 20 } });
    cartella.addWorksheet('Note').addRow(['niente']);
    const consegnato = Buffer.from(await cartella.xlsx.writeBuffer());

    const timbrato = await timbra(consegnato, 'xlsx', FASCE);
    const riletta = new ExcelJS.Workbook();
    await riletta.xlsx.load(timbrato as unknown as ExcelJS.Buffer);
    for (const nome of ['Confronto', 'Note']) {
      const foglio = riletta.getWorksheet(nome)!;
      expect(foglio.headerFooter.oddHeader).toBe(fasciaXlsx(INTESTAZIONE, FASCE.campi));
      expect(foglio.headerFooter.oddFooter).toBe(fasciaXlsx(PIEDE, FASCE.campi));
    }
    const xml = new PizZip(timbrato).file('xl/worksheets/sheet1.xml')!.asText();
    expect(xml.indexOf('<headerFooter>')).toBeGreaterThan(-1);
    expect(xml.indexOf('<headerFooter>')).toBeLessThan(xml.indexOf('<drawing'));
  });

  it('senza fasce il file esce com’è; i margini da lasciare liberi sono la fascia più il respiro', async () => {
    const byte = Buffer.from('%PDF-1.7 non toccato');
    expect(await timbra(byte, 'pdf', SENZA_FASCE)).toBe(byte);
    expect(await misureFasce(SENZA_FASCE)).toEqual({ altoMm: 20, bassoMm: 20 });
    /* 32 mm di intestazione e 16 pt di respiro; 15 mm di piè e il respiro. */
    expect(await misureFasce(FASCE)).toEqual({ altoMm: Math.ceil(32 + 16 / MM), bassoMm: Math.ceil(15 + 16 / MM) });
    /* Una fascia bassa non avvicina il corpo al bordo più del margine. */
    const bassa = await misureFasce({ ...SENZA_FASCE, intestazione: { altezza: 4, elementi: [casella('t', 20, 0, 50, 4, [paragrafo('x')])] } });
    expect(bassa.altoMm).toBe(20);
  });

  it('un formato che non si timbra non viene trattato da foglio Excel', async () => {
    await expect(timbra(Buffer.from('<html></html>'), 'html' as never, FASCE)).rejects.toThrow(/non riceve intestazione/);
  });
});

/*
 * La carta dell'agenzia per i formati che VELIA non timbra (pagine web,
 * immagini, PowerPoint): i loghi come sono, e i testi con dove stanno.
 */
describe('la carta per la sandbox', () => {
  it('loghi, testi e colori delle fasce, senza il numero di pagina', () => {
    const file = cartaPerSandbox(FASCE);
    expect(file.find((f) => f.path === 'carta/img-000000000001.png')?.byte).toBe(PNG);
    const md = String(file.find((f) => f.path === 'carta/carta.md')?.byte);
    expect(md).toContain('Agenzia: Assicurazioni Meridiana S.r.l.');
    expect(md).toContain('`/lavoro/carta/img-000000000001.png` (a sinistra, 30×15 mm)');
    expect(md).toContain('> Corso Vinzaglio 12, Torino');
    expect(md).toContain('> Iscrizione RUI A000123456 · Km&Servizi');
    expect(md).toContain('#2f4b7c');
    /* «Pagina N di M» non vale per una pagina web: non si riporta. */
    expect(md).not.toContain('Pagina');
    /* L'intestazione prima del piè, e nell'intestazione dall'alto e da sinistra. */
    expect(md.indexOf('Meridiana S.r.l.', md.indexOf('## Intestazione'))).toBeLessThan(md.indexOf('Corso Vinzaglio'));
    expect(md.indexOf('## Intestazione')).toBeLessThan(md.indexOf('## Piè di pagina'));
  });

  it('senza niente nelle fasce resta il nome dell’agenzia', () => {
    const file = cartaPerSandbox(SENZA_FASCE);
    expect(file).toHaveLength(1);
    expect(String(file[0]!.byte)).toContain('Agenzia: z');
  });
});
