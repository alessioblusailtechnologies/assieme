import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

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

const eseguiFile = promisify(execFile);

/**
 * La stessa conversione col LibreOffice della macchina del worker, senza
 * container (22/09/2026, `LIBREOFFICE`): il worker di prova che gira come
 * una sessione di Claude Code su questa macchina non ha Docker. Ogni
 * conversione ha il suo profilo, così non si blocca su un LibreOffice già
 * aperto (anche da Claude Code, che lo usa per i suoi documenti).
 */
export async function inPdfConLibreOfficeLocale(soffice: string, contenuto: Buffer, estensione: string): Promise<Buffer> {
  const est = /^\.[a-z0-9]{1,10}$/i.test(estensione) ? estensione.toLowerCase() : '.bin';
  const cartella = await mkdtemp(join(tmpdir(), 'velia-conversione-'));
  try {
    const file = join(cartella, `documento${est}`);
    await writeFile(file, contenuto);
    await eseguiFile(
      soffice,
      [
        `-env:UserInstallation=${pathToFileURL(join(cartella, 'profilo')).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        cartella,
        file,
      ],
      { timeout: TEMPO_CONVERSIONE_MS },
    );
    try {
      return await readFile(join(cartella, 'documento.pdf'));
    } catch {
      throw new Error('soffice: nessun PDF prodotto');
    }
  } finally {
    await rm(cartella, { recursive: true, force: true }).catch(() => undefined);
  }
}
