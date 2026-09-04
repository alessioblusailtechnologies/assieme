import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { DocumentoRiferimento, RegolaIstruzione, VoceStoricoImpostazioni } from '../src/contratto/impostazioni.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import type { Utente } from '../src/contratto/utenti.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { clientServizio } from '../src/db/supabase.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { gestori } from '../src/worker/gestori.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import { caricaDna } from '../src/worker/motore/regole.js';
import type { DocumentoWorkspace } from '../src/worker/motore/workspace.js';

/**
 * Il resto della Fase 6 contro il progetto vero (tenant di collaudo):
 * regole con storico, documenti di riferimento nelle due origini (promosso
 * e caricato, con l'ingestion finta che misura il Markdown — RF-D-16), il
 * governo che decide cosa entra nel DNA del motore, lo storico unico, gli
 * utenti (invito vero su Supabase Auth, ruolo, sospensione, 409 su sé
 * stessi).
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
const DOC_PROMOSSO = 'doc-priv-imp00000001';
const EMAIL_INVITO = 'invito.collaudo@collaudo.sonovelia.it';

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

async function pdfDiProva(): Promise<Buffer> {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([300, 400]).drawText('Convenzione quadro', { x: 20, y: 360, size: 12, font });
  return Buffer.from(await d.save());
}

function multipart(nome: string, contenuto: Buffer): { corpo: Buffer; contentType: string } {
  const confine = '----velia-riferimento';
  const corpo = Buffer.concat([
    Buffer.from(
      `--${confine}\r\nContent-Disposition: form-data; name="file"; filename="${nome}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    contenuto,
    Buffer.from(`\r\n--${confine}--\r\n`),
  ]);
  return { corpo, contentType: `multipart/form-data; boundary=${confine}` };
}

const MD_FINTO = '# Convenzione\n\n[pag. 1]\n\nTesto della convenzione quadro.\n';

describe.skipIf(!pronto)('impostazioni complete col progetto Supabase', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenOperatore: string;
  let idAdmin: string;
  let regolaId: string;

  const richiedi = (
    metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    token: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });

  async function lavoraTutto(): Promise<void> {
    while (await lavoraUno(pool(), { visibilitaSecondi: 30 })) {
      /* ancora */
    }
  }

  const pulizia = async (): Promise<void> => {
    await pool().query(`delete from velia.riferimenti where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.istruzioni where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.impostazioni_storico where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(
      `delete from velia.documenti where tenant_id = $1 and (id = $2 or nome_file = 'convenzione-quadro.pdf')`,
      [TENANT_COLLAUDO, DOC_PROMOSSO],
    );
    await pool().query(`delete from velia.jobs where tipo = 'ingestion' and tenant_id = $1`, [TENANT_COLLAUDO]);
    // L'invitato del giro precedente, in Auth e nel profilo.
    const invitato = await pool().query<{ id: string }>(`select id from velia.utenti where email = $1`, [
      EMAIL_INVITO,
    ]);
    if (invitato.rows[0]) {
      await pool().query(`delete from velia.utenti where id = $1`, [invitato.rows[0].id]);
      await clientServizio().auth.admin.deleteUser(invitato.rows[0].id).catch(() => undefined);
    }
  };

  beforeAll(async () => {
    app = creaApp({ logger: false, istruzioni: { archivio }, archivioPrivato: { archivio } });
    await pulizia();

    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.uno@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    tokenAdmin = accesso.json<EsitoAccesso>().tokenAccesso;
    idAdmin = accesso.json<EsitoAccesso>().sessione.utente.id;
    const operatore = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.due@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    tokenOperatore = operatore.json<EsitoAccesso>().tokenAccesso;
    expect(tokenAdmin).toBeTruthy();

    // Ingestion finta: il .md compare nello Storage finto, col suo peso (RF-D-16).
    gestori.ingestion = async (job, { db }) => {
      const id = String(job.payload['documentoId']);
      const r = await db.query<{ path_pdf: string }>(`select path_pdf from velia.documenti where id = $1`, [id]);
      const pathMd = r.rows[0]!.path_pdf.replace(/\.pdf$/, '.md');
      archivio.file.set(pathMd, Buffer.from(MD_FINTO));
      await db.query(
        `update velia.documenti
         set stato = 'pronto', numero_pagine = 1, path_md = $2, dimensione_md_byte = $3
         where id = $1`,
        [id, pathMd, Buffer.byteLength(MD_FINTO)],
      );
    };

    // Un privato pronto da promuovere (RF-B-09).
    await pool().query(
      `insert into velia.documenti
         (id, archivio, tenant_id, titolo, tipologia, stato, numero_pagine, path_md,
          caricato_il, dimensione_byte, dimensione_md_byte)
       values ($1, 'privato', $2, 'Polizza convenzione ANIA', 'polizza', 'pronto', 3, $3, now(), 9000, 1234)`,
      [DOC_PROMOSSO, TENANT_COLLAUDO, `tenant/${TENANT_COLLAUDO}/documenti/${DOC_PROMOSSO}.md`],
    );
  }, 60_000);

  afterAll(async () => {
    await pulizia();
    await app.close();
    await chiudiPool();
  });

  it('le regole: CRUD con lo storico che racconta creazione, sospensione e modifica', async () => {
    const creata = await richiedi('POST', '/api/istruzioni/regole', tokenAdmin, {
      titolo: 'Infortuni del conducente',
      testo: 'Non segnalare come carenza l’assenza della garanzia: l’agenzia la copre con polizza dedicata.',
      ambito: { tipo: 'ramo', ramoId: 'ram-auto' },
    });
    expect(creata.statusCode).toBe(201);
    const regola = creata.json<RegolaIstruzione>();
    regolaId = regola.id;
    expect(regola).toMatchObject({ attiva: true, ambito: { tipo: 'ramo', ramoId: 'ram-auto' } });

    const ramoFinto = await richiedi('POST', '/api/istruzioni/regole', tokenAdmin, {
      titolo: 'X',
      testo: 'Y',
      ambito: { tipo: 'ramo', ramoId: 'ram-inventato' },
    });
    expect(ramoFinto.statusCode).toBe(400);

    const sospesa = await richiedi('PATCH', `/api/istruzioni/regole/${regolaId}`, tokenAdmin, { attiva: false });
    expect(sospesa.json<RegolaIstruzione>().attiva).toBe(false);
    const rinominata = await richiedi('PATCH', `/api/istruzioni/regole/${regolaId}`, tokenAdmin, {
      titolo: 'Infortuni conducente (deroga)',
    });
    expect(rinominata.json<RegolaIstruzione>().titolo).toBe('Infortuni conducente (deroga)');

    const elenco = await richiedi('GET', '/api/istruzioni/regole', tokenOperatore);
    expect(elenco.json<RegolaIstruzione[]>().map((r) => r.id)).toContain(regolaId);

    const storico = await richiedi('GET', '/api/impostazioni/storico?oggetti=regola', tokenAdmin);
    const azioni = storico.json<VoceStoricoImpostazioni[]>().map((v) => v.azione);
    expect(azioni).toEqual(['modifica', 'disattivazione', 'creazione']); // la più recente in cima
    expect(storico.json<VoceStoricoImpostazioni[]>()[0]!.utenteNome).toBe('Tea Collaudo');
  });

  it('i riferimenti: promosso e caricato in un elenco unico, col peso del Markdown (RF-D-16)', async () => {
    const promozione = await richiedi('PUT', `/api/documenti-privati/${DOC_PROMOSSO}/riferimento`, tokenAdmin);
    expect(promozione.statusCode).toBe(200);

    const { corpo, contentType } = multipart('convenzione-quadro.pdf', await pdfDiProva());
    const caricamento = await app.inject({
      method: 'POST',
      url: '/api/istruzioni/riferimenti',
      headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': contentType },
      payload: corpo,
    });
    expect(caricamento.statusCode).toBe(201);
    await lavoraTutto(); // l'ingestion finta converte e misura il Markdown

    const elenco = (await richiedi('GET', '/api/istruzioni/riferimenti', tokenOperatore)).json<
      DocumentoRiferimento[]
    >();
    expect(elenco).toHaveLength(2);
    const promosso = elenco.find((r) => r.documentoPrivatoId === DOC_PROMOSSO)!;
    expect(promosso).toMatchObject({ titolo: 'Polizza convenzione ANIA', attivo: true, dimensioneByte: 1234 });
    const caricato = elenco.find((r) => !r.documentoPrivatoId)!;
    expect(caricato.titolo).toBe('convenzione-quadro');
    expect(caricato.dimensioneByte).toBe(Buffer.byteLength(MD_FINTO)); // il Markdown, non il PDF
  });

  it('il governo decide cosa entra nel DNA: sospeso o fuori ambito = fuori dal prompt', async () => {
    const perPath = new Map<string, DocumentoWorkspace>([
      [
        `tenant/documenti/polizza/polizza--${DOC_PROMOSSO}.md`,
        {
          id: DOC_PROMOSSO,
          titolo: 'Polizza convenzione ANIA',
          descrizione: null,
          archivio: 'privato',
          tipologia: 'polizza',
          numeroPagine: 3,
          paginaMassima: 3,
          compagnia: null,
          ramo: null,
          compagniaId: null,
          ramoId: null,
          prodotto: null,
          edizione: null,
          riferimentoCliente: null,
          etichette: [],
          documentoDiRiferimento: true,
        },
      ],
    ]);
    const ambiti = { ramiIds: ['ram-auto'], compagnieIds: [] };
    const utente = idAdmin;

    const conVoce = await caricaDna(pool(), TENANT_COLLAUDO, utente, ambiti, perPath);
    expect(conVoce.riferimenti.map((r) => r.id)).toContain(DOC_PROMOSSO);

    const elenco = (await richiedi('GET', '/api/istruzioni/riferimenti', tokenAdmin)).json<DocumentoRiferimento[]>();
    const promosso = elenco.find((r) => r.documentoPrivatoId === DOC_PROMOSSO)!;

    await richiedi('PATCH', `/api/istruzioni/riferimenti/${promosso.id}`, tokenAdmin, { attivo: false });
    const sospeso = await caricaDna(pool(), TENANT_COLLAUDO, utente, ambiti, perPath);
    expect(sospeso.riferimenti).toHaveLength(0);

    await richiedi('PATCH', `/api/istruzioni/riferimenti/${promosso.id}`, tokenAdmin, {
      attivo: true,
      ambito: { tipo: 'ramo', ramoId: 'ram-casa' },
    });
    const fuoriAmbito = await caricaDna(pool(), TENANT_COLLAUDO, utente, ambiti, perPath);
    expect(fuoriAmbito.riferimenti).toHaveLength(0); // il contesto è ram-auto, la voce vale per ram-casa
  });

  it('togliere il ruolo: il promosso resta in archivio, il caricato sparisce con file e riga', async () => {
    const elenco = (await richiedi('GET', '/api/istruzioni/riferimenti', tokenAdmin)).json<DocumentoRiferimento[]>();
    const promosso = elenco.find((r) => r.documentoPrivatoId === DOC_PROMOSSO)!;
    const caricato = elenco.find((r) => !r.documentoPrivatoId)!;

    expect((await richiedi('DELETE', `/api/istruzioni/riferimenti/${promosso.id}`, tokenAdmin)).statusCode).toBe(204);
    const documento = await pool().query<{ documento_di_riferimento: boolean }>(
      `select documento_di_riferimento from velia.documenti where id = $1`,
      [DOC_PROMOSSO],
    );
    expect(documento.rows[0]).toEqual({ documento_di_riferimento: false }); // resta, senza ruolo

    expect((await richiedi('DELETE', `/api/istruzioni/riferimenti/${caricato.id}`, tokenAdmin)).statusCode).toBe(204);
    const sparito = await pool().query(`select 1 from velia.documenti where nome_file = 'convenzione-quadro.pdf'`);
    expect(sparito.rowCount).toBe(0);
    expect([...archivio.file.keys()].some((p) => p.includes('convenzione'))).toBe(false);

    expect((await richiedi('GET', '/api/istruzioni/riferimenti', tokenAdmin)).json<DocumentoRiferimento[]>()).toEqual([]);
  });

  it('gli utenti: invito vero su Auth, ruolo e sospensione, mai su sé stessi (RF-D-01)', async () => {
    const elenco = await richiedi('GET', '/api/utenti', tokenAdmin);
    expect(elenco.statusCode).toBe(200);
    expect(elenco.json<Utente[]>().map((u) => u.email)).toEqual(
      expect.arrayContaining(['t.uno@collaudo.sonovelia.it', 't.due@collaudo.sonovelia.it']),
    );

    const invito = await richiedi('POST', '/api/utenti', tokenAdmin, {
      nome: 'Iva',
      cognome: 'Invitata',
      email: EMAIL_INVITO,
      ruolo: 'operatore',
    });
    expect(invito.statusCode).toBe(201);
    const invitata = invito.json<Utente>();
    expect(invitata).toMatchObject({ stato: 'invitato', ruolo: 'operatore', tenantId: TENANT_COLLAUDO });

    const inAuth = await clientServizio().auth.admin.getUserById(invitata.id);
    expect(inAuth.data.user?.app_metadata).toMatchObject({ tenant_id: TENANT_COLLAUDO, ruolo: 'operatore' });

    const doppione = await richiedi('POST', '/api/utenti', tokenAdmin, {
      nome: 'Iva',
      cognome: 'Invitata',
      email: EMAIL_INVITO,
    });
    expect(doppione.statusCode).toBe(409);
    expect(doppione.json()).toMatchObject({ codice: 'EMAIL_ESISTENTE' });

    const promossa = await richiedi('PATCH', `/api/utenti/${invitata.id}`, tokenAdmin, { ruolo: 'amministratore' });
    expect(promossa.json<Utente>().ruolo).toBe('amministratore');
    const metadata = await clientServizio().auth.admin.getUserById(invitata.id);
    expect(metadata.data.user?.app_metadata['ruolo']).toBe('amministratore');

    const sospesa = await richiedi('PATCH', `/api/utenti/${invitata.id}`, tokenAdmin, { stato: 'sospeso' });
    expect(sospesa.json<Utente>().stato).toBe('sospeso');

    const seStesso = await richiedi('PATCH', `/api/utenti/${idAdmin}`, tokenAdmin, { stato: 'sospeso' });
    expect(seStesso.statusCode).toBe(409);
    expect(seStesso.json()).toMatchObject({ codice: 'SE_STESSO' });
  });

  it('la regola si elimina e lo storico unico filtra per oggetto', async () => {
    expect((await richiedi('DELETE', `/api/istruzioni/regole/${regolaId}`, tokenAdmin)).statusCode).toBe(204);
    expect((await richiedi('GET', `/api/istruzioni/regole`, tokenAdmin)).json<RegolaIstruzione[]>()).toEqual([]);

    const tutto = (await richiedi('GET', '/api/impostazioni/storico', tokenAdmin)).json<VoceStoricoImpostazioni[]>();
    const oggetti = new Set(tutto.map((v) => v.oggetto));
    expect(oggetti).toContain('regola');
    expect(oggetti).toContain('documento-riferimento');

    const soloRegole = (
      await richiedi('GET', '/api/impostazioni/storico?oggetti=regola', tokenAdmin)
    ).json<VoceStoricoImpostazioni[]>();
    expect(soloRegole.every((v) => v.oggetto === 'regola')).toBe(true);
    expect(soloRegole[0]!.azione).toBe('eliminazione');
  });
});
