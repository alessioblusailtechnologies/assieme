import type { FastifyInstance } from 'fastify';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type {
  DocumentoPrivato,
  EsitoCaricamento,
  Etichetta,
  PaginaDocumentiPrivati,
  SpazioTenant,
} from '../src/contratto/documenti-privati.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { conIdentita } from '../src/db/identita.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { Job } from '../src/worker/coda.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import type {
  Classificatore,
  ContestoClassificazione,
  PropostaClassificazione,
} from '../src/worker/ingestion/classificatore.js';
import type { Convertitore } from '../src/worker/ingestion/convertitore.js';
import { creaGestoreIngestion, MESSAGGIO_SENZA_TESTO } from '../src/worker/ingestion/gestore.js';

/**
 * L'Archivio Privato per intero, contro il progetto vero: upload → riga in
 * coda + job → ingestion (convertitore e classificatore finti, zero chiamate
 * AI) → pronto; poi scheda, modifiche, etichette, spazio, riferimento,
 * limiti di piano, isolamento fra tenant ed eliminazione effettiva. Lo
 * Storage è una mappa in memoria: ciò che le rotte caricano, il gestore
 * scarica, e l'eliminazione toglie.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const pronto = Boolean(
  config?.SUPABASE_JWT_SECRET &&
    config.DATABASE_URL &&
    !config.DATABASE_URL.includes('PASSWORD_MANCANTE'),
);

const PASSWORD_DEMO = 'velia-demo-2026!';
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';
const EMAIL_ADMIN = 't.uno@collaudo.sonovelia.it';
const EMAIL_OPERATORE = 't.due@collaudo.sonovelia.it';

async function accedi(app: FastifyInstance, email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/sessione/accesso',
    payload: { email, password: PASSWORD_DEMO },
  });
  return r.json<EsitoAccesso>().tokenAccesso;
}

/** Un PDF vero con del testo, generato in memoria. */
async function pdfDiProva(pagine = 2, testo = 'Preventivo RC Auto'): Promise<Buffer> {
  const documento = await PDFDocument.create();
  const font = await documento.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pagine; i++) {
    const pagina = documento.addPage([300, 400]);
    pagina.drawText(`${testo} - pag. ${i + 1}`, { x: 20, y: 360, size: 12, font });
  }
  return Buffer.from(await documento.save());
}

/** Il corpo multipart che manda il FE: campo `file` ripetuto, un filename per parte. */
function multipart(file: Array<{ nome: string; contenuto: Buffer; tipo?: string }>): {
  corpo: Buffer;
  contentType: string;
} {
  const confine = `----velia-${Math.random().toString(16).slice(2)}`;
  const pezzi: Buffer[] = [];
  for (const f of file) {
    pezzi.push(
      Buffer.from(
        `--${confine}\r\nContent-Disposition: form-data; name="file"; filename="${f.nome}"\r\n` +
          `Content-Type: ${f.tipo ?? 'application/pdf'}\r\n\r\n`,
      ),
      f.contenuto,
      Buffer.from('\r\n'),
    );
  }
  pezzi.push(Buffer.from(`--${confine}--\r\n`));
  return { corpo: Buffer.concat(pezzi), contentType: `multipart/form-data; boundary=${confine}` };
}

class ArchivioFinto implements ArchivioFile {
  readonly file = new Map<string, Buffer>();
  scarica(percorso: string): Promise<Buffer> {
    const b = this.file.get(percorso);
    return b ? Promise.resolve(b) : Promise.reject(new Error(`assente: ${percorso}`));
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

class ConvertitoreFinto implements Convertitore {
  constructor(private readonly testo = 'Contenuto convertito.') {}
  convertiBlocco(_pdf: Buffer, o: { paginaIniziale: number }): Promise<string> {
    return Promise.resolve(`[pag. ${o.paginaIniziale}]\n\n${this.testo}`);
  }
}

class ClassificatoreFinto implements Classificatore {
  readonly contesti: ContestoClassificazione[] = [];
  constructor(private readonly proposta: PropostaClassificazione) {}
  classifica(contesto: ContestoClassificazione): Promise<PropostaClassificazione> {
    this.contesti.push(contesto);
    return Promise.resolve(this.proposta);
  }
}

describe.skipIf(!pronto)('archivio privato col progetto Supabase', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenOperatore: string;
  let idAdmin: string;
  let limitiOriginali: { limite_spazio_byte: string; limite_file_byte: string };
  const creati: string[] = [];

  const richiedi = (
    metodo: 'GET' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    token: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method: metodo,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload && { payload }),
    });

