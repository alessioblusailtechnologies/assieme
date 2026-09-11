import { Sandbox, type AvviatoreSandbox } from './sandbox.js';

/**
 * Da un file Office (o quasi) a PDF, col LibreOffice della sandbox (11/09/2026,
 * fase 3 di `PIANO-LINK-E-FORMATI.md`): PowerPoint, i Word ed Excel di prima
 * del 2007, OpenOffice, RTF, Pages, Numbers, Keynote, Visio, SVG.
 *
 * Nella sandbox e non nel worker, per la stessa ragione della generazione:
 * è un file di altri aperto da un programma grande, e il worker tiene le
 * chiavi di tutti i tenant. La macro di un .docm o di un .xls non gira:
 * LibreOffice senza interfaccia converte e basta.
 */

/** LibreOffice su un file grosso, a freddo, può metterci: il tetto è largo. */
const TEMPO_CONVERSIONE_MS = 180_000;

export async function inPdfConLibreOffice(
  avviatore: AvviatoreSandbox,
  jobId: string,
  contenuto: Buffer,
  estensione: string,
): Promise<Buffer> {
  const est = /^\.[a-z0-9]{1,10}$/i.test(estensione) ? estensione.toLowerCase() : '.bin';
  const sandbox = new Sandbox(await avviatore.avvia(jobId));
  try {
    await sandbox.scrivi(`conversione/documento${est}`, contenuto);
    const esito = await sandbox.esegui(
      `soffice --headless --convert-to pdf --outdir /lavoro/conversione /lavoro/conversione/documento${est}`,
      { timeoutMs: TEMPO_CONVERSIONE_MS },
    );
    if (esito.codice !== 0 || esito.scaduto) {
      throw new Error(`soffice: ${esito.scaduto ? 'tempo scaduto' : esito.stderr.slice(0, 300) || `uscita ${esito.codice}`}`);
    }
    return await sandbox.leggi('conversione/documento.pdf');
  } finally {
    await sandbox.chiudi().catch(() => undefined);
  }
}
