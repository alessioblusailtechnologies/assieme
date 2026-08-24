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

/**
 * Il compositore PDF: impagina i blocchi con l'identità visiva del tenant
 * (RF-D-12) — logo e firma in testa, filo del colore primario, recapiti in
 * calce — oppure sopra la carta intestata caricata come template (RF-D-10:
 * la prima pagina del PDF del tenant fa da sfondo a ogni pagina).
 *
 * I font sono gli standard (Helvetica, WinAnsi): niente da incorporare, il
 * file resta piccolo e si apre ovunque. Ciò che WinAnsi non copre diventa
 * `?` invece di corrompere il file.
 */

export interface IdentitaPdf {
  colorePrimario: string;
  recapiti: string;
  firma: string;
}

export interface OpzioniPdf {
  titolo: string;
  blocchi: Blocco[];
  fonti: string[];
  identita: IdentitaPdf;
  /** PNG o JPEG; altri tipi si ignorano (il PDF non li incorpora). */
  logo?: { byte: Buffer; tipo: string };
  /** Template PDF del tenant: la sua prima pagina come sfondo di ogni pagina. */
  sfondo?: Buffer;
}

const [LARGHEZZA, ALTEZZA] = PageSizes.A4;
const MARGINE = 56;
const LARGHEZZA_TESTO = LARGHEZZA - MARGINE * 2;

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

  const colore = coloreDaEsadecimale(opzioni.identita.colorePrimario);

  const logo = await (async () => {
    if (!opzioni.logo) return undefined;
    try {
      return opzioni.logo.tipo === 'image/png'
        ? await doc.embedPng(opzioni.logo.byte)
        : await doc.embedJpg(opzioni.logo.byte);
    } catch {
      return undefined; // un logo illeggibile non deve far fallire il documento
    }
  })();

  const sfondo = await (async () => {
    if (!opzioni.sfondo) return undefined;
    const [pagina] = await doc.embedPdf(opzioni.sfondo, [0]);
    return pagina;
  })();

  /* Con la carta intestata i margini verticali sono suoi; senza, li disegna
     l'identità visiva (testata e piè di pagina). */
  const inizioContenuto = sfondo ? ALTEZZA - 150 : ALTEZZA - 104;
  const fineContenuto = sfondo ? 120 : 96;

  let pagina!: PDFPage;
  let y = 0;

  const nuovaPagina = (): void => {
    pagina = doc.addPage(PageSizes.A4);
    if (sfondo) {
      pagina.drawPage(sfondo, { x: 0, y: 0, width: LARGHEZZA, height: ALTEZZA });
    } else {
      let xTestata = MARGINE;
      if (logo) {
        const scala = 26 / logo.height;
        pagina.drawImage(logo, {
          x: MARGINE,
          y: ALTEZZA - 40 - 26,
          width: logo.width * scala,
          height: 26,
        });
        xTestata += logo.width * scala + 12;
      }
      const firma = sanifica(opzioni.identita.firma);
      if (firma) {
        pagina.drawText(firma, {
          x: Math.max(xTestata, LARGHEZZA - MARGINE - grassetto.widthOfTextAtSize(firma, 10)),
          y: ALTEZZA - 40 - 18,
          size: 10,
          font: grassetto,
          color: colore,
        });
      }
      pagina.drawLine({
        start: { x: MARGINE, y: ALTEZZA - 76 },
        end: { x: LARGHEZZA - MARGINE, y: ALTEZZA - 76 },
        thickness: 1.2,
        color: colore,
      });
    }
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
      const misura = p.font.widthOfTextAtSize(pezzo, dimensione);
      if (riga.length && usato + misura > larghezza) {
        righe.push(riga);
        riga = [p];
        usato = p.font.widthOfTextAtSize(p.testo, dimensione);
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
      cursore += pezzo.font.widthOfTextAtSize(testo, dimensione);
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
            cursore += rigaCella[k]!.font.widthOfTextAtSize(testo, dimensione);
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
          cursore += corsivo.widthOfTextAtSize(testo, 9);
        }
      }
      y -= 3;
    }
  }

  /* Piè di pagina alla fine, quando il totale è noto. Con la carta
     intestata i recapiti sono suoi: resta solo il numero di pagina. */
  const totale = doc.getPageCount();
  doc.getPages().forEach((p, indice) => {
    if (!sfondo) {
      p.drawLine({
        start: { x: MARGINE, y: 84 },
        end: { x: LARGHEZZA - MARGINE, y: 84 },
        thickness: 0.75,
        color: GRIGLIA,
      });
      const recapiti = sanifica(opzioni.identita.recapiti);
      if (recapiti) {
        let riga = recapiti;
        while (riga && normale.widthOfTextAtSize(riga, 8) > LARGHEZZA_TESTO - 70) {
          riga = riga.slice(0, -1);
        }
        p.drawText(riga, { x: MARGINE, y: 70, size: 8, font: normale, color: GRIGIO });
      }
    }
    const numero = `${indice + 1} di ${totale}`;
    p.drawText(numero, {
      x: LARGHEZZA - MARGINE - normale.widthOfTextAtSize(numero, 8),
      y: sfondo ? 100 : 70,
      size: 8,
      font: normale,
      color: GRIGIO,
    });
  });

  return Buffer.from(await doc.save());
}
