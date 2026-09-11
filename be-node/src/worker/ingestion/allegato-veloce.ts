import type { FormatoDocumento } from '../../contratto/documenti-privati.js';
import { headerDocumento } from './convenzioni.js';
import { leggiEmail } from './email.js';
import { eTestuale, markdownDaOriginale, schedaFile } from './estrattori.js';
import { ErroreIngestion, MESSAGGIO_SENZA_TESTO } from './gestore.js';
import { inPng } from './immagini.js';
import { impagina, pdfDaImmagine } from './impagina.js';
import { contaPagine } from './pdf.js';
import { allegatiDaEmail, ePngOJpeg, preparaFile } from './riconoscimento.js';
import { leggiConPdfjs } from './testimoni.js';

/**
 * L'allegato «Solo per questa chat» (11/09/2026): pronto nell'istante in
 * cui arriva.
 *
 * Prima passava dalla coda del worker, che lavora un job alla volta, e da
 * una trascrizione del modello pagina per pagina: chi lo allegava per fare
 * una domanda al volo restava a guardare «in lavorazione» per decine di
 * secondi, a volte minuti. Ora non si trascrive niente. Il file va nella
 * cartella degli allegati della conversazione così com'è, e il motore lo
 * apre con Read quando parte la domanda: un PDF e un'immagine il modello li
 * legge da sé.
 *
 * Qui si fa solo ciò che serve e non chiama nessun modello:
 * - **PDF**: si contano le pagine, che sono il limite delle citazioni;
 * - **immagine**: se ne fa un PDF di una pagina, perché il visualizzatore
 *   delle citazioni apre PDF;
 * - **Word, Excel, testo, CSV, Markdown, pagine web, email**: Read non legge
 *   un .docx, quindi se ne estrae il testo come ha sempre fatto l'ingestion
 *   (è un'estrazione meccanica, non una trascrizione) e lo si impagina. Di
 *   un'email si porta dentro anche il testo degli allegati che lo hanno;
 * - **un file che non si legge**: la sua scheda (fase 3 di
 *   `PIANO-LINK-E-FORMATI.md`).
 *
 * Office, audio, video e i firmati invece si leggono solo convertendoli,
 * trascrivendoli o sbustandoli: per quelli torna `undefined`, e l'allegato
 * passa dal worker come prima dell'11/09, qualche secondo o qualche minuto.
 */
export interface AllegatoVeloce {
  numeroPagine: number;
  /** Il PDF da mostrare, quando il file caricato non lo è già. */
  pdf?: Buffer;
  /** Il Markdown con le ancore di pagina, per i formati che Read non sa aprire. */
  markdown?: string;
}

/** Il testo degli allegati di un'email, oltre questo, si taglia: la mail resta leggibile. */
const CARATTERI_ALLEGATI = 200_000;

export async function preparaAllegatoVeloce(file: {
  formato: FormatoDocumento;
  byte: Buffer;
  titolo: string;
  nomeFile: string;
}): Promise<AllegatoVeloce | undefined> {
  if (file.formato === 'pdf') {
    try {
      return { numeroPagine: await contaPagine(file.byte) };
    } catch (errore) {
      throw new ErroreIngestion(
        `PDF non leggibile: ${errore instanceof Error ? errore.message : String(errore)}`,
        'Il file non è un PDF leggibile: potrebbe essere danneggiato o protetto. Caricane una copia apribile.',
      );
    }
  }

  if (file.formato === 'immagine') {
    const immagine = ePngOJpeg(file.byte) ? file.byte : await inPng(file.byte);
    return { numeroPagine: 1, pdf: await pdfDaImmagine(immagine) };
  }

  if (eTestuale(file.formato) || file.formato === 'altro') {
    const testo =
      file.formato === 'altro'
        ? schedaFile(file.nomeFile, file.byte.length)
        : file.formato === 'email'
          ? await testoEmailConAllegati(file.byte)
          : await markdownDaOriginale(file.formato, file.byte);
    if (!/\S/.test(testo)) throw new ErroreIngestion('estrazione senza testo', MESSAGGIO_SENZA_TESTO);
    const impaginato = await impagina(file.titolo, testo);
    const totale = impaginato.pagine.length;
    const corpo = impaginato.pagine.map((p, i) => `[pag. ${i + 1}]\n\n${p}`.trimEnd()).join('\n\n');
    const markdown =
      headerDocumento({
        titolo: file.titolo,
        compagnia: 'n.d.',
        prodotto: 'n.d.',
        tipologia: 'altro',
        edizione: 'n.d.',
        daPagina: 1,
        aPagina: totale,
        pagineTotali: totale,
        filePdf: file.nomeFile,
      }) +
      '\n' +
      corpo;
    return { numeroPagine: totale, pdf: impaginato.pdf, markdown };
  }

  /* Office, audio, video, firmati: li apre il worker. */
  return undefined;
}

/**
 * L'email e, sotto, il testo dei suoi allegati: quelli che sono testo (Word,
 * Excel, un'altra email) e i PDF col loro strato di testo. Una scansione o
 * un'immagine restano solo nell'elenco degli allegati: per leggerle si
 * caricano da sole.
 */
async function testoEmailConAllegati(byte: Buffer): Promise<string> {
  const email = await leggiEmail(byte);
  const sezioni: string[] = [];
  let spazio = CARATTERI_ALLEGATI;
  for (const allegato of await allegatiDaEmail(byte)) {
    if (spazio <= 0) break;
    const { file, formato } = await preparaFile(allegato);
    let testo = '';
    try {
      if (formato === 'pdf') {
        testo = (await leggiConPdfjs(file.contenuto)).map((p, i) => `(pagina ${i + 1})\n${p.testo}`).join('\n\n');
      } else if (formato === 'email') {
        testo = (await leggiEmail(file.contenuto)).markdown;
      } else if (eTestuale(formato)) {
        testo = await markdownDaOriginale(formato, file.contenuto);
      }
    } catch {
      testo = '';
    }
    if (!/\S/.test(testo.replace(/\(pagina \d+\)/g, ''))) continue;
    const pezzo = testo.slice(0, spazio);
    spazio -= pezzo.length;
    sezioni.push(`## Allegato: ${file.nome}\n\n${pezzo}${pezzo.length < testo.length ? '\n\n_(Testo dell’allegato tagliato.)_' : ''}`);
  }
  return [email.markdown, ...sezioni].join('\n\n');
}
