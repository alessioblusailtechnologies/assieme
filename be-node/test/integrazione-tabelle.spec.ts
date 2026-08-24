import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import type { PaginaTabelle, TabellaAnalisi } from '../src/contratto/tabelle.js';
import type { CriterioPredefinito } from '../src/contratto/tabelle.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { gestori } from '../src/worker/gestori.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import type {
  EsitoSessione,
  Motore,
  OsservatoreSessione,
  RichiestaMotore,
} from '../src/worker/motore/sessione.js';
import { creaGestoreTabelle } from '../src/worker/tabelle/gestore.js';

/**
 * Le tabelle di analisi per intero, contro il progetto vero (tenant di
 * collaudo, motore finto): creazione con celle in attesa → job → celle
 * pronte con citazioni validate; mutazioni a generazione conclusa che
 * riaprono la generazione; condivisione in sola lettura e duplica;
 * esportazione via Fase 4. Lo Storage è una mappa in memoria, il database è
 * quello vero: RLS compresa.
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

const DOC_A = 'doc-priv-tab00000001';
const DOC_B = 'doc-priv-tab00000002';
const DOC_LENTO = 'doc-priv-tab00000003';

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

/**
 * Un motore che estrae a copione: legge dal prompt il path del documento e
 * gli id delle colonne, e risponde con un blocco `velia-celle` costruito da
 * `cella(path, colonnaId)`.
 */
class MotoreFinto implements Motore {
  richieste: RichiestaMotore[] = [];
  cella: (path: string, colonnaId: string) => Record<string, unknown> = (path) => ({
    esito: 'presente',
    valore: 'Franchigia 250 €',
    citazioni: [{ file: path, pagina: 1, estratto: 'franchigia fissa di euro 250', sezione: 'Furto' }],
  });

  interroga(r: RichiestaMotore, _o: OsservatoreSessione): Promise<EsitoSessione> {
    this.richieste.push(r);
    const path = /Documento della riga: `([^`]+)`/.exec(r.promptUtente)?.[1] ?? '';
    const ids = [...r.promptUtente.matchAll(/\[id: ([0-9a-f-]{36})\]/g)].map((m) => m[1]!);
    const celle = ids.map((id) => ({ colonna: id, ...this.cella(path, id) }));
    return Promise.resolve({
      testo: `\`\`\`velia-celle\n${JSON.stringify({ celle })}\n\`\`\``,
      terminato: 'completato',
      modello: 'finto',
      turni: 2,
      durataMs: 5,
      costoUsd: 0.01,
      token: { input: 100, output: 50, cacheLettura: 0, cacheScrittura: 0 },
      documentiLetti: [path],
    });
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