  const carica = (token: string, file: Parameters<typeof multipart>[0]) => {
    const { corpo, contentType } = multipart(file);
    return app.inject({
      method: 'POST',
      url: '/api/documenti-privati',
      headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
      payload: corpo,
    });
  };

  /** Il job come lo passerebbe il worker al gestore. */
  async function jobPer(documentoId: string): Promise<Job> {
    const r = await pool().query<{ id: string; payload: Record<string, unknown> }>(
      `select id, payload from velia.jobs where tipo = 'ingestion' and payload->>'documentoId' = $1`,
      [documentoId],
    );
    const riga = r.rows[0]!;
    return {
      id: riga.id,
      tenant_id: TENANT_COLLAUDO,
      tipo: 'ingestion',
      payload: riga.payload,
      stato: 'in-esecuzione',
      tentativi: 1,
      errore: null,
    };
  }

  beforeAll(async () => {
    app = creaApp({ logger: false, archivioPrivato: { archivio } });
    tokenAdmin = await accedi(app, EMAIL_ADMIN);
    tokenOperatore = await accedi(app, EMAIL_OPERATORE);
    const u = await pool().query<{ id: string }>(`select id from velia.utenti where email = $1`, [
      EMAIL_ADMIN,
    ]);
    idAdmin = u.rows[0]!.id;
    const t = await pool().query<typeof limitiOriginali>(
      `select limite_spazio_byte, limite_file_byte from velia.tenant where id = $1`,
      [TENANT_COLLAUDO],
    );
    limitiOriginali = t.rows[0]!;
    // Un giro precedente interrotto non deve sporcare questo.
    await pool().query(`delete from velia.documenti where archivio = 'privato' and tenant_id = $1`, [
      TENANT_COLLAUDO,
    ]);
  });

  afterAll(async () => {
    await pool().query(
      `update velia.tenant set limite_spazio_byte = $2, limite_file_byte = $3 where id = $1`,
      [TENANT_COLLAUDO, limitiOriginali.limite_spazio_byte, limitiOriginali.limite_file_byte],
    );
    await pool().query(`delete from velia.jobs where tipo = 'ingestion' and tenant_id = $1`, [
      TENANT_COLLAUDO,
    ]);
    await pool().query(`delete from velia.documenti where archivio = 'privato' and tenant_id = $1`, [
      TENANT_COLLAUDO,
    ]);
    await chiudiPool();
  });

  it('spazio: i limiti del piano (default del mock) e un archivio vuoto', async () => {
    const r = await richiedi('GET', '/api/spazio', tokenAdmin);
    expect(r.statusCode).toBe(200);
    expect(r.json<SpazioTenant>()).toEqual({
      usatoByte: 0,
      limiteByte: 5 * 1024 * 1024 * 1024,
      limiteFileByte: 20 * 1024 * 1024,
      numeroDocumenti: 0,
    });
  });

  it('upload senza file → 400 NESSUN_FILE; un non-PDF → 415 FORMATO_NON_SUPPORTATO', async () => {
    const vuoto = await carica(tokenAdmin, []);
    expect(vuoto.statusCode).toBe(400);
    expect(vuoto.json<CorpoErroreApi>().codice).toBe('NESSUN_FILE');

    const testo = await carica(tokenAdmin, [
      { nome: 'appunti.txt', contenuto: Buffer.from('ciao'), tipo: 'text/plain' },
    ]);
    expect(testo.statusCode).toBe(415);
    expect(testo.json<CorpoErroreApi>().codice).toBe('FORMATO_NON_SUPPORTATO');

    // Un .pdf che non è un PDF: il nome non basta.
    const finto = await carica(tokenAdmin, [{ nome: 'finto.pdf', contenuto: Buffer.from('ciao') }]);
    expect(finto.statusCode).toBe(415);
  });

