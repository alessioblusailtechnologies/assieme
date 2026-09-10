import type { FormatoDocumento } from '../../contratto/documenti-privati.js';
import { headerDocumento } from './convenzioni.js';
import { eTestuale, markdownDaOriginale } from './estrattori.js';
import { ErroreIngestion, MESSAGGIO_SENZA_TESTO } from './gestore.js';
import { impagina, pdfDaImmagine } from './impagina.js';
import { contaPagine } from './pdf.js';

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
 * - **Word, Excel, testo, CSV, Markdown**: Read non legge un .docx, quindi
 *   se ne estrae il testo come ha sempre fatto l'ingestion (è un'estrazione
 *   meccanica, non una trascrizione) e lo si impagina.
 */
export interface AllegatoVeloce {
  numeroPagine: number;
  /** Il PDF da mostrare, quando il file caricato non lo è già. */
  pdf?: Buffer;
  /** Il Markdown con le ancore di pagina, per i formati che Read non sa aprire. */
  markdown?: string;
}

export async function preparaAllegatoVeloce(file: {
  formato: FormatoDocumento;
  byte: Buffer;
  titolo: string;
  nomeFile: string;
}): Promise<AllegatoVeloce> {
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
    return { numeroPagine: 1, pdf: await pdfDaImmagine(file.byte) };
  }

  if (eTestuale(file.formato)) {
    const testo = await markdownDaOriginale(file.formato, file.byte);
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

  throw new ErroreIngestion(`formato non gestito: ${file.formato}`, 'Questo formato non si può allegare alla chat.');
}
