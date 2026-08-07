import type pg from 'pg';

import type { Job } from '../coda.js';
import { emettiEvento } from '../eventi.js';
import type { ArchivioFile } from './archivio-file.js';
import { headerDocumento } from './convenzioni.js';
import type { Convertitore } from './convertitore.js';
import { blocchi, contaPagine, estraiPagine } from './pdf.js';

/**
 * Quante pagine per chiamata di conversione. Il limite duro dell'API è 100
 * (Haiku, contesto 200K); 20 tiene l'output di ogni blocco largamente
 * dentro max_tokens e rende il progresso visibile all'utente. Da tarare
 * coi primi documenti veri contro il campione dell'esperimento.
 */
const PAGINE_PER_BLOCCO = 20;

export interface DipendenzeIngestion {
  convertitore: Convertitore;
  archivio: ArchivioFile;
  pagineNelBlocco?: number;
}

interface RigaDaConvertire {
  id: string;
  titolo: string;
  tipologia: string;
  prodotto: string | null;
  path_pdf: string | null;
  path_md: string | null;
  edizione_valida_dal: string | null;
  compagnia_nome: string | null;
}

/**
 * Il job di ingestion — il passo 2 della pipeline (VELIA-piano-sviluppo-be.md
 * §4.2): PDF → Markdown con ancore di pagina, l'unica chiamata API che
 * contiene i byte di un documento. Il resto della pipeline (classificazione,
 * INDICE, collocazione fine) arriva nei pezzi successivi.
 *
 * Idempotente per costruzione: ogni passo riscrive, non appende. Un doppio
 * arrivo del messaggio riconverte e sovrascrive lo stesso .md.
 */
export function creaGestoreIngestion(dipendenze: DipendenzeIngestion) {
  const pagineNelBlocco = dipendenze.pagineNelBlocco ?? PAGINE_PER_BLOCCO;

  return async function gestisciIngestion(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const documentoId = job.payload['documentoId'];
    if (typeof documentoId !== 'string' || !documentoId) {
      throw new Error('payload senza documentoId');
    }

    const righe = await db.query<RigaDaConvertire>(
      `select d.id, d.titolo, d.tipologia, d.prodotto, d.path_pdf, d.path_md,
              d.edizione_valida_dal, c.nome as compagnia_nome
       from velia.documenti d
       left join velia.compagnie c on c.id = d.compagnia_id
       where d.id = $1`,
      [documentoId],
    );
    const documento = righe.rows[0];
    if (!documento) throw new Error(`documento ${documentoId} inesistente`);
    if (!documento.path_pdf) throw new Error(`documento ${documentoId} senza PDF in archivio`);

    await db.query(
      `update velia.documenti set stato = 'in-elaborazione', errore_elaborazione = null where id = $1`,
      [documentoId],
    );
    await emettiEvento(db, job.id, 'ingestion-inizio', { documentoId });

    try {
      const pdf = await dipendenze.archivio.scarica(documento.path_pdf);
      const totale = await contaPagine(pdf);
      const spezzoni = blocchi(totale, pagineNelBlocco);

      const parti: string[] = [];
      for (const [indice, [da, a]] of spezzoni.entries()) {
        const pdfBlocco = await estraiPagine(pdf, da, a);
        parti.push(
          await dipendenze.convertitore.convertiBlocco(pdfBlocco, {
            paginaIniziale: da,
            pagineTotali: totale,
          }),
        );
        await emettiEvento(db, job.id, 'ingestion-avanzamento', {
          documentoId,
          blocco: indice + 1,
          di: spezzoni.length,
        });
      }

      const dataIt = documento.edizione_valida_dal
        ? documento.edizione_valida_dal.split('-').reverse().join('/')
        : 'n.d.';
      const nomePdf = documento.path_pdf.split('/').pop() ?? documento.path_pdf;
      const markdown =
        headerDocumento({
          titolo: documento.titolo,
          compagnia: documento.compagnia_nome ?? 'n.d.',
          prodotto: documento.prodotto ?? 'n.d.',
          tipologia: documento.tipologia,
          edizione: dataIt,
          daPagina: 1,
          aPagina: totale,
          pagineTotali: totale,
          filePdf: nomePdf,
        }) +
        '\n' +
        parti.join('\n\n');

      const pathMd = documento.path_md ?? documento.path_pdf.replace(/\.pdf$/i, '.md');
      await dipendenze.archivio.carica(pathMd, Buffer.from(markdown, 'utf8'), 'text/markdown');

      await db.query(
        `update velia.documenti
         set stato = 'pronto', numero_pagine = $2, path_md = $3, errore_elaborazione = null
         where id = $1`,
        [documentoId, totale, pathMd],
      );
      await emettiEvento(db, job.id, 'ingestion-fine', { documentoId, pagine: totale, pathMd });
    } catch (errore) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      /* RF-B-05/B-06: l'errore è uno stato visibile col suo motivo, non un
         log. Poi si rilancia: il retry del worker resta padrone del gioco. */
      await db.query(
        `update velia.documenti set stato = 'errore', errore_elaborazione = $2 where id = $1`,
        [documentoId, messaggio],
      );
      throw errore;
    }
  };
}
