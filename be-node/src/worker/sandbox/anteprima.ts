import type pg from 'pg';

import { modelloPerId, percorsoAnteprimaModello } from '../../generazione/catalogo.js';
import type { Job } from '../coda.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';

/**
 * L'anteprima di un modello di riferimento (11/09/2026, fase 3 di
 * `PIANO-INTESTAZIONE-MODELLI.md`): Word, Excel e PowerPoint si convertono
 * in PDF una volta, al caricamento, con il LibreOffice del runner della
 * sandbox (o della macchina, con `LIBREOFFICE`). Un PDF non passa di qui:
 * si mostra com'è.
 *
 * Non si ritenta: una conversione che non riesce resta `errore`, e la
 * scheda del modello offre il file da scaricare. Senza sandbox configurata
 * l'anteprima resta `assente`, che per la scheda è la stessa cosa.
 */

export interface DipendenzeAnteprima {
  archivio: ArchivioFile;
  /**
   * Da Office a PDF: col LibreOffice della sandbox (`inPdfConLibreOffice`) o,
   * dal 22/09/2026, con quello della macchina (`inPdfConLibreOfficeLocale`).
   */
  inPdf?: ((contenuto: Buffer, estensione: string, jobId: string) => Promise<Buffer>) | undefined;
}

export function creaGestoreAnteprimaModello(dip: DipendenzeAnteprima) {
  return async (job: Job, { db }: { db: pg.Pool }): Promise<void> => {
    const modelloId = job.payload['modelloId'];
    if (typeof modelloId !== 'string' || !modelloId) return;
    const client = await db.connect();
    let modello;
    try {
      modello = await modelloPerId(client, modelloId);
    } finally {
      client.release();
    }
    if (!modello || modello.formato === 'pdf') return;

    const segna = (stato: 'assente' | 'pronta' | 'errore', percorso?: string) =>
      db.query(`update velia.template set anteprima = $2, path_anteprima = $3 where id = $1`, [
        modello.id,
        stato,
        percorso ?? null,
      ]);

    if (!dip.inPdf) {
      await segna('assente');
      return;
    }

    try {
      const pdf = await dip.inPdf(await dip.archivio.scarica(modello.path_file), `.${modello.formato}`, job.id);
      const percorso = percorsoAnteprimaModello(modello.tenant_id, modello.id);
      await dip.archivio.carica(percorso, pdf, 'application/pdf');
      await segna('pronta', percorso);
    } catch (errore) {
      console.warn(`[anteprima-modello] ${modello.id}:`, errore instanceof Error ? errore.message : errore);
      await segna('errore');
    }
  };
}