describe.skipIf(!pronto)('tabelle di analisi col progetto Supabase (motore finto)', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  const motore = new MotoreFinto();
  let app: FastifyInstance;
  let radice: string;
  let tokenAdmin: string;
  let tokenOperatore: string;
  let tabellaId: string;

  const richiedi = (
    metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  async function aspettaJob(tabella: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const r = await pool().query(
        `select 1 from velia.jobs where tipo = 'tabella' and payload->>'tabellaId' = $1 and stato = 'in-coda'`,
        [tabella],
      );
      if (r.rowCount) return;
      await new Promise((res) => setTimeout(res, 100));
    }
    throw new Error(`job per la tabella ${tabella} mai accodato`);
  }

  const pulizia = async (): Promise<void> => {
    await pool().query(`delete from velia.tabelle where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.jobs where tipo = 'tabella' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.consumi where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.documenti where id = any($1)`, [[DOC_A, DOC_B, DOC_LENTO]]);
  };

  beforeAll(async () => {
    radice = await mkdtemp(join(tmpdir(), 'velia-tabelle-'));
    app = creaApp({ logger: false, tabelle: { archivio }, template: { archivio } });
    await pulizia();
    tokenAdmin = await accedi(app, EMAIL_ADMIN);
    tokenOperatore = await accedi(app, EMAIL_OPERATORE);
    expect(tokenAdmin).toBeTruthy();

    gestori.tabella = creaGestoreTabelle({ motore, archivio, radice });

    // Due privati pronti (uno con ramo Auto) e uno ancora in coda, coi loro .md nello Storage finto.
    const documenti: Array<[string, string, string | null, string]> = [
      [DOC_A, 'Polizza Rossi RC Auto', 'ram-auto', 'pronto'],
      [DOC_B, 'Preventivo Bianchi', null, 'pronto'],
      [DOC_LENTO, 'Nota in lavorazione', null, 'in-coda'],
    ];
    for (const [id, titolo, ramo, stato] of documenti) {
      const pathMd = `tenant/${TENANT_COLLAUDO}/documenti/${id}.md`;
      await pool().query(
        `insert into velia.documenti
           (id, archivio, tenant_id, titolo, tipologia, stato, numero_pagine, path_md, ramo_id, caricato_il, dimensione_byte)
         values ($1, 'privato', $2, $3, 'polizza', $4, 3, $5, $6, now(), 1000)`,
        [id, TENANT_COLLAUDO, titolo, stato, stato === 'pronto' ? pathMd : null, ramo],
      );
      archivio.file.set(
        pathMd,
        Buffer.from(`# ${titolo}\n\n[pag. 1]\n\nFurto: franchigia fissa di euro 250.\n\n[pag. 2]\n\nAltro.\n\n[pag. 3]\n\nFine.\n`),
      );
    }
  }, 60_000);

  afterAll(async () => {
    await pulizia();
    await app.close();
    await chiudiPool();
    await rm(radice, { recursive: true, force: true });
  });

  it('i criteri predefiniti: quelli di tutti i rami, più quelli del ramo dei documenti scelti', async () => {
    const generici = await richiedi('GET', '/api/tabelle/criteri', tokenAdmin);
    expect(generici.statusCode).toBe(200);
    const idGenerici = generici.json<CriterioPredefinito[]>().map((c) => c.id);
    expect(idGenerici).toContain('crit-massimali');
    expect(idGenerici).not.toContain('crit-auto-cristalli');

    const auto = await richiedi('GET', `/api/tabelle/criteri?documenti=${DOC_A},${DOC_B}`, tokenAdmin);
    const idAuto = auto.json<CriterioPredefinito[]>().map((c) => c.id);
    expect(idAuto).toContain('crit-auto-cristalli');
    expect(idAuto).not.toContain('crit-casa-furto');
  });

  it('la tabella nasce con le celle in attesa e il titolo ricavato dal ramo', async () => {
    const r = await richiedi('POST', '/api/tabelle', tokenAdmin, {
      documentiIds: [DOC_A, DOC_B],
      colonne: [
        { intestazione: 'Franchigia furto e incendio', origine: 'predefinita' },
        { intestazione: 'Cristalli', origine: 'personalizzata', criterio: 'massimale della garanzia cristalli' },
      ],
    });
    expect(r.statusCode).toBe(201);
    const tabella = r.json<TabellaAnalisi>();
    tabellaId = tabella.id;
    expect(tabella.stato).toBe('in-generazione');
    expect(tabella.titolo.startsWith('Confronto ')).toBe(true);
    expect(tabella.colonne).toHaveLength(2);
    expect(tabella.righe.map((x) => x.etichetta)).toEqual(['Polizza Rossi RC Auto', 'Preventivo Bianchi']);
    for (const riga of tabella.righe) {
      for (const colonna of tabella.colonne) {
        expect(riga.celle[colonna.id]).toEqual({ stato: 'in-attesa' });
      }
    }
  });

  it('documenti sbagliati: inesistente → 404, non pronto → 409, corpo vuoto → 400', async () => {
    const inesistente = await richiedi('POST', '/api/tabelle', tokenAdmin, {
      documentiIds: ['doc-priv-mai-visto'],
      colonne: [{ intestazione: 'X', origine: 'personalizzata' }],
    });
    expect(inesistente.statusCode).toBe(404);

    const nonPronto = await richiedi('POST', '/api/tabelle', tokenAdmin, {
      documentiIds: [DOC_LENTO],
      colonne: [{ intestazione: 'X', origine: 'personalizzata' }],
    });
    expect(nonPronto.statusCode).toBe(409);
    expect(nonPronto.json()).toMatchObject({ codice: 'NON_PRONTO' });
  });

  it('il worker riempie le celle un documento alla volta, con citazioni validate e consumi per riga', async () => {
    await aspettaJob(tabellaId);
    await lavoraTutto();

    const r = await richiedi('GET', `/api/tabelle/${tabellaId}`, tokenAdmin);
    const tabella = r.json<TabellaAnalisi>();
    expect(tabella.stato).toBe('completa');
    const cella = tabella.righe[0]!.celle[tabella.colonne[0]!.id]!;
    expect(cella).toMatchObject({ stato: 'pronta', esito: 'presente', valore: 'Franchigia 250 €' });
    if (cella.stato === 'pronta' && cella.esito === 'presente') {
      expect(cella.citazioni[0]).toMatchObject({
        documentoId: DOC_A,
        documentoTitolo: 'Polizza Rossi RC Auto',
        archivio: 'privato',
        posizione: { pagina: 1, sezione: 'Furto' },
      });
    }
    // Una sessione per documento («per gruppi per documento»), non per cella.
    expect(motore.richieste).toHaveLength(2);
    const consumi = await pool().query<{ n: number }>(
      `select count(*)::int as n from velia.consumi where tenant_id = $1`,
      [TENANT_COLLAUDO],
    );
    expect(consumi.rows[0]!.n).toBe(2);
  });

  it('una colonna aggiunta riapre la generazione; un valore senza fonte verificabile si scarta', async () => {
    motore.cella = (path) =>
      path.includes(DOC_B)
        ? { esito: 'presente', valore: 'Inventato', citazioni: [{ file: path, pagina: 99, estratto: 'x' }] }
        : { esito: 'non-presente', nota: 'Il documento non tratta questo aspetto.' };

    const r = await richiedi('POST', `/api/tabelle/${tabellaId}/colonne`, tokenAdmin, {
      intestazione: 'Eventi atmosferici',
      origine: 'predefinita',
    });
    expect(r.statusCode).toBe(200);
    const dopo = r.json<TabellaAnalisi>();
    expect(dopo.stato).toBe('in-generazione');
    const nuova = dopo.colonne.at(-1)!;
    expect(dopo.righe[0]!.celle[nuova.id]).toEqual({ stato: 'in-attesa' });

    await aspettaJob(tabellaId);
    await lavoraTutto();

    const finita = (await richiedi('GET', `/api/tabelle/${tabellaId}`, tokenAdmin)).json<TabellaAnalisi>();
    expect(finita.stato).toBe('completa');
    expect(finita.righe[0]!.celle[nuova.id]).toMatchObject({ esito: 'non-presente' });
    expect(finita.righe[1]!.celle[nuova.id]).toMatchObject({ esito: 'non-determinabile' });
  });

  it('righe e colonne si tolgono, e la rimozione di un documento non lascia celle orfane', async () => {
    const senzaRiga = (
      await richiedi('DELETE', `/api/tabelle/${tabellaId}/documenti/${DOC_B}`, tokenAdmin)
    ).json<TabellaAnalisi>();
    expect(senzaRiga.righe.map((x) => x.documentoId)).toEqual([DOC_A]);

    const colonnaVia = senzaRiga.colonne.at(-1)!.id;
    const senzaColonna = (
      await richiedi('DELETE', `/api/tabelle/${tabellaId}/colonne/${colonnaVia}`, tokenAdmin)
    ).json<TabellaAnalisi>();
    expect(senzaColonna.colonne.map((x) => x.id)).not.toContain(colonnaVia);
    expect(Object.keys(senzaColonna.righe[0]!.celle)).not.toContain(colonnaVia);

    const celle = await pool().query<{ n: number }>(
      `select count(*)::int as n from velia.tabelle_celle where tabella_id = $1`,
      [tabellaId],
    );
    expect(celle.rows[0]!.n).toBe(senzaColonna.colonne.length * senzaColonna.righe.length);
  });

  it('condivisione in sola lettura: il collega vede, non tocca, duplica (RF-C-15)', async () => {
    const negato = await richiedi('GET', `/api/tabelle/${tabellaId}`, tokenOperatore);
    expect(negato.statusCode).toBe(404); // non condivisa: per il collega non esiste

    await richiedi('PATCH', `/api/tabelle/${tabellaId}`, tokenAdmin, { titolo: 'Confronto RC Auto', condivisa: true });

    const visibile = await richiedi('GET', `/api/tabelle/${tabellaId}`, tokenOperatore);
    expect(visibile.statusCode).toBe(200);
    expect(visibile.json<TabellaAnalisi>().titolo).toBe('Confronto RC Auto');

    const modifica = await richiedi('PATCH', `/api/tabelle/${tabellaId}`, tokenOperatore, { titolo: 'Mio' });
    expect(modifica.statusCode).toBe(403);
    const aggiunta = await richiedi('POST', `/api/tabelle/${tabellaId}/colonne`, tokenOperatore, {
      intestazione: 'X',
      origine: 'personalizzata',
    });
    expect(aggiunta.statusCode).toBe(403);

    const duplicata = await richiedi('POST', `/api/tabelle/${tabellaId}/duplica`, tokenOperatore);
    expect(duplicata.statusCode).toBe(201);
    const copia = duplicata.json<TabellaAnalisi>();
    expect(copia.titolo).toBe('Copia di Confronto RC Auto');
    expect(copia.condivisa).toBe(false);
    expect(copia.stato).toBe('completa'); // le celle pronte viaggiano con la copia
    expect(copia.righe[0]!.celle[copia.colonne[0]!.id]).toMatchObject({ stato: 'pronta' });

    const elenco = (await richiedi('GET', '/api/tabelle', tokenOperatore)).json<PaginaTabelle>();
    expect(elenco.elementi.map((t) => t.id).sort()).toEqual([tabellaId, copia.id].sort());
    expect(elenco.elementi.find((t) => t.id === tabellaId)?.numeroColonne).toBe(2);

    const via = await richiedi('DELETE', `/api/tabelle/${copia.id}`, tokenOperatore);
    expect(via.statusCode).toBe(204);
  });

  it("l'esportazione passa dalla Fase 4: XLSX su colonne vere, nome file dal titolo della tabella", async () => {
    const r = await richiedi('POST', `/api/tabelle/${tabellaId}/esporta`, tokenAdmin, { templateId: 'tpl-004' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toBe('attachment; filename="confronto-rc-auto.xlsx"');

    const cartella = new ExcelJS.Workbook();
    await cartella.xlsx.load(r.rawPayload as unknown as ExcelJS.Buffer);
    const valori: string[][] = [];
    cartella.getWorksheet('Analisi')!.eachRow((riga) => {
      valori.push([riga.getCell(1).text, riga.getCell(2).text]);
    });
    expect(valori).toContainEqual(['Documento', 'Franchigia furto e incendio']);
    expect(valori).toContainEqual(['Polizza Rossi RC Auto', 'Franchigia 250 €']);

    const pdf = await richiedi('POST', `/api/tabelle/${tabellaId}/esporta`, tokenAdmin, { templateId: 'tpl-001' });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const ignoto = await richiedi('POST', `/api/tabelle/${tabellaId}/esporta`, tokenAdmin, { templateId: 'tpl-boh' });
    expect(ignoto.statusCode).toBe(404);
    expect(ignoto.json()).toMatchObject({ messaggio: 'Template inesistente.' });
  });

  it('un id malformato è un 404, non un errore SQL; DELETE → 204 e la tabella sparisce', async () => {
    const malformato = await richiedi('GET', '/api/tabelle/tab-001', tokenAdmin);
    expect(malformato.statusCode).toBe(404);
    expect(malformato.json()).toMatchObject({ codice: 'NON_TROVATA' });

    const via = await richiedi('DELETE', `/api/tabelle/${tabellaId}`, tokenAdmin);
    expect(via.statusCode).toBe(204);
    const righe = await pool().query<{ n: number }>(
      `select count(*)::int as n from velia.tabelle_righe where tabella_id = $1`,
      [tabellaId],
    );
    expect(righe.rows[0]!.n).toBe(0);
  });
});
