import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

import type { Blocco, Segmento } from './blocchi.js';
import { MARGINE, margineCorpo, preparaFascePdf, type FasceDocumento } from './intestazione.js';
import { larghezzaTesto } from './misura.js';

/**
 * Il compositore PDF: il layout di VELIA fra l'intestazione e il piè di
 * pagina dell'agenzia (11/09/2026, `intestazione.ts`). Le fasce si misurano
 * prima, perché il corpo sappia dove cominciare e dove finire, e si
 * disegnano per ultime, quando il totale delle pagine è noto. La testa parte
 * dal bordo alto e il piede finisce su quello basso: il corpo sta sotto la
 * prima e sopra il secondo, col respiro, e mai più vicino al bordo del
 * margine.
 *
 * I font sono gli standard (Helvetica, WinAnsi): niente da incorporare, il
 * file resta piccolo e si apre ovunque. Ciò che WinAnsi non copre diventa
 * `?` invece di corrompere il file.
 */

export interface OpzioniPdf {
  titolo: string;
  blocchi: Blocco[];
  fonti: string[];
  fasce: FasceDocumento;
}

const [LARGHEZZA, ALTEZZA] = PageSizes.A4;
const LARGHEZZA_TESTO = LARGHEZZA - MARGINE * 2;

/** L'accento del layout di VELIA: titoli, puntini, testata delle tabelle. */
const ACCENTO = '#2f4b7c';

const GRIGIO = rgb(0.45, 0.45, 0.45);
const GRIGLIA = rgb(0.78, 0.78, 0.78);

