import { readFileSync } from 'node:fs';

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import { configurazione, type Configurazione } from '../src/config.js';
import type { FormatoDocumento } from '../src/contratto/documenti-privati.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { Job } from '../src/worker/coda.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import type { Convertitore } from '../src/worker/ingestion/convertitore.js';
import { creaGestoreIngestion } from '../src/worker/ingestion/gestore.js';

/**
 * Il job di lettura sulle famiglie nuove (11/09/2026, fase 3 di
 * `PIANO-LINK-E-FORMATI.md`), col database vero e tutto il resto finto:
 * nessun modello, niente Storage, LibreOffice e Voxtral sostituiti. Si
 * guarda che ogni famiglia arrivi a `pronto` con il Markdown giusto, e che
 * senza conversione o trascrizione l'errore dica perché.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}
const dbPronto = Boolean(config?.DATABASE_URL && !config.DATABASE_URL.includes('PASSWORD_MANCANTE'));

class ArchivioConFile implements ArchivioFile {
  readonly file = new Map<string, Buffer>();
  scarica(percorso: string): Promise<Buffer> {
    const byte = this.file.get(percorso);
    return byte ? Promise.resolve(byte) : Promise.reject(new Error(`assente: ${percorso}`));
  }
  carica(percorso: string, contenuto: Buffer): Promise<void> {
    this.file.set(percorso, contenuto);
    return Promise.resolve();
  }
  elimina(percorsi: string[]): Promise<void> {
    for (const p of percorsi) this.file.delete(p);
    return Promise.resolve();
  }
}

/** Un'ancora per pagina: quello che la lettura visiva si aspetta dal modello. */
class ConvertitoreFinto implements Convertitore {
  convertiBlocco(_pdf: Buffer, o: { paginaIniziale: number; pagineTotali: number }): Promise<string> {
    return Promise.resolve(
      Array.from({ length: o.pagineTotali - o.paginaIniziale + 1 }, (_, i) => `[pag. ${o.paginaIniziale + i}]\n\nPagina letta.`).join('\n\n'),
    );
  }
}

async function pdfDiPagine(n: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([300, 400]);
  return Buffer.from(await d.save());
}

const PREFISSO = 'doc-test-formati-';

