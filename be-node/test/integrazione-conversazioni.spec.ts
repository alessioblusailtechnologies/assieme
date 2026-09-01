import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { PonteEventi } from '../src/api/conversazioni/ponte-eventi.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type {
  Conversazione,
  EventoStream,
  Messaggio,
  PaginaConversazioni,
  RiferimentoDocumento,
} from '../src/contratto/conversazioni.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, creaClientDedicato, poolDb } from '../src/db/pool.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { gestori } from '../src/worker/gestori.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import { creaGestoreInterrogazione } from '../src/worker/motore/gestore.js';
import { MARCATORE_CITAZIONI } from '../src/worker/motore/regole.js';
import type { EsitoSessione, Motore, OsservatoreSessione, RichiestaMotore } from '../src/worker/motore/sessione.js';
import { materializzaWorkspace } from '../src/worker/motore/workspace.js';

/**
 * La chat per intero contro il progetto vero, con un MOTORE FINTO al posto
 * dell'Agent SDK (zero chiamate, zero spesa): conversazioni e contesto,
 * allegato in coda di ingestion, la rotta SSE che accoda il job, il worker
 * che lo lavora e inoltra i passi sul canale degli eventi, la validazione
 * delle citazioni, la persistenza a fine risposta, l'annullamento. La
 * workspace è vera: i .md vengono dallo Storage finto e l'albero si
 * costruisce dai metadati.
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
  const r = await app.inject({ method: 'POST', url: '/api/sessione/accesso', payload: { email, password: PASSWORD_DEMO } });
  return r.json<EsitoAccesso>().tokenAccesso;
}

async function pdfDiProva(): Promise<Buffer> {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([300, 400]).drawText('Allegato di prova', { x: 20, y: 360, size: 12, font });
  return Buffer.from(await d.save());
}

function multipart(nome: string, contenuto: Buffer): { corpo: Buffer; contentType: string } {
  const confine = '----velia-allegato';
  const corpo = Buffer.concat([
    Buffer.from(`--${confine}\r\nContent-Disposition: form-data; name="file"; filename="${nome}"\r\nContent-Type: application/pdf\r\n\r\n`),
    contenuto,
    Buffer.from(`\r\n--${confine}--\r\n`),
  ]);
  return { corpo, contentType: `multipart/form-data; boundary=${confine}` };
}

/** Legge i frame SSE `data: <json>\n\n` di una risposta completa. */
function eventiDa(corpo: string): EventoStream[] {
  return corpo
    .split('\n\n')
    .map((b) => b.trim())
    .filter((b) => b.startsWith('data:'))
    .map((b) => JSON.parse(b.slice(5).trim()) as EventoStream);
}

class ArchivioFinto implements ArchivioFile {
  readonly file = new Map<string, Buffer>();
  scarica(p: string): Promise<Buffer> {
    const b = this.file.get(p);
    return b ? Promise.resolve(b) : Promise.reject(new Error(`assente: ${p}`));
  }
  carica(p: string, c: Buffer): Promise<void> {
    this.file.set(p, c);
    return Promise.resolve();
  }
  elimina(ps: string[]): Promise<void> {
    for (const p of ps) this.file.delete(p);
    return Promise.resolve();
  }
}

/** Un motore che recita un copione: passi e testo finale decisi dal test. */
class MotoreFinto implements Motore {
  richieste: RichiestaMotore[] = [];
  copione: (r: RichiestaMotore, o: OsservatoreSessione) => Promise<Partial<EsitoSessione> & { testo: string }> = () =>
    Promise.resolve({ testo: 'Risposta.' });
  async interroga(r: RichiestaMotore, o: OsservatoreSessione): Promise<EsitoSessione> {
    this.richieste.push(r);
    const parziale = await this.copione(r, o);
    return {
      terminato: 'completato',
      modello: 'finto',
      turni: 3,
      durataMs: 10,
      costoUsd: 0.01,
      token: { input: 100, output: 50, cacheLettura: 0, cacheScrittura: 0 },
      documentiLetti: [],
      /* Come l'SDK: una sessione persistita ha un id, e riprendendola resta lo stesso. */
      ...(r.sessione?.persisti && { sessioneId: r.sessione.riprendi ?? 'sessione-finta' }),
      ...parziale,
    };
  }
}