export function coloreDaEsadecimale(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x2f4b7c;
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

export async function componiPdf(opzioni: OpzioniPdf): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(opzioni.titolo);
  const normale = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const corsivo = await doc.embedFont(StandardFonts.HelveticaOblique);

  /* Ciò che il font non codifica corromperebbe il file: si sostituisce. */
  const codificabili = new Set(normale.getCharacterSet());
  const sanifica = (testo: string): string =>
    [...testo.replace(/\s+/g, ' ')].map((c) => (codificabili.has(c.codePointAt(0) ?? 0) ? c : '?')).join('');

  const colore = coloreDaEsadecimale(ACCENTO);

  const fasce = await preparaFascePdf(doc, opzioni.fasce, { larghezza: LARGHEZZA, altezza: ALTEZZA });

  /* Il corpo sta fra le fasce; una fascia vuota non si prende spazio. */
  const inizioContenuto = ALTEZZA - margineCorpo(fasce.altezzaIntestazione);
  const fineContenuto = margineCorpo(fasce.altezzaPiede);

  let pagina!: PDFPage;
  let y = 0;

  const nuovaPagina = (): void => {
    pagina = doc.addPage(PageSizes.A4);
    y = inizioContenuto;
  };

  const assicura = (spazio: number): void => {
    if (y - spazio < fineContenuto) nuovaPagina();
  };

  const fontDi = (s: Segmento): PDFFont => (s.grassetto ? grassetto : normale);

  /** Avvolge i segmenti in righe che stanno in `larghezza`, misurando parola per parola. */
  const avvolgi = (
    segmentiTesto: Segmento[],
    dimensione: number,
    larghezza: number,
  ): Array<Array<{ testo: string; font: PDFFont }>> => {
    const parole: Array<{ testo: string; font: PDFFont }> = [];
    for (const s of segmentiTesto) {
      for (const parola of sanifica(s.testo).split(' ')) {
        if (parola) parole.push({ testo: parola, font: fontDi(s) });
      }
    }
    const righe: Array<Array<{ testo: string; font: PDFFont }>> = [];
    let riga: Array<{ testo: string; font: PDFFont }> = [];
    let usato = 0;
    for (const p of parole) {
      const pezzo = (riga.length ? ' ' : '') + p.testo;
      const misura = larghezzaTesto(p.font, pezzo, dimensione);
      if (riga.length && usato + misura > larghezza) {
        righe.push(riga);
        riga = [p];
        usato = larghezzaTesto(p.font, p.testo, dimensione);
      } else {
        riga.push(p);
        usato += misura;
      }
    }
    if (riga.length) righe.push(riga);
    return righe.length ? righe : [[]];
  };

  const disegnaRiga = (
    riga: Array<{ testo: string; font: PDFFont }>,
    x: number,
    dimensione: number,
    tinta: RGB,
  ): void => {
    let cursore = x;
    for (let i = 0; i < riga.length; i++) {
      const pezzo = riga[i]!;
      const testo = (i ? ' ' : '') + pezzo.testo;
      pagina.drawText(testo, { x: cursore, y, size: dimensione, font: pezzo.font, color: tinta });
      cursore += larghezzaTesto(pezzo.font, testo, dimensione);
    }
  };

  const paragrafo = (
    segmentiTesto: Segmento[],
    dimensione: number,
    opz: { rientro?: number; puntato?: boolean; tinta?: RGB; dopo?: number } = {},
  ): void => {
    const rientro = opz.rientro ?? 0;
    const righe = avvolgi(segmentiTesto, dimensione, LARGHEZZA_TESTO - rientro);
    const interlinea = dimensione * 1.45;
    for (let i = 0; i < righe.length; i++) {
      assicura(interlinea);
      y -= interlinea;
      if (i === 0 && opz.puntato) {
        pagina.drawText('•', { x: MARGINE + rientro - 12, y, size: dimensione, font: normale, color: colore });
      }
      disegnaRiga(righe[i]!, MARGINE + rientro, dimensione, opz.tinta ?? rgb(0.13, 0.13, 0.13));
    }
    y -= opz.dopo ?? dimensione * 0.55;
  };

  const tabella = (righeTabella: string[][]): void => {
    const colonne = Math.max(...righeTabella.map((r) => r.length));
    const larghezzaCella = LARGHEZZA_TESTO / colonne;
    const dimensione = 9;
    const interlinea = dimensione * 1.4;

    righeTabella.forEach((riga, indice) => {
      const intestazione = indice === 0;
      const font = intestazione ? grassetto : normale;
      const celle = Array.from({ length: colonne }, (_, i) =>
        avvolgi([{ testo: riga[i] ?? '', grassetto: intestazione }], dimensione, larghezzaCella - 12),
      );
      const altezza = Math.max(...celle.map((c) => c.length)) * interlinea + 9;
      assicura(altezza);

      if (intestazione) {
        pagina.drawRectangle({
          x: MARGINE,
          y: y - altezza,
          width: LARGHEZZA_TESTO,
          height: altezza,
          color: colore,
          opacity: 0.1,
        });
      }
      const cima = y;
      celle.forEach((righeCella, i) => {
        let yCella = cima - 4;
        for (const rigaCella of righeCella) {
          yCella -= interlinea;
          let cursore = MARGINE + i * larghezzaCella + 6;
          for (let k = 0; k < rigaCella.length; k++) {
            const testo = (k ? ' ' : '') + rigaCella[k]!.testo;
            pagina.drawText(testo, { x: cursore, y: yCella, size: dimensione, font, color: rgb(0.13, 0.13, 0.13) });
            cursore += larghezzaTesto(rigaCella[k]!.font, testo, dimensione);
          }
        }
      });
      y -= altezza;
      pagina.drawLine({
        start: { x: MARGINE, y },
        end: { x: LARGHEZZA - MARGINE, y },
        thickness: 0.6,
        color: GRIGLIA,
      });
    });
    y -= 8;
  };

  nuovaPagina();

  // Il titolo del documento, solo in prima pagina.
  paragrafo([{ testo: opzioni.titolo, grassetto: true }], 16, { tinta: colore, dopo: 10 });

  for (const blocco of opzioni.blocchi) {
    switch (blocco.tipo) {
      case 'titolo': {
        const dimensione = [14, 12, 11][blocco.livello - 1]!;
        assicura(dimensione * 3);
        paragrafo([{ testo: blocco.testo, grassetto: true }], dimensione, { tinta: colore, dopo: 4 });
        break;
      }
      case 'paragrafo':
        paragrafo(blocco.segmenti, 10);
        break;
      case 'voce-elenco':
        paragrafo(blocco.segmenti, 10, { rientro: 14, puntato: true, dopo: 2 });
        break;
      case 'tabella':
        tabella(blocco.righe);
        break;
    }
  }

  if (opzioni.fonti.length) {
    assicura(60);
    y -= 8;
    paragrafo([{ testo: 'Fonti', grassetto: true }], 12, { tinta: colore, dopo: 4 });
    for (const fonte of opzioni.fonti) {
      const righe = avvolgi([{ testo: fonte, grassetto: false }], 9, LARGHEZZA_TESTO - 10);
      for (const riga of righe) {
        assicura(13);
        y -= 13;
        let cursore = MARGINE + 10;
        for (let k = 0; k < riga.length; k++) {
          const testo = (k ? ' ' : '') + riga[k]!.testo;
          pagina.drawText(testo, { x: cursore, y, size: 9, font: corsivo, color: GRIGIO });
          cursore += larghezzaTesto(corsivo, testo, 9);
        }
      }
      y -= 3;
    }
  }

  /* Le fasce alla fine, quando il totale delle pagine è noto. */
  const pagine = doc.getPageCount();
  doc.getPages().forEach((p, indice) => fasce.disegna(p, { pagina: indice + 1, pagine }));

  return Buffer.from(await doc.save());
}
