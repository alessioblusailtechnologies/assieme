import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { FastifyInstance } from 'fastify';
import PizZip from 'pizzip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import type { IdentitaVisiva, TemplateOutput } from '../src/contratto/template.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';

/**
 * La Fase 4 per intero, contro il progetto vero (tenant di collaudo): la
 * libreria che parte vuota, il caricamento di due template DOCX del
 * tenant coi segnaposto, il predefinito per formato e il nome che si cambia,
 * l’identità visiva col logo, l’anteprima PDF e l’esportazione
 * di un messaggio — sul layout di piattaforma e su template proprio. Lo Storage è una
 * mappa in memoria, il database è quello vero: RLS compresa.
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

/** Un PNG 1×1 valido: basta per incorporare un logo. */
const PNG_LOGO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

async function accedi(app: FastifyInstance, email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/sessione/accesso',
    payload: { email, password: PASSWORD_DEMO },
  });
  return r.json<EsitoAccesso>().tokenAccesso;
}

async function docxDiProva(paragrafi: string[]): Promise<Buffer> {
  const documento = new Document({
    sections: [{ children: paragrafi.map((t) => new Paragraph({ children: [new TextRun(t)] })) }],
  });
  return Packer.toBuffer(documento);
}

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
          `Content-Type: ${f.tipo ?? 'application/octet-stream'}\r\n\r\n`,
      ),
      f.contenuto,
      Buffer.from('\r\n'),
    );
  }
  pezzi.push(Buffer.from(`--${confine}--\r\n`));
  return { corpo: Buffer.concat(pezzi), contentType: `multipart/form-data; boundary=${confine}` };
}

const testoDocx = (byte: Buffer): string =>
  new PizZip(byte).files['word/document.xml']!.asText().replace(/<[^>]+>/g, '');