describe.skipIf(!dbPronto)('la lettura delle famiglie nuove (tutto finto tranne il database)', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioConFile();

  /** Un documento pubblico di prova col suo originale nello Storage finto, e il job che lo legge. */
  async function prepara(suffisso: string, formato: FormatoDocumento, nomeFile: string, byte: Buffer): Promise<{ id: string; job: Job }> {
    const id = `${PREFISSO}${suffisso}`;
    const originale = `prove/formati/${id}/${nomeFile}`;
    archivio.file.set(originale, byte);
    await pool().query(
      `insert into velia.documenti
         (id, archivio, titolo, tipologia, compagnia_id, ramo_id, prodotto, edizione_id, edizione_etichetta,
          edizione_valida_dal, edizione_corrente, formato, path_originale, path_pdf, nome_file, stato)
       values ($1, 'pubblico', $2, 'altro', 'cmp-unipolsai', 'ram-auto', 'Prova', 'edz-prova', 'ed. 01/2026',
               '2026-01-01', true, $3, $4, $5, $6, 'in-coda')
       on conflict (id) do update set stato = 'in-coda', path_md = null, errore_elaborazione = null,
         formato = excluded.formato, path_originale = excluded.path_originale, nome_file = excluded.nome_file`,
      [id, `Prova ${suffisso}`, formato, originale, `prove/formati/${id}/documento.pdf`, nomeFile],
    );
    const job = await pool().query<{ id: string }>(`insert into velia.jobs (tipo, payload) values ('ingestion', $1) returning id`, [
      { documentoId: id },
    ]);
    return {
      id,
      job: { id: job.rows[0]!.id, tenant_id: null, tipo: 'ingestion', payload: { documentoId: id }, stato: 'in-esecuzione', tentativi: 1, errore: null },
    };
  }

  async function stato(id: string) {
    const r = await pool().query<{ stato: string; path_md: string | null; errore_elaborazione: string | null; numero_pagine: number | null }>(
      `select stato, path_md, errore_elaborazione, numero_pagine from velia.documenti where id = $1`,
      [id],
    );
    return r.rows[0]!;
  }

  const markdown = async (id: string) => archivio.file.get((await stato(id)).path_md!)?.toString('utf8') ?? '';

  afterAll(async () => {
    await pool().query(`delete from velia.jobs where tipo = 'ingestion' and payload->>'documentoId' like $1`, [`${PREFISSO}%`]);
    await pool().query(`delete from velia.documenti where id like $1`, [`${PREFISSO}%`]);
    await chiudiPool();
  });

  it('un .p7m si sbusta, e il PDF firmato si legge come un PDF', async () => {
    const busta = readFileSync(new URL('./fixture/p7m/pdf-firmato.p7m', import.meta.url));
    const { id, job } = await prepara('p7m', 'firmato', 'contratto.pdf.p7m', busta);
    await creaGestoreIngestion({ convertitore: new ConvertitoreFinto(), archivio })(job, { db: pool() });
    expect(await stato(id)).toMatchObject({ stato: 'pronto', numero_pagine: 1 });
    expect(await markdown(id)).toContain('[pag. 1]');
    /* Il PDF sbustato è quello che il visualizzatore apre; la busta resta l'originale. */
    expect(archivio.file.get(`prove/formati/${id}/documento.pdf`)?.subarray(0, 5).toString()).toBe('%PDF-');
    expect(archivio.file.get(`prove/formati/${id}/contratto.pdf.p7m`)?.equals(busta)).toBe(true);
  });

  it('un file Office passa dal LibreOffice della sandbox, e senza sandbox l’errore lo dice', async () => {
    const pptx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
    const convertiti: string[] = [];
    const { id, job } = await prepara('pptx', 'office', 'Presentazione.pptx', pptx);
    await creaGestoreIngestion({
      convertitore: new ConvertitoreFinto(),
      archivio,
      inPdfDaOffice: async (_byte, estensione) => {
        convertiti.push(estensione);
        return pdfDiPagine(2);
      },
    })(job, { db: pool() });
    expect(convertiti).toEqual(['.pptx']);
    expect(await stato(id)).toMatchObject({ stato: 'pronto', numero_pagine: 2 });

    const senza = await prepara('pptx-senza', 'office', 'Presentazione.pptx', pptx);
    await creaGestoreIngestion({ convertitore: new ConvertitoreFinto(), archivio })(senza.job, { db: pool() }).catch(() => undefined);
    const s = await stato(senza.id);
    expect(s.stato).toBe('errore');
    expect(s.errore_elaborazione).toMatch(/convertendolo in PDF/);
  });

  it('un audio diventa la sua trascrizione; un file che non si legge la sua scheda', async () => {
    const audio = await prepara('audio', 'audio', 'vocale.opus', Buffer.from('OggS finto'));
    const chiesti: string[] = [];
    await creaGestoreIngestion({
      convertitore: new ConvertitoreFinto(),
      archivio,
      trascrivi: (a) => {
        chiesti.push(`${a.nome} ${a.tipo}`);
        return Promise.resolve('Buongiorno, chiamo per il sinistro di ieri.');
      },
    })(audio.job, { db: pool() });
    expect(chiesti).toEqual(['vocale.opus audio/ogg']);
    expect(await stato(audio.id)).toMatchObject({ stato: 'pronto' });
    expect(await markdown(audio.id)).toContain('Buongiorno, chiamo per il sinistro di ieri.');

    const altro = await prepara('dwg', 'altro', 'pianta.dwg', Buffer.alloc(2048, 7));
    await creaGestoreIngestion({ convertitore: new ConvertitoreFinto(), archivio })(altro.job, { db: pool() });
    expect(await stato(altro.id)).toMatchObject({ stato: 'pronto' });
    expect(await markdown(altro.id)).toContain('File DWG di 2 KB');
  });

  it('un’email si legge senza modello; un’immagine WEBP di prima diventa PNG e si guarda', async () => {
    const eml = Buffer.from('From: Cliente <c@esempio.it>\r\nSubject: Disdetta polizza\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nChiedo la disdetta alla scadenza.\r\n');
    const email = await prepara('eml', 'email', 'disdetta.eml', eml);
    await creaGestoreIngestion({ convertitore: new ConvertitoreFinto(), archivio })(email.job, { db: pool() });
    expect(await stato(email.id)).toMatchObject({ stato: 'pronto' });
    expect(await markdown(email.id)).toContain('Chiedo la disdetta alla scadenza.');

    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2f4b7c' } }).webp().toBuffer();
    const foto = await prepara('webp', 'immagine', 'foto.webp', webp);
    await creaGestoreIngestion({ convertitore: new ConvertitoreFinto(), archivio })(foto.job, { db: pool() });
    expect(await stato(foto.id)).toMatchObject({ stato: 'pronto', numero_pagine: 1 });
  });
});
