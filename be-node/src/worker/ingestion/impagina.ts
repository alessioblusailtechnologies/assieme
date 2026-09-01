import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { analizzaMarkdown, segmenti, type Blocco, type Segmento } from '../../generazione/blocchi.js';

/**
 * Da Markdown a PDF impaginato, con la mappa di cosa è finito su ogni
 * pagina (01/09/2026).
 *
 * Serve ai documenti che non arrivano già in PDF — Word, Excel, testo,
 * Markdown, CSV. Il prodotto poggia sul PDF in due punti: il visualizzatore
 * apre quello, e le citazioni dicono «pag. N». Impaginare qui vuol dire che
 * un .docx si apre e si cita esattamente come una polizza scansionata, e
 * che nessuno dei due percorsi ha bisogno di un'interfaccia sua.
 *
 * La mappa è il punto delicato: `pagine[i]` è il Markdown di ciò che sta
 * sulla pagina i+1, e da lì nascono le ancore `[pag. N]` del file che il
 * motore legge. Un blocco si conta sulla pagina dove **comincia**: un
 * paragrafo lungo che scavalla resta attribuito alla prima, che è anche
 * dove un lettore lo cercherebbe.
 *
 * Il font è quello standard (Helvetica, WinAnsi): niente da incorporare, e
 * ciò che la codifica non copre diventa `?` **solo sulla pagina disegnata**
 * — il Markdown conserva il testo vero, ed è quello che viene citato.
 */

export interface DocumentoImpaginato {
  pdf: Buffer;
  /** Il Markdown di ogni pagina, nell'ordine: la fonte delle ancore. */
  pagine: string[];
}

const [LARGHEZZA, ALTEZZA] = PageSizes.A4;
const MARGINE = 56;
const LARGHEZZA_TESTO = LARGHEZZA - MARGINE * 2;
const CIMA = ALTEZZA - 64;
const FONDO = 64;
const INCHIOSTRO = rgb(0.13, 0.13, 0.13);
const GRIGIO = rgb(0.45, 0.45, 0.45);
const GRIGLIA = rgb(0.78, 0.78, 0.78);

/**
 * Oltre questo non si impagina: un file di testo da venti megabyte
 * diventerebbe un PDF da migliaia di pagine, e nessuno lo leggerebbe. Si
 * tronca e lo si dichiara, invece di far cadere l'ingestion.
 */
export const PAGINE_MASSIME = 500;