  it('upload multiplo → 201 {creati}: in coda, titolo dal nome, proposta da confermare, job accodati', async () => {
    const r = await carica(tokenAdmin, [
      { nome: 'preventivo-rossi-unipol.pdf', contenuto: await pdfDiProva() },
      { nome: 'scansione-polizza.pdf', contenuto: await pdfDiProva(1) },
    ]);
    expect(r.statusCode).toBe(201);
    const { creati: docs } = r.json<EsitoCaricamento>();
    expect(docs).toHaveLength(2);
    creati.push(...docs.map((d) => d.id));

    const [primo, secondo] = docs as [DocumentoPrivato, DocumentoPrivato];
    expect(primo.id).toMatch(/^doc-priv-[0-9a-f]{12}$/);
    expect(primo).toMatchObject({
      archivio: 'privato',
      titolo: 'preventivo-rossi-unipol',
      tipologia: 'altro',
      stato: 'in-coda',
      caricatoDa: idAdmin,
      etichette: [],
      classificazioneDaConfermare: true,
      documentoDiRiferimento: false,
      visibilita: 'tenant',
      fileUrl: `/api/documenti-privati/${primo.id}/file`,
    });
    expect(primo.dimensioneByte).toBeGreaterThan(0);
    expect(primo.numeroPagine).toBeUndefined();
    expect(secondo.titolo).toBe('scansione-polizza');

    // I byte sono nello Storage, sotto il tenant.
    expect(archivio.file.has(`tenant/${TENANT_COLLAUDO}/documenti/${primo.id}.pdf`)).toBe(true);

    // E i job di ingestion sono accodati, firmati dal tenant e dall'utente.
    const jobs = await pool().query<{ tenant_id: string; utente_id: string }>(
      `select tenant_id, utente_id from velia.jobs
       where tipo = 'ingestion' and payload->>'documentoId' = any($1)`,
      [docs.map((d) => d.id)],
    );
    expect(jobs.rowCount).toBe(2);
    expect(jobs.rows[0]).toEqual({ tenant_id: TENANT_COLLAUDO, utente_id: idAdmin });
  });

  it('elenco: i più recenti in cima, filtri per stato e ricerca, anche per il collega', async () => {
    const r = await richiedi('GET', '/api/documenti-privati', tokenOperatore);
    expect(r.statusCode).toBe(200);
    const pagina = r.json<PaginaDocumentiPrivati>();
    expect(pagina.totale).toBe(2);
    expect(pagina.elementi.map((d) => d.id).sort()).toEqual([...creati].sort());

    const inCoda = await richiedi('GET', '/api/documenti-privati?stato=in-coda', tokenAdmin);
    expect(inCoda.json<PaginaDocumentiPrivati>().totale).toBe(2);
    const pronti = await richiedi('GET', '/api/documenti-privati?stato=pronto', tokenAdmin);
    expect(pronti.json<PaginaDocumentiPrivati>().totale).toBe(0);

    const cerca = await richiedi('GET', '/api/documenti-privati?q=UNIPOL%20rossi', tokenAdmin);
    expect(cerca.json<PaginaDocumentiPrivati>().elementi.map((d) => d.titolo)).toEqual([
      'preventivo-rossi-unipol',
    ]);

    const oltre = await richiedi('GET', '/api/documenti-privati?pagina=9', tokenAdmin);
    expect(oltre.json<PaginaDocumentiPrivati>()).toMatchObject({ elementi: [], totale: 2, pagina: 9 });
  });

  it('finché non è pronto: file 409 NON_PRONTO, promozione 409 NON_PRONTO', async () => {
    const file = await richiedi('GET', `/api/documenti-privati/${creati[0]}/file`, tokenAdmin);
    expect(file.statusCode).toBe(409);
    expect(file.json<CorpoErroreApi>().codice).toBe('NON_PRONTO');

    const promuovi = await richiedi('PUT', `/api/documenti-privati/${creati[0]}/riferimento`, tokenAdmin, {});
    expect(promuovi.statusCode).toBe(409);
    expect(promuovi.json<CorpoErroreApi>().codice).toBe('NON_PRONTO');
  });