/** Le trascrizioni «sul disco» del worker finto: il test decide quali esistono ancora. */
const trascrizioni = new Set<string>();

describe.skipIf(!pronto)('chat col progetto Supabase (motore finto)', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  const motore = new MotoreFinto();
  let ponte: PonteEventi;
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenOperatore: string;
  let radice: string;
  let docPubblicoId: string;
  let docPubblicoTitolo: string;
  let pathMdPubblico: string;
  let convId: string;

  const richiedi = (metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, token: string, payload?: Record<string, unknown>) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });

  /** Lavora i job in coda finché ce ne sono (il worker, in miniatura). */
  async function lavoraTutto(): Promise<void> {
    while (await lavoraUno(pool(), { visibilitaSecondi: 30 })) {
      /* ancora */
    }
  }

  /** La rotta SSE accoda il job dopo qualche query: si aspetta che esista prima di lavorarlo. */
  async function aspettaJob(testo: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const r = await pool().query(`select 1 from velia.jobs where tipo = 'interrogazione' and payload->>'testo' = $1`, [testo]);
      if (r.rowCount) return;
      await new Promise((res) => setTimeout(res, 100));
    }
    throw new Error(`job per «${testo}» mai accodato`);
  }

  beforeAll(async () => {
    radice = await mkdtemp(join(tmpdir(), 'velia-motore-'));
    ponte = new PonteEventi(poolDb(), creaClientDedicato);
    app = creaApp({ logger: false, archivioPrivato: { archivio }, conversazioni: { archivio, ponte, battitoMs: 500 } });
    tokenAdmin = await accedi(app, EMAIL_ADMIN);
    tokenOperatore = await accedi(app, EMAIL_OPERATORE);

    // Il gestore d'interrogazione del worker, col motore finto e il titolista finto.
    gestori.interrogazione = creaGestoreInterrogazione({
      motore,
      archivio,
      radice,
      attesaAllegatiMs: 1000,
      ripresaSessione: { esiste: (id) => Promise.resolve(trascrizioni.has(id)) },
      generatoreTitolo: { genera: () => Promise.resolve('Franchigie cristalli Km&Servizi') },
      /* La memoria impara in linea a ogni risposta (Fase 8): un estrattore
         a copione, col primo candidato dentro il perimetro. */
      estrattore: {
        estrai: () =>
          Promise.resolve({
            candidati: [
              { testo: 'Per la garanzia cristalli l’agenzia segnala sempre la franchigia al cliente.', categoria: 'prassi', ambito: 'tenant' },
            ],
            modello: 'finto',
            token: { input: 10, output: 5, cacheLettura: 0, cacheScrittura: 0 },
            costoUsd: 0.001,
          }),
      },
    });
    // E un'ingestion finta per gli allegati: il .md compare nello Storage finto e il documento diventa pronto.
    gestori.ingestion = async (job, { db }) => {
      const id = String(job.payload['documentoId']);
      const r = await db.query<{ path_pdf: string }>(`select path_pdf from velia.documenti where id = $1`, [id]);
      const pathMd = r.rows[0]!.path_pdf.replace(/\.pdf$/, '.md');
      archivio.file.set(pathMd, Buffer.from('# Allegato\n\n[pag. 1]\n\nPolizza del cliente Rossi.\n'));
      await db.query(`update velia.documenti set stato = 'pronto', numero_pagine = 1, path_md = $2 where id = $1`, [id, pathMd]);
    };

    // Un documento pubblico vero del catalogo, col suo .md finto nello Storage finto.
    const pub = await pool().query<{ id: string; titolo: string; path_md: string }>(
      `select id, titolo, path_md from velia.documenti where archivio = 'pubblico' and path_md is not null order by id limit 1`,
    );
    docPubblicoId = pub.rows[0]!.id;
    docPubblicoTitolo = pub.rows[0]!.titolo;
    pathMdPubblico = pub.rows[0]!.path_md;
    for (const r of (await pool().query<{ path_md: string }>(`select path_md from velia.documenti where archivio = 'pubblico' and path_md is not null`)).rows) {
      archivio.file.set(r.path_md, Buffer.from(`# ${r.path_md}\n\n[pag. 1]\n\nGaranzia cristalli: franchigia € 200.\n\n[pag. 2]\n\nEsclusioni.\n`));
    }

    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.documenti where archivio = 'conversazione' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.istruzioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.ricordi where tenant_id = $1`, [TENANT_COLLAUDO]);
  });

  afterAll(async () => {
    await ponte.chiudi();
    await app.close();
    await pool().query(`delete from velia.jobs where tenant_id = $1 and tipo in ('interrogazione', 'ingestion', 'memoria')`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.documenti where archivio = 'conversazione' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.istruzioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.ricordi where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.audit_risposte where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.consumi where tenant_id = $1`, [TENANT_COLLAUDO]);
    await chiudiPool();
    await rm(radice, { recursive: true, force: true });
  });

  it('crea una conversazione col contesto validato, la elenca idratata; il contesto si muta e torna intero', async () => {
    const nascita = await richiedi('POST', '/api/conversazioni', tokenAdmin, { documentiInContesto: [docPubblicoId] });
    expect(nascita.statusCode).toBe(201);
    const conv = nascita.json<Conversazione>();
    convId = conv.id;
    expect(conv).toMatchObject({ titolo: 'Nuova conversazione', condivisa: false, documentiInContesto: [{ id: docPubblicoId, titolo: docPubblicoTitolo, archivio: 'pubblico' }] });

    const ignoto = await richiedi('POST', '/api/conversazioni', tokenAdmin, { documentiInContesto: ['doc-inesistente'] });
    expect(ignoto.statusCode).toBe(404);
    expect(ignoto.json<CorpoErroreApi>().codice).toBe('NON_TROVATO');

    const elenco = await richiedi('GET', '/api/conversazioni', tokenAdmin);
    expect(elenco.json<PaginaConversazioni>().elementi.map((c) => c.id)).toEqual([convId]);
    // Non condivisa: il collega non la vede.
    const collega = await richiedi('GET', '/api/conversazioni', tokenOperatore);
    expect(collega.json<PaginaConversazioni>().elementi).toEqual([]);

    const tolto = await richiedi('DELETE', `/api/conversazioni/${convId}/contesto/${docPubblicoId}`, tokenAdmin);
    expect(tolto.statusCode).toBe(200);
    expect(tolto.json<Conversazione>().documentiInContesto).toEqual([]);
    const rimesso = await richiedi('PUT', `/api/conversazioni/${convId}/contesto/${docPubblicoId}`, tokenAdmin, {});
    expect(rimesso.json<Conversazione>().documentiInContesto).toHaveLength(1);

    const rinominata = await richiedi('PATCH', `/api/conversazioni/${convId}`, tokenAdmin, { titolo: '  ', condivisa: true });
    expect(rinominata.json<Conversazione>()).toMatchObject({ titolo: 'Nuova conversazione', condivisa: true });
    // Condivisa: ora il collega la vede, ma non può scriverci né rinominarla.
    expect((await richiedi('GET', '/api/conversazioni', tokenOperatore)).json<PaginaConversazioni>().elementi).toHaveLength(1);
    expect((await richiedi('PATCH', `/api/conversazioni/${convId}`, tokenOperatore, { titolo: 'X' })).statusCode).toBe(403);
  });

  it('allegato: nasce nell’Archivio Privato, in coda di ingestion, referenziabile subito; il file si apre', async () => {
    const { corpo, contentType } = multipart('polizza-rossi.pdf', await pdfDiProva());
    const r = await app.inject({ method: 'POST', url: '/api/conversazioni/allegati', headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': contentType }, payload: corpo });
    expect(r.statusCode).toBe(201);
    const rif = r.json<RiferimentoDocumento>();
    expect(rif.id).toMatch(/^doc-priv-/);
    expect(rif).toMatchObject({ titolo: 'polizza-rossi', archivio: 'privato' });

    const job = await pool().query(`select 1 from velia.jobs where tipo = 'ingestion' and payload->>'documentoId' = $1`, [rif.id]);
    expect(job.rowCount).toBe(1);

    const nelContesto = await richiedi('PUT', `/api/conversazioni/${convId}/contesto/${rif.id}`, tokenAdmin, {});
    expect(nelContesto.statusCode).toBe(200);
    expect(nelContesto.json<Conversazione>().documentiInContesto.map((d) => d.archivio)).toEqual(['pubblico', 'privato']);

    const file = await richiedi('GET', `/api/documenti-privati/${rif.id}/file`, tokenAdmin);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');

    const vuoto = await app.inject({ method: 'POST', url: '/api/conversazioni/allegati', headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': 'multipart/form-data; boundary=x' }, payload: '--x--\r\n' });
    expect(vuoto.statusCode).toBe(400);
    expect(vuoto.json<CorpoErroreApi>().codice).toBe('FILE_MANCANTE');
  });

  it('la workspace: pubblico nell’albero dello Storage, allegato non pronto segnalato, INDICE generati', async () => {
    const contesto = (await richiedi('GET', `/api/conversazioni/${convId}`, tokenAdmin)).json<Conversazione>().documentiInContesto.map((d) => d.id);
    const ws = await materializzaWorkspace({ db: pool(), archivio, tenantId: TENANT_COLLAUDO, radice, jobId: 'prova-ws', contestoIds: contesto });
    try {
      expect(ws.perId.get(docPubblicoId)).toBe(pathMdPubblico);
      const contenuto = await readFile(join(ws.directory, ...pathMdPubblico.split('/')), 'utf8');
      expect(contenuto).toContain('[pag. 1]');
      /* Il tenant demo può contenere documenti veri caricati a mano, che lo
         Storage finto non conosce: qui conta solo che l'allegato in coda
         sia dichiarato col suo motivo. */
      expect(ws.mancanti.some((m) => m.motivo === 'elaborazione non ancora conclusa')).toBe(true);
      const indice = await readFile(join(ws.directory, 'tenant', 'documenti', 'INDICE.md'), 'utf8');
      expect(indice).toContain('Archivio privato');
      expect(await readFile(join(ws.directory, 'INDICE.md'), 'utf8')).toContain('archivio-pubblico/');
    } finally {
      await ws.rimuovi();
    }
  });

  it('messaggio → SSE: inizio, attività, testo, citazione, provenienza, fine; poi il messaggio è persistito con audit e consumi', async () => {
    await pool().query(
      `insert into velia.istruzioni (tenant_id, titolo, testo, ambito_tipo) values ($1, 'Massimali prudenziali', 'Considera adeguato solo ≥ 10 milioni.', 'generale')`,
      [TENANT_COLLAUDO],
    );
    const istruzione = (await pool().query<{ id: string }>(`select id::text from velia.istruzioni where tenant_id = $1`, [TENANT_COLLAUDO])).rows[0]!.id;

    motore.copione = async (r, o) => {
      expect(r.promptSistema).toContain(`[id: ${istruzione}]`);
      expect(r.promptUtente).toContain(`\`${pathMdPubblico}\``);
      expect(r.promptUtente).toContain('Che franchigia');
      await o.passo({ tipo: 'attivita', etichetta: 'Cerco «franchigia» in dip.md' });
      await o.passo({ tipo: 'testo', delta: 'La franchigia è ' });
      await o.passo({ tipo: 'testo', delta: '€ 200 *(DIP, pag. 1)*.' });
      return {
        testo:
          `La franchigia è € 200 *(DIP, pag. 1)*.\n\n${MARCATORE_CITAZIONI}\n` +
          JSON.stringify({
            citazioni: [{ file: pathMdPubblico, pagina: 1, estratto: 'franchigia € 200' }],
            provenienze: [{ tipo: 'regola', id: istruzione }],
            nonSupportato: false,
          }) +
          '\n```',
        documentiLetti: [pathMdPubblico],
      };
    };

    // Lo stream parte, il worker lavora in parallelo, lo stream finisce col `fine`.
    const stream = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'Che franchigia prevede la garanzia cristalli?', documentiReferenziati: [] });
    await aspettaJob('Che franchigia prevede la garanzia cristalli?');
    await lavoraTutto();
    const r = await stream;
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/event-stream');
    const eventi = eventiDa(r.body);
    expect(eventi[0]?.tipo).toBe('inizio');
    // RF-G-01: a risposta scritta la memoria impara nello stesso stream — il passo, poi l'esito.
    expect(eventi.some((e) => e.tipo === 'attivita' && e.etichetta === 'Cerco qualcosa da ricordare')).toBe(true);
    const memoria = eventi.find((e) => e.tipo === 'memoria');
    expect(memoria?.tipo === 'memoria' && memoria.ricordi).toMatchObject([{ categoria: 'prassi', ambito: 'tenant' }]);
    const ricordi = await pool().query(`select 1 from velia.ricordi where origine_conversazione_id = $1`, [convId]);
    expect(ricordi.rowCount).toBe(1);
    expect(eventi.map((e) => e.tipo)).toEqual(
      expect.arrayContaining(['inizio', 'attivita', 'testo', 'citazione', 'provenienza', 'fine']),
    );
    expect(eventi.at(-1)?.tipo).toBe('fine');
    const inizio = eventi[0] as Extract<EventoStream, { tipo: 'inizio' }>;
    const citazione = eventi.find((e) => e.tipo === 'citazione') as Extract<EventoStream, { tipo: 'citazione' }>;
    expect(citazione.citazione).toMatchObject({ documentoId: docPubblicoId, documentoTitolo: docPubblicoTitolo, archivio: 'pubblico', posizione: { pagina: 1 } });
    const prov = eventi.find((e) => e.tipo === 'provenienza') as Extract<EventoStream, { tipo: 'provenienza' }>;
    expect(prov.provenienza).toEqual({ tipo: 'regola', origineId: istruzione, etichetta: 'valutato secondo la regola "Massimali prudenziali"' });

    // Il filo: domanda e risposta, nell'ordine, con gli id dell'evento `inizio`.
    const filo = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>();
    expect(filo.map((m) => [m.autore, m.id])).toEqual([['utente', inizio.messaggioUtenteId], ['assistente', inizio.messaggioId]]);
    expect(filo[1]!.testo).toBe('La franchigia è € 200 *(DIP, pag. 1)*.');
    expect(filo[1]!.citazioni).toHaveLength(1);
    expect(filo[1]!.nonSupportato).toBeUndefined();

    // Il titolo: provvisorio dalle prime parole all'invio, sensato dal titolista a risposta pronta.
    const conv = (await richiedi('GET', `/api/conversazioni/${convId}`, tokenAdmin)).json<Conversazione>();
    expect(conv.titolo).toBe('Franchigie cristalli Km&Servizi');

    const audit = await pool().query<{ modello: string; documenti_letti: string[]; costo_usd: string }>(`select modello, documenti_letti, costo_usd from velia.audit_risposte where conversazione_id = $1`, [convId]);
    expect(audit.rows[0]).toMatchObject({ modello: 'finto', documenti_letti: [pathMdPubblico] });
    const consumi = await pool().query(`select 1 from velia.consumi where tenant_id = $1 and modello = 'finto'`, [TENANT_COLLAUDO]);
    expect(consumi.rowCount).toBeGreaterThan(0);
    const job = await pool().query<{ stato: string }>(`select stato from velia.jobs where tipo = 'interrogazione' and payload->>'conversazioneId' = $1 order by created_at desc limit 1`, [convId]);
    expect(job.rows[0]?.stato).toBe('completato');

    // La prima risposta ha persistito la sessione SDK: la conversazione ne ricorda l'id.
    expect(motore.richieste.at(-1)?.sessione).toEqual({ persisti: true });
    const sess = await pool().query<{ sessione_sdk: string | null }>(`select sessione_sdk from velia.conversazioni where id = $1`, [convId]);
    expect(sess.rows[0]?.sessione_sdk).toBe('sessione-finta');
  });

  it('il messaggio dopo riprende la sessione SDK (niente storia nel prompt); senza trascrizione riparte pieno, con la storia', async () => {
    const risposta = (domanda: string) =>
      `${domanda} → ok.\n\n${MARCATORE_CITAZIONI}\n${JSON.stringify({ citazioni: [], provenienze: [], nonSupportato: true })}\n\`\`\``;
    motore.copione = (r) => Promise.resolve({ testo: risposta(r.promptUtente.split('\n').at(-1) ?? '') });

    /* La trascrizione c'è: si riprende, e la domanda nuova è tutto il prompt. */
    trascrizioni.add('sessione-finta');
    let stream = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'E per il furto?', documentiReferenziati: [] });
    await aspettaJob('E per il furto?');
    await lavoraTutto();
    expect((await stream).statusCode).toBe(200);
    let r = motore.richieste.at(-1)!;
    expect(r.sessione).toEqual({ persisti: true, riprendi: 'sessione-finta' });
    expect(r.promptUtente).not.toContain('Conversazione finora');
    expect(r.promptUtente).not.toContain('Che franchigia');
    expect(r.promptUtente).toContain('E per il furto?');

    /* La trascrizione non c'è più (altro host, disco pulito): job pieno con la storia dal DB. */
    trascrizioni.clear();
    stream = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'E l’incendio?', documentiReferenziati: [] });
    await aspettaJob('E l’incendio?');
    await lavoraTutto();
    expect((await stream).statusCode).toBe(200);
    r = motore.richieste.at(-1)!;
    expect(r.sessione).toEqual({ persisti: true });
    expect(r.promptUtente).toContain('Conversazione finora');
    expect(r.promptUtente).toContain('Che franchigia');
    expect(r.promptUtente).toContain('E per il furto?');
    expect(r.promptUtente).toContain('E l’incendio?');
  });

  it('messaggio vuoto → 400; una risposta con citazioni inventate → evento errore, niente messaggio, job fallito', async () => {
    expect((await richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: '  ', documentiReferenziati: [] })).statusCode).toBe(400);

    motore.copione = () =>
      Promise.resolve({
        testo: `Inventato.\n\n${MARCATORE_CITAZIONI}\n${JSON.stringify({ citazioni: [{ file: 'archivio-pubblico/inventato.md', pagina: 3, estratto: 'x' }], provenienze: [], nonSupportato: false })}\n\`\`\``,
      });
    const prima = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>().length;
    const stream = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'Seconda domanda', documentiReferenziati: [] });
    await aspettaJob('Seconda domanda');
    await lavoraTutto();
    const eventi = eventiDa((await stream).body);
    const ultimo = eventi.at(-1);
    expect(ultimo?.tipo).toBe('errore');
    expect((ultimo as Extract<EventoStream, { tipo: 'errore' }>).messaggio).toContain('non verificabili');
    const dopo = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>();
    expect(dopo.length).toBe(prima + 1); // solo la domanda
    const job = await pool().query<{ stato: string }>(`select stato from velia.jobs where tipo = 'interrogazione' and payload->>'testo' = 'Seconda domanda'`);
    expect(job.rows[0]?.stato).toBe('fallito');
  });

  it('non-supportato e budget: dichiarati, persistiti; e un job annullato non persiste la risposta', { timeout: 40_000 }, async () => {
    motore.copione = () =>
      Promise.resolve({
        testo: `I documenti non trattano la grandine.\n\n${MARCATORE_CITAZIONI}\n${JSON.stringify({ citazioni: [], provenienze: [], nonSupportato: true })}\n\`\`\``,
      });
    let stream = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'Copre la grandine?', documentiReferenziati: [] });
    await aspettaJob('Copre la grandine?');
    await lavoraTutto();
    let eventi = eventiDa((await stream).body);
    expect(eventi.some((e) => e.tipo === 'non-supportato')).toBe(true);
    expect(eventi.at(-1)?.tipo).toBe('fine');
    let filo = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>();
    expect(filo.at(-1)).toMatchObject({ autore: 'assistente', nonSupportato: true, citazioni: [] });

    motore.copione = () => Promise.resolve({ testo: 'Risposta a metà', terminato: 'budget', errore: 'tetto di turni raggiunto' });
    stream = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'Domanda enorme', documentiReferenziati: [] });
    await aspettaJob('Domanda enorme');
    await lavoraTutto();
    eventi = eventiDa((await stream).body);
    expect(eventi.at(-1)?.tipo).toBe('fine');
    filo = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>();
    expect(filo.at(-1)!.testo).toMatch(/Risposta parziale/);

    // Annullamento: il job viene segnato annullato prima che il worker lo lavori → nessuna risposta, nessun `fine`.
    motore.copione = async (_r, o) => {
      expect(await o.annullato()).toBe(true);
      return { testo: 'Non dovrei essere persistito', terminato: 'annullato' };
    };
    const prima = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>().length;
    const invio = richiedi('POST', `/api/conversazioni/${convId}/messaggi`, tokenAdmin, { testo: 'Ferma tutto', documentiReferenziati: [] });
    await aspettaJob('Ferma tutto');
    await pool().query(`update velia.jobs set stato = 'annullato' where tipo = 'interrogazione' and payload->>'testo' = 'Ferma tutto'`);
    await lavoraTutto();
    // Lo stream non riceve `fine`: lo si sblocca lato test emettendo l'evento di chiusura da fuori.
    const job = (await pool().query<{ id: string; stato: string }>(`select id, stato from velia.jobs where tipo = 'interrogazione' and payload->>'testo' = 'Ferma tutto'`)).rows[0]!;
    expect(job.stato).toBe('annullato');
    await pool().query(
      `with e as (
         insert into velia.eventi_job (job_id, tipo, dati) values ($1, 'errore', '{"messaggio":"chiuso dal test"}') returning id
       )
       select pg_notify('eventi_job', json_build_object('jobId', $1::text, 'eventoId', e.id, 'tipo', 'errore')::text) from e`,
      [job.id],
    );
    const eventiAnnullato = eventiDa((await invio).body);
    expect(eventiAnnullato.some((e) => e.tipo === 'fine')).toBe(false);
    const dopo = (await richiedi('GET', `/api/conversazioni/${convId}/messaggi`, tokenAdmin)).json<Messaggio[]>();
    expect(dopo.length).toBe(prima + 1);
  });

  it('DELETE: 204, messaggi in cascata, il documento allegato resta nell’Archivio Privato', async () => {
    const conv = (await richiedi('GET', `/api/conversazioni/${convId}`, tokenAdmin)).json<Conversazione>();
    const allegato = conv.documentiInContesto.find((d) => d.archivio === 'privato')!;
    expect(archivio.file.has(`tenant/${TENANT_COLLAUDO}/documenti/${allegato.id}.pdf`)).toBe(true);

    const r = await richiedi('DELETE', `/api/conversazioni/${convId}`, tokenAdmin);
    expect(r.statusCode).toBe(204);
    expect((await richiedi('GET', `/api/conversazioni/${convId}`, tokenAdmin)).statusCode).toBe(404);
    expect((await richiedi('GET', `/api/conversazioni/${convId}`, tokenAdmin)).json<CorpoErroreApi>().codice).toBe('NON_TROVATA');
    /* L'allegato è un documento dell'archivio: la conversazione se ne va, lui resta. */
    expect(archivio.file.has(`tenant/${TENANT_COLLAUDO}/documenti/${allegato.id}.pdf`)).toBe(true);
    expect((await richiedi('GET', `/api/documenti-privati/${allegato.id}`, tokenAdmin)).statusCode).toBe(200);
    const messaggi = await pool().query(`select 1 from velia.messaggi where conversazione_id = $1`, [convId]);
    expect(messaggi.rowCount).toBe(0);
  });
});