export async function impagina(titolo: string, markdown: string): Promise<DocumentoImpaginato> {
  const doc = await PDFDocument.create();
  doc.setTitle(titolo);
  const normale = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const codificabili = new Set(normale.getCharacterSet());
  const sanifica = (testo: string): string =>
    [...testo.replace(/\s+/g, ' ')]
      .map((c) => (codificabili.has(c.codePointAt(0) ?? 0) ? c : '?'))
      .join('');

  const pagine: string[] = [];
  let pagina!: PDFPage;
  let y = 0;
  let troncato = false;

  const nuovaPagina = (): boolean => {
    if (pagine.length >= PAGINE_MASSIME) {
      troncato = true;
      return false;
    }
    pagina = doc.addPage(PageSizes.A4);
    y = CIMA;
    pagine.push('');
    return true;
  };

  /** Spazio per `altezza`: se non c'è, si volta pagina. */
  const assicura = (altezza: number): boolean => (y - altezza >= FONDO ? true : nuovaPagina());

  const fontDi = (s: Segmento): PDFFont => (s.grassetto ? grassetto : normale);

  const avvolgi = (
    parti: Segmento[],
    dimensione: number,
    larghezza: number,
  ): Array<Array<{ testo: string; font: PDFFont }>> => {
    const parole: Array<{ testo: string; font: PDFFont }> = [];
    for (const s of parti) {
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
  ): void => {
    let cursore = x;
    for (let i = 0; i < riga.length; i++) {
      const pezzo = riga[i]!;
      const testo = (i ? ' ' : '') + pezzo.testo;
      pagina.drawText(testo, { x: cursore, y, size: dimensione, font: pezzo.font, color: INCHIOSTRO });
      cursore += pezzo.font.widthOfTextAtSize(testo, dimensione);
    }
  };

  const paragrafo = (
    parti: Segmento[],
    dimensione: number,
    opzioni: { rientro?: number; puntato?: boolean; dopo?: number } = {},
  ): boolean => {
    const rientro = opzioni.rientro ?? 0;
    const righe = avvolgi(parti, dimensione, LARGHEZZA_TESTO - rientro);
    const interlinea = dimensione * 1.45;
    for (let i = 0; i < righe.length; i++) {
      if (!assicura(interlinea)) return false;
      y -= interlinea;
      if (i === 0 && opzioni.puntato) {
        pagina.drawText('-', { x: MARGINE + rientro - 12, y, size: dimensione, font: normale, color: GRIGIO });
      }
      disegnaRiga(righe[i]!, MARGINE + rientro, dimensione);
    }
    y -= opzioni.dopo ?? dimensione * 0.55;
    return true;
  };

  const tabella = (righe: string[][]): boolean => {
    const colonne = Math.max(...righe.map((r) => r.length));
    const larghezzaCella = LARGHEZZA_TESTO / colonne;
    const dimensione = 9;
    const interlinea = dimensione * 1.4;
    for (const [indice, riga] of righe.entries()) {
      const intestazione = indice === 0;
      const font = intestazione ? grassetto : normale;
      const celle = Array.from({ length: colonne }, (_, i) =>
        avvolgi([{ testo: riga[i] ?? '', grassetto: intestazione }], dimensione, larghezzaCella - 12),
      );
      const altezza = Math.max(...celle.map((c) => c.length)) * interlinea + 8;
      if (!assicura(altezza)) return false;
      const cima = y;
      celle.forEach((righeCella, i) => {
        let yCella = cima - 4;
        for (const rigaCella of righeCella) {
          yCella -= interlinea;
          let cursore = MARGINE + i * larghezzaCella + 6;
          for (let k = 0; k < rigaCella.length; k++) {
            const testo = (k ? ' ' : '') + rigaCella[k]!.testo;
            pagina.drawText(testo, { x: cursore, y: yCella, size: dimensione, font, color: INCHIOSTRO });
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
    }
    y -= 8;
    return true;
  };

  nuovaPagina();
  const titoloPulito = titolo.trim();
  if (titoloPulito) {
    paragrafo([{ testo: titoloPulito, grassetto: true }], 15, { dopo: 12 });
    pagine[0] = `# ${titoloPulito}`;
  }

  let ultimaVoce = false;
  for (const blocco of analizzaMarkdown(markdown)) {
    const dove = pagine.length - 1;
    const sorgente = sorgenteDi(blocco);
    let riuscito: boolean;
    switch (blocco.tipo) {
      case 'titolo': {
        const dimensione = [13, 11.5, 10.5][blocco.livello - 1] ?? 10.5;
        riuscito = assicura(dimensione * 3) && paragrafo(segmenti(blocco.testo), dimensione, { dopo: 4 });
        break;
      }
      case 'voce-elenco':
        riuscito = paragrafo(blocco.segmenti, 10, { rientro: 14, puntato: true, dopo: 2 });
        break;
      case 'tabella':
        riuscito = tabella(blocco.righe);
        break;
      default:
        riuscito = paragrafo(blocco.segmenti, 10);
    }
    if (!riuscito) break;
    /* Le voci di un elenco stanno attaccate anche nella sorgente, o in
       Markdown diventerebbero paragrafi sciolti. */
    const attacca = ultimaVoce && blocco.tipo === 'voce-elenco' && pagine[dove] !== undefined && pagine[dove] !== '';
    pagine[dove] = pagine[dove] ? `${pagine[dove]}${attacca ? '\n' : '\n\n'}${sorgente}` : sorgente;
    ultimaVoce = blocco.tipo === 'voce-elenco';
  }

  if (troncato) {
    const avviso = `_Documento troncato alle prime ${PAGINE_MASSIME} pagine._`;
    const ultima = pagine.length - 1;
    pagine[ultima] = pagine[ultima] ? `${pagine[ultima]}\n\n${avviso}` : avviso;
  }

  /* Il numero di pagina in calce: è il riferimento che le citazioni usano,
     e chi apre il PDF deve poterlo ritrovare a occhio. */
  const totale = doc.getPageCount();
  doc.getPages().forEach((p, indice) => {
    p.drawText(`${indice + 1} / ${totale}`, {
      x: LARGHEZZA - MARGINE - normale.widthOfTextAtSize(`${indice + 1} / ${totale}`, 8),
      y: 40,
      size: 8,
      font: normale,
      color: GRIGIO,
    });
  });

  return { pdf: Buffer.from(await doc.save()), pagine };
}

/**
 * Un'immagine diventa un PDF di una pagina.
 *
 * Una foto di una polizza o lo screenshot di un preventivo entrano così
 * nella stessa strada dei PDF: il modello li guarda come guarda una pagina
 * scansionata, e il visualizzatore non deve imparare un formato nuovo.
 * L'immagine si scala per stare nella pagina, senza deformarla.
 */
export async function pdfDaImmagine(immagine: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const png = immagine.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const incorporata = png ? await doc.embedPng(immagine) : await doc.embedJpg(immagine);
  const pagina = doc.addPage(PageSizes.A4);
  const disponibile = { larghezza: LARGHEZZA - MARGINE, altezza: ALTEZZA - MARGINE };
  const scala = Math.min(
    disponibile.larghezza / incorporata.width,
    disponibile.altezza / incorporata.height,
    1,
  );
  const larghezza = incorporata.width * scala;
  const altezza = incorporata.height * scala;
  pagina.drawImage(incorporata, {
    x: (LARGHEZZA - larghezza) / 2,
    y: (ALTEZZA - altezza) / 2,
    width: larghezza,
    height: altezza,
  });
  return Buffer.from(await doc.save());
}

/** Il Markdown di un blocco, per ricostruire la sorgente pagina per pagina. */
function sorgenteDi(blocco: Blocco): string {
  switch (blocco.tipo) {
    case 'titolo':
      return `${'#'.repeat(blocco.livello)} ${blocco.testo}`;
    case 'voce-elenco':
      return `- ${testoDi(blocco.segmenti)}`;
    case 'tabella': {
      const colonne = Math.max(...blocco.righe.map((r) => r.length));
      const riga = (celle: string[]) =>
        `| ${Array.from({ length: colonne }, (_, i) => celle[i] ?? '').join(' | ')} |`;
      return [
        riga(blocco.righe[0] ?? []),
        `| ${Array.from({ length: colonne }, () => '---').join(' | ')} |`,
        ...blocco.righe.slice(1).map(riga),
      ].join('\n');
    }
    default:
      return testoDi(blocco.segmenti);
  }
}

/** I segmenti tornano testo, col grassetto che avevano. */
const testoDi = (parti: Segmento[]): string =>
  parti.map((s) => (s.grassetto ? `**${s.testo}**` : s.testo)).join('');