  it('ingestion: converte, classifica (proposta) e porta a pronto; poi il file si apre', async () => {
    const classificatore = new ClassificatoreFinto({
      tipologia: 'preventivo',
      compagniaId: 'cmp-unipolsai',
      ramoId: 'ram-auto',
      riferimentoCliente: 'Rossi Mario',
    });
    const gestore = creaGestoreIngestion({
      convertitore: new ConvertitoreFinto(),
      classificatore,
      archivio,
    });
    await gestore(await jobPer(creati[0]!), { db: pool() });

    expect(classificatore.contesti[0]?.nomeFile).toBe('preventivo-rossi-unipol.pdf');
    expect(classificatore.contesti[0]?.compagnie.some((c) => c.id === 'cmp-unipolsai')).toBe(true);

    const r = await richiedi('GET', `/api/documenti-privati/${creati[0]}`, tokenAdmin);
    const doc = r.json<DocumentoPrivato>();
    expect(doc).toMatchObject({
      stato: 'pronto',
      numeroPagine: 2,
      tipologia: 'preventivo',
      compagnia: { id: 'cmp-unipolsai' },
      ramo: { id: 'ram-auto', codice: 'rc-auto' },
      riferimentoCliente: 'Rossi Mario',
      classificazioneDaConfermare: true, // la proposta resta tale finché l'utente non la tocca
    });
    expect(archivio.file.has(`tenant/${TENANT_COLLAUDO}/documenti/${creati[0]}.md`)).toBe(true);

    const file = await richiedi('GET', `/api/documenti-privati/${creati[0]}/file`, tokenAdmin);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('PATCH: titolo, etichette, riferimento cliente svuotato con null; la proposta è confermata', async () => {
    const r = await richiedi('PATCH', `/api/documenti-privati/${creati[0]}`, tokenAdmin, {
      titolo: 'Preventivo Rossi',
      etichette: ['RC Auto', 'Rossi Mario', 'RC Auto'],
      riferimentoCliente: null,
    });
    expect(r.statusCode).toBe(200);
    const doc = r.json<DocumentoPrivato>();
    expect(doc.titolo).toBe('Preventivo Rossi');
    expect(doc.etichette).toEqual(['RC Auto', 'Rossi Mario']);
    expect(doc.riferimentoCliente).toBeUndefined();
    expect(doc.classificazioneDaConfermare).toBeUndefined();
    expect(doc.tipologia).toBe('preventivo'); // non toccata: resta la proposta

    const nonValida = await richiedi('PATCH', `/api/documenti-privati/${creati[0]}`, tokenAdmin, {
      tipologia: 'fattura',
    });
    expect(nonValida.statusCode).toBe(400);

    const compagniaIgnota = await richiedi('PATCH', `/api/documenti-privati/${creati[0]}`, tokenAdmin, {
      compagniaId: 'cmp-inesistente',
    });
    expect(compagniaIgnota.statusCode).toBe(400);
  });

  it('etichette: conteggio per tenant, ordinate per uso e nome; filtro per etichetta', async () => {
    const r = await richiedi('GET', '/api/etichette', tokenOperatore);
    expect(r.statusCode).toBe(200);
    expect(r.json<Etichetta[]>()).toEqual([
      { nome: 'RC Auto', documenti: 1 },
      { nome: 'Rossi Mario', documenti: 1 },
    ]);

    const filtro = await richiedi('GET', '/api/documenti-privati?etichetta=RC%20Auto', tokenAdmin);
    expect(filtro.json<PaginaDocumentiPrivati>().elementi.map((d) => d.id)).toEqual([creati[0]]);
  });

  it('riferimento (RF-B-09): PUT promuove un pronto, soloRiferimenti lo trova, DELETE lo toglie', async () => {
    const su = await richiedi('PUT', `/api/documenti-privati/${creati[0]}/riferimento`, tokenAdmin, {});
    expect(su.statusCode).toBe(200);
    expect(su.json<DocumentoPrivato>().documentoDiRiferimento).toBe(true);

    const soli = await richiedi('GET', '/api/documenti-privati?soloRiferimenti=true', tokenAdmin);
    expect(soli.json<PaginaDocumentiPrivati>().elementi.map((d) => d.id)).toEqual([creati[0]]);
    const falso = await richiedi('GET', '/api/documenti-privati?soloRiferimenti=false', tokenAdmin);
    expect(falso.json<PaginaDocumentiPrivati>().totale).toBe(2);

    const giu = await richiedi('DELETE', `/api/documenti-privati/${creati[0]}/riferimento`, tokenAdmin);
    expect(giu.statusCode).toBe(200);
    expect(giu.json<DocumentoPrivato>().documentoDiRiferimento).toBe(false);
  });

  it('se l’utente ha già confermato, la proposta del modello non scrive; una scansione muta va in errore', async () => {
    // Conferma prima dell'ingestion: PATCH vuota = «i metadati vanno bene così».
    const conferma = await richiedi('PATCH', `/api/documenti-privati/${creati[1]}`, tokenAdmin, {
      tipologia: 'polizza',
    });
    expect(conferma.statusCode).toBe(200);

    const classificatore = new ClassificatoreFinto({ tipologia: 'preventivo', compagniaId: 'cmp-axa' });
    // Il convertitore non tira fuori una riga di testo: solo ancore.
    const gestore = creaGestoreIngestion({
      convertitore: new ConvertitoreFinto(''),
      classificatore,
      archivio,
    });
    await expect(gestore(await jobPer(creati[1]!), { db: pool() })).rejects.toThrow();

    const r = await richiedi('GET', `/api/documenti-privati/${creati[1]}`, tokenAdmin);
    const doc = r.json<DocumentoPrivato>();
    expect(doc.stato).toBe('errore');
    expect(doc.erroreElaborazione).toBe(MESSAGGIO_SENZA_TESTO);
    expect(doc.tipologia).toBe('polizza');
    expect(doc.compagnia).toBeUndefined();
    expect(classificatore.contesti).toHaveLength(0); // non si è nemmeno chiesto
  });

  it('limiti di piano (RF-B-08): 413 oltre la misura per file, 507 oltre lo spazio', async () => {
    await pool().query(`update velia.tenant set limite_file_byte = 100 where id = $1`, [TENANT_COLLAUDO]);
    const grande = await carica(tokenAdmin, [{ nome: 'grande.pdf', contenuto: await pdfDiProva() }]);
    expect(grande.statusCode).toBe(413);
    expect(grande.json<CorpoErroreApi>()).toEqual({
      codice: 'FILE_TROPPO_GRANDE',
      messaggio: '«grande.pdf» supera il limite di 0 MB per file.',
    });

    await pool().query(
      `update velia.tenant set limite_file_byte = $2, limite_spazio_byte = 1000 where id = $1`,
      [TENANT_COLLAUDO, limitiOriginali.limite_file_byte],
    );
    const pieno = await carica(tokenAdmin, [{ nome: 'altro.pdf', contenuto: await pdfDiProva() }]);
    expect(pieno.statusCode).toBe(507);
    expect(pieno.json<CorpoErroreApi>().codice).toBe('SPAZIO_ESAURITO');

    await pool().query(`update velia.tenant set limite_spazio_byte = $2 where id = $1`, [
      TENANT_COLLAUDO,
      limitiOriginali.limite_spazio_byte,
    ]);
    const spazio = await richiedi('GET', '/api/spazio', tokenAdmin);
    expect(spazio.json<SpazioTenant>().numeroDocumenti).toBe(2);
    expect(spazio.json<SpazioTenant>().usatoByte).toBeGreaterThan(0);
  });

  it('isolamento (RF-B-01): un altro tenant non vede una riga, nemmeno per id', async () => {
    const altrove = await conIdentita(
      pool(),
      { utenteId: '00000000-0000-4000-8000-000000000099', tenantId: '33333333-3333-4333-8333-333333333333', ruolo: 'amministratore' },
      (client) =>
        client.query(`select id from velia.documenti where archivio = 'privato' and id = any($1)`, [creati]),
    );
    expect(altrove.rowCount).toBe(0);

    // Nemmeno senza il filtro esplicito della rotta: è la policy a dirlo.
    const tutto = await conIdentita(
      pool(),
      { utenteId: '00000000-0000-4000-8000-000000000099', tenantId: '33333333-3333-4333-8333-333333333333', ruolo: 'operatore' },
      (client) => client.query(`select count(*)::int as n from velia.documenti where archivio = 'privato'`),
    );
    expect(tutto.rows[0]).toEqual({ n: 0 });
  });

  it('DELETE: 204, la riga sparisce e con lei PDF e Markdown (RNF-03)', async () => {
    const id = creati[0]!;
    const pdf = `tenant/${TENANT_COLLAUDO}/documenti/${id}.pdf`;
    const md = `tenant/${TENANT_COLLAUDO}/documenti/${id}.md`;
    expect(archivio.file.has(pdf) && archivio.file.has(md)).toBe(true);

    const r = await richiedi('DELETE', `/api/documenti-privati/${id}`, tokenOperatore);
    expect(r.statusCode).toBe(204);
    expect(archivio.file.has(pdf) || archivio.file.has(md)).toBe(false);

    const dopo = await richiedi('GET', `/api/documenti-privati/${id}`, tokenAdmin);
    expect(dopo.statusCode).toBe(404);
    const ancora = await richiedi('DELETE', `/api/documenti-privati/${id}`, tokenAdmin);
    expect(ancora.statusCode).toBe(404);
  });
});