describe.skipIf(!pronto)('template e generazione col progetto Supabase', () => {
  const archivio = new ArchivioFinto();
  let app: FastifyInstance;
  let tokenAdmin: string;
  let tokenOperatore: string;
  let conversazioneId: string;
  let messaggioId: string;
  let templateProprio: TemplateOutput;
  let templateSecondo: TemplateOutput;

  const pulizia = async (): Promise<void> => {
    await poolDb().query(`delete from velia.template where tenant_id = $1`, [TENANT_COLLAUDO]);
    await poolDb().query(`delete from velia.identita_visiva where tenant_id = $1`, [TENANT_COLLAUDO]);
    await poolDb().query(`delete from velia.impostazioni_storico where tenant_id = $1`, [TENANT_COLLAUDO]);
    await poolDb().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT_COLLAUDO]);
  };

  const richiedi = (
    metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    token: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ) =>
    app.inject({
      method: metodo,
      url,
      headers: { authorization: `Bearer ${token}`, ...headers },
      ...(payload !== undefined && { payload: payload as never }),
    });

  beforeAll(async () => {
    app = creaApp({ logger: false, template: { archivio } });
    await app.ready();
    await pulizia();
    tokenAdmin = await accedi(app, EMAIL_ADMIN);
    tokenOperatore = await accedi(app, EMAIL_OPERATORE);
    expect(tokenAdmin).toBeTruthy();

    // Una conversazione con una risposta «del worker», da esportare.
    const conversazione = await richiedi('POST', '/api/conversazioni', tokenAdmin, {
      titolo: 'Prova esportazione',
    });
    expect(conversazione.statusCode).toBe(201);
    conversazioneId = conversazione.json<{ id: string }>().id;
    const m = await poolDb().query<{ id: string }>(
      `insert into velia.messaggi (conversazione_id, tenant_id, autore, testo, citazioni)
       values ($1, $2, 'assistente', $3, $4) returning id`,
      [
        conversazioneId,
        TENANT_COLLAUDO,
        'La garanzia **Furto** prevede uno scoperto del 10%.\n\n- Franchigia: 500 euro',
        JSON.stringify([
          {
            id: 'cit-1',
            documentoId: 'doc-pub-prova',
            documentoTitolo: 'Documento di prova',
            archivio: 'pubblico',
            posizione: { pagina: 3, articolo: '12' },
            estratto: 'Scoperto del 10%…',
          },
        ]),
      ],
    );
    messaggioId = m.rows[0]!.id;
  }, 60_000);

  afterAll(async () => {
    await pulizia();
    await app.close();
    await chiudiPool();
  });

  it('la libreria parte vuota: i template sono solo quelli che l’agenzia carica', async () => {
    const r = await richiedi('GET', '/api/template', tokenOperatore);
    expect(r.statusCode).toBe(200);
    expect(r.json<TemplateOutput[]>()).toEqual([]);
  });

  it('carica un template DOCX, conforme allo schema dei segnaposto: il primo del formato è il predefinito', async () => {
    const { corpo, contentType } = multipart([
      {
        nome: 'Carta intestata collaudo.docx',
        contenuto: await docxDiProva(['{{titolo}} — {{data}}', '{{contenuto}}', 'Fonti: {{fonti}}']),
      },
    ]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/template',
      headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': contentType },
      payload: corpo,
    });
    expect(r.statusCode).toBe(201);
    const { creati } = r.json<{ creati: TemplateOutput[] }>();
    templateProprio = creati[0]!;
    expect(templateProprio).toMatchObject({
      nome: 'Carta intestata collaudo',
      formato: 'docx',
      predefinito: true,
    });
    expect(archivio.file.has(`tenant/${TENANT_COLLAUDO}/template/${templateProprio.id}.docx`)).toBe(true);

    /* Un secondo DOCX: stesso formato, quanti se ne vogliono — ma non è il
       predefinito. Ed è una carta intestata senza segnaposto: il testo va in coda. */
    const secondo = multipart([
      { nome: 'Proposta breve.docx', contenuto: await docxDiProva(['Agenzia di Collaudo — carta intestata']) },
    ]);
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/template',
      headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': secondo.contentType },
      payload: secondo.corpo,
    });
    expect(r2.statusCode).toBe(201);
    templateSecondo = r2.json<{ creati: TemplateOutput[] }>().creati[0]!;
    expect(templateSecondo).toMatchObject({ nome: 'Proposta breve', formato: 'docx', predefinito: false });

    const elenco = await richiedi('GET', '/api/template', tokenAdmin);
    expect(elenco.json<TemplateOutput[]>().map((t) => t.id)).toEqual([templateProprio.id, templateSecondo.id]);
  });

  it('i caricamenti sbagliati si rifiutano con un motivo leggibile, senza lasciare metà lotto', async () => {
    const casi: Array<{ nome: string; contenuto: Buffer; stato: number; codice: string }> = [
      { nome: 'note.txt', contenuto: Buffer.from('testo'), stato: 400, codice: 'FORMATO_NON_AMMESSO' },
      { nome: 'slide.pptx', contenuto: Buffer.from('PK'), stato: 415, codice: 'FORMATO_NON_SUPPORTATO' },
      { nome: 'finto.docx', contenuto: Buffer.from('non uno zip'), stato: 400, codice: 'FORMATO_NON_AMMESSO' },
    ];
    for (const caso of casi) {
      const { corpo, contentType } = multipart([caso]);
      const r = await app.inject({
        method: 'POST',
        url: '/api/template',
        headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': contentType },
        payload: corpo,
      });
      expect(r.statusCode, caso.nome).toBe(caso.stato);
      expect(r.json()).toMatchObject({ codice: caso.codice });
    }

    const { corpo, contentType } = multipart([
      { nome: 'buono.docx', contenuto: await docxDiProva(['{{contenuto}}']) },
      { nome: 'cattivo.pptx', contenuto: Buffer.from('PK') },
    ]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/template',
      headers: { authorization: `Bearer ${tokenAdmin}`, 'content-type': contentType },
      payload: corpo,
    });
    expect(r.statusCode).toBe(415);
    const elenco = await richiedi('GET', '/api/template', tokenAdmin);
    expect(elenco.json<TemplateOutput[]>().some((t) => t.nome === 'buono')).toBe(false);
  });

  it('il predefinito per formato: assegnarlo lo toglie a chi lo portava; il nome si cambia', async () => {
    const r = await richiedi('PATCH', `/api/template/${templateSecondo.id}`, tokenAdmin, { predefinito: true });
    expect(r.statusCode).toBe(200);
    const elenco = r.json<TemplateOutput[]>();
    expect(elenco.find((t) => t.id === templateSecondo.id)?.predefinito).toBe(true);
    expect(elenco.find((t) => t.id === templateProprio.id)?.predefinito).toBe(false);

    const tolto = await richiedi('PATCH', `/api/template/${templateSecondo.id}`, tokenAdmin, { predefinito: false });
    expect(tolto.json<TemplateOutput[]>().every((t) => !t.predefinito)).toBe(true);

    const rinominato = await richiedi('PATCH', `/api/template/${templateProprio.id}`, tokenAdmin, {
      nome: 'Carta intestata',
      predefinito: true,
    });
    expect(rinominato.json<TemplateOutput[]>().find((t) => t.id === templateProprio.id)).toMatchObject({
      nome: 'Carta intestata',
      predefinito: true,
    });

    const estraneo = await richiedi('PATCH', `/api/template/${templateProprio.id}`, tokenAdmin, {
      tipologiaPredefinita: 'confronto',
    });
    expect(estraneo.statusCode).toBe(400);
  });

  it("l'anteprima è sempre un PDF, anche per un template DOCX", async () => {
    const r = await richiedi('GET', `/api/template/${templateProprio.id}/anteprima`, tokenOperatore);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("l'identità visiva: default finché non c'è, poi ciò che l'amministratore salva — col logo", async () => {
    const vergine = await richiedi('GET', '/api/identita-visiva', tokenAdmin);
    expect(vergine.json<IdentitaVisiva>().colorePrimario).toBe('#2f4b7c');
    expect(vergine.json<IdentitaVisiva>().logoUrl).toBeUndefined();

    const negato = await richiedi('PUT', '/api/identita-visiva', tokenOperatore, { firma: 'Io' });
    expect(negato.statusCode).toBe(403);

    const salvata = await richiedi('PUT', '/api/identita-visiva', tokenAdmin, {
      colorePrimario: '#aa3344',
      recapiti: 'Via del Collaudo 1, Torino',
      firma: 'Agenzia di Collaudo',
    });
    expect(salvata.statusCode).toBe(200);
    expect(salvata.json<IdentitaVisiva>().colorePrimario).toBe('#aa3344');

    const logo = await richiedi('PUT', '/api/identita-visiva/logo', tokenAdmin, PNG_LOGO, {
      'content-type': 'image/png',
    });
    expect(logo.statusCode).toBe(200);
    expect(logo.json()).toEqual({ logoUrl: '/api/identita-visiva/logo' });

    const riletta = await richiedi('GET', '/api/identita-visiva', tokenOperatore);
    expect(riletta.json<IdentitaVisiva>()).toMatchObject({
      colorePrimario: '#aa3344',
      logoUrl: '/api/identita-visiva/logo',
    });
    const servito = await richiedi('GET', '/api/identita-visiva/logo', tokenOperatore);
    expect(servito.statusCode).toBe(200);
    expect(servito.headers['content-type']).toBe('image/png');
    expect(servito.rawPayload.equals(PNG_LOGO)).toBe(true);
  });

  it("l'esportazione per solo formato senza template: il layout di piattaforma, download vero", async () => {
    const r = await richiedi(
      'POST',
      `/api/conversazioni/${conversazioneId}/messaggi/${messaggioId}/esporta`,
      tokenAdmin,
      { formato: 'pdf' },
    );
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('attachment; filename="documento-velia.pdf"');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("l'esportazione sul template proprio (per id o come predefinito del formato): i segnaposto portano testo e fonti", async () => {
    for (const scelta of [{ templateId: templateProprio.id }, { formato: 'docx' }]) {
      const r = await richiedi(
        'POST',
        `/api/conversazioni/${conversazioneId}/messaggi/${messaggioId}/esporta`,
        tokenAdmin,
        scelta,
      );
      expect(r.statusCode, JSON.stringify(scelta)).toBe(200);
      expect(r.headers['content-type']).toContain('wordprocessingml');
      expect(r.headers['content-disposition']).toBe('attachment; filename="carta-intestata.docx"');
      const testo = testoDocx(r.rawPayload);
      expect(testo).toContain('La garanzia Furto prevede uno scoperto del 10%.');
      expect(testo).toContain('Documento di prova — art. 12, p. 3');
      expect(testo).not.toContain('{{');
    }

    /* La carta intestata senza segnaposto: intestazione sua, testo e fonti in coda. */
    const intestata = await richiedi(
      'POST',
      `/api/conversazioni/${conversazioneId}/messaggi/${messaggioId}/esporta`,
      tokenAdmin,
      { templateId: templateSecondo.id },
    );
    expect(intestata.statusCode).toBe(200);
    const testo = testoDocx(intestata.rawPayload);
    expect(testo.indexOf('Agenzia di Collaudo — carta intestata')).toBeLessThan(testo.indexOf('La garanzia Furto'));
    expect(testo).toContain('Documento di prova — art. 12, p. 3');
    expect(testo).not.toContain('{{');
  });

  it("l'esportazione rifiuta ciò che non esiste o non si vede: 404, anche per l'operatore sull'altrui", async () => {
    const template = await richiedi(
      'POST',
      `/api/conversazioni/${conversazioneId}/messaggi/${messaggioId}/esporta`,
      tokenAdmin,
      { templateId: 'tpl-mai-visto' },
    );
    expect(template.statusCode).toBe(404);
    expect(template.json()).toMatchObject({ messaggio: 'Template inesistente.' });

    const altrui = await richiedi(
      'POST',
      `/api/conversazioni/${conversazioneId}/messaggi/${messaggioId}/esporta`,
      tokenOperatore,
      { formato: 'pdf' },
    );
    expect(altrui.statusCode).toBe(404);
    expect(altrui.json()).toMatchObject({ messaggio: 'Messaggio inesistente.' });
  });

  it('DELETE: il template sparisce da catalogo e Storage; un id ignoto è 404', async () => {
    const ignoto = await richiedi('DELETE', '/api/template/tpl-001', tokenAdmin);
    expect(ignoto.statusCode).toBe(404);

    for (const t of [templateProprio, templateSecondo]) {
      const r = await richiedi('DELETE', `/api/template/${t.id}`, tokenAdmin);
      expect(r.statusCode).toBe(204);
      expect(archivio.file.has(`tenant/${TENANT_COLLAUDO}/template/${t.id}.docx`)).toBe(false);
    }
    const elenco = await richiedi('GET', '/api/template', tokenAdmin);
    expect(elenco.json<TemplateOutput[]>()).toEqual([]);
  });


  it('ogni mutazione ha lasciato una voce nello storico (RF-D-07, la rotta arriva in Fase 6)', async () => {
    const r = await poolDb().query<{ azione: string; descrizione: string }>(
      `select azione, descrizione from velia.impostazioni_storico
       where tenant_id = $1 and oggetto = 'template' order by istante`,
      [TENANT_COLLAUDO],
    );
    const azioni = r.rows.map((v) => v.azione);
    expect(azioni).toContain('creazione');
    expect(azioni).toContain('modifica');
    expect(azioni).toContain('eliminazione');
    expect(r.rows.some((v) => v.descrizione.includes('identità visiva'))).toBe(true);
  });
});
