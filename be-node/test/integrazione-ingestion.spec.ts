import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configurazione, type Configurazione } from '../src/config.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import type { Convertitore } from '../src/worker/ingestion/convertitore.js';
import { creaGestoreIngestion } from '../src/worker/ingestion/gestore.js';
import type { Job } from '../src/worker/coda.js';

/**
 * La pipeline di ingestion, provata per intero SENZA chiamate AI e senza
 * Storage: convertitore e archivio sono finti, il database è vero — le
 * transizioni di stato, gli eventi e l'assemblaggio del Markdown sono
 * esattamente quelli di produzione.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const dbPronto = Boolean(config?.DATABASE_URL && !config.DATABASE_URL.includes('PASSWORD_MANCANTE'));

const DOC_ID = 'doc-test-ingestion';

/** Un PDF vero di 3 pagine, generato in memoria. */
async function pdfDiProva(): Promise<Buffer> {
  const documento = await PDFDocument.create();
  for (let i = 0; i < 3; i++) documento.addPage([300, 400]);
  return Buffer.from(await documento.save());
}

class ArchivioFinto implements ArchivioFile {
  readonly caricati = new Map<string, string>();
  constructor(private readonly pdf: Buffer) {}
  scarica(): Promise<Buffer> {
    return Promise.resolve(this.pdf);
  }
  carica(percorso: string, contenuto: Buffer): Promise<void> {
    this.caricati.set(percorso, contenuto.toString('utf8'));
    return Promise.resolve();
  }
  elimina(percorsi: string[]): Promise<void> {
    for (const p of percorsi) this.caricati.delete(p);
    return Promise.resolve();
  }
}

class ConvertitoreFinto implements Convertitore {
  readonly chiamate: Array<{ paginaIniziale: number; pagineTotali: number }> = [];
  constructor(private readonly pagineDelBlocco = 2) {}
  convertiBlocco(
    _pdf: Buffer,
    opzioni: { paginaIniziale: number; pagineTotali: number },
  ): Promise<string> {
    this.chiamate.push(opzioni);
    /* Un'ancora per pagina del blocco, come pretende il prompt: la lettura
       visiva spacchetta il Markdown su quelle, e una pagina che non compare
       la rilancia da sola. */
    const quante = Math.min(this.pagineDelBlocco, opzioni.pagineTotali - opzioni.paginaIniziale + 1);
    return Promise.resolve(
      Array.from(
        { length: quante },
        (_, i) => `[pag. ${opzioni.paginaIniziale + i}]\n\nContenuto convertito.`,
      ).join('\n\n'),
    );
  }
}

describe.skipIf(!dbPronto)('pipeline di ingestion (convertitore finto)', () => {
  const pool = () => poolDb();

  async function creaJob(): Promise<Job> {
    const inserito = await pool().query<{ id: string }>(
      `insert into velia.jobs (tipo, payload) values ('ingestion', $1) returning id`,
      [{ documentoId: DOC_ID }],
    );
    return {
      id: inserito.rows[0]!.id,
      tenant_id: null,
      tipo: 'ingestion',
      payload: { documentoId: DOC_ID },
      stato: 'in-esecuzione',
      tentativi: 1,
      errore: null,
    };
  }

  beforeAll(async () => {
    await pool().query(
      `insert into velia.documenti
         (id, archivio, titolo, tipologia, compagnia_id, ramo_id, prodotto,
          edizione_id, edizione_etichetta, edizione_valida_dal, edizione_corrente,
          path_pdf, stato)
       values ($1, 'pubblico', 'Nota di prova ingestion', 'nota-tecnica', 'cmp-unipolsai',
               'ram-auto', 'Prova', 'edz-prova', 'ed. 01/2026', '2026-01-01', true,
               'prove/ingestion/originale.pdf', 'in-coda')
       on conflict (id) do update set stato = 'in-coda', path_md = null, errore_elaborazione = null`,
      [DOC_ID],
    );
  });

  afterAll(async () => {
    await pool().query(`delete from velia.jobs where tipo = 'ingestion'`);
    await pool().query(`delete from velia.documenti where id = $1`, [DOC_ID]);
    await chiudiPool();
  });

  it('converte a blocchi, assembla il Markdown con header e porta il documento a pronto', async () => {
    const archivio = new ArchivioFinto(await pdfDiProva());
    const convertitore = new ConvertitoreFinto();
    const gestore = creaGestoreIngestion({ convertitore, archivio, pagineNelBlocco: 2 });

    const job = await creaJob();
    await gestore(job, { db: pool() });

    // 3 pagine in blocchi da 2 → due chiamate, con l'offset assoluto giusto.
    expect(convertitore.chiamate).toEqual([
      { paginaIniziale: 1, pagineTotali: 3 },
      { paginaIniziale: 3, pagineTotali: 3 },
    ]);

    // Il Markdown è uno, con l'header che il back-office sa leggere.
    const pathMd = 'prove/ingestion/originale.md';
    const markdown = archivio.caricati.get(pathMd);
    expect(markdown).toBeTruthy();
    expect(markdown).toContain('# Nota di prova ingestion');
    expect(markdown).toContain('**Pagine nel PDF**: 1–3 di 3');
    expect(markdown).toContain('**Edizione**: 01/01/2026');
    expect(markdown).toContain('[pag. 1]');
    expect(markdown).toContain('[pag. 3]');

    // Il documento è pronto, coi metadati aggiornati.
    const riga = await pool().query<{ stato: string; numero_pagine: number; path_md: string }>(
      `select stato, numero_pagine, path_md from velia.documenti where id = $1`,
      [DOC_ID],
    );
    expect(riga.rows[0]).toEqual({ stato: 'pronto', numero_pagine: 3, path_md: pathMd });

    // Gli eventi raccontano il percorso.
    const eventi = await pool().query<{ tipo: string }>(
      `select tipo from velia.eventi_job where job_id = $1 order by id`,
      [job.id],
    );
    expect(eventi.rows.map((e) => e.tipo)).toEqual([
      'ingestion-inizio',
      'ingestion-avanzamento',
      'ingestion-avanzamento',
      'ingestion-fine',
    ]);
  });

  it('un errore di conversione lascia il documento in errore, con un motivo che parla all’utente', async () => {
    const archivio = new ArchivioFinto(await pdfDiProva());
    const convertitoreRotto: Convertitore = {
      convertiBlocco: () => Promise.reject(new Error('modello non raggiungibile')),
    };
    const gestore = creaGestoreIngestion({
      convertitore: convertitoreRotto,
      archivio,
      pagineNelBlocco: 2,
    });

    const job = await creaJob();
    await expect(gestore(job, { db: pool() })).rejects.toThrow('modello non raggiungibile');

    const riga = await pool().query<{ stato: string; errore_elaborazione: string }>(
      `select stato, errore_elaborazione from velia.documenti where id = $1`,
      [DOC_ID],
    );
    expect(riga.rows[0]!.stato).toBe('errore');
    // Il dettaglio tecnico resta nell'eccezione (e nel job, via worker): sul
    // documento va una frase che dice all'utente cosa fare (RF-B-05/B-06).
    expect(riga.rows[0]!.errore_elaborazione).not.toContain('modello non raggiungibile');
    expect(riga.rows[0]!.errore_elaborazione).toMatch(/Riprova a caricare/);
  });
});
