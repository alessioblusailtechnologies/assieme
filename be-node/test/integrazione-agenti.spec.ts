import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import PizZip from 'pizzip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type {
  Agente,
  AgenteRiepilogo,
  EsecuzioneAgente,
  EsecuzioneRiepilogo,
  LimitiAgenti,
} from '../src/contratto/agenti.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { creaGestoreAgenti } from '../src/worker/agenti/gestore.js';
import { lavoraUno } from '../src/worker/ciclo.js';
import { gestori } from '../src/worker/gestori.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import type {
  EsitoSessione,
  Motore,
  OsservatoreSessione,
  RichiestaMotore,
} from '../src/worker/motore/sessione.js';

/**
 * Gli agenti per intero, contro il progetto vero (tenant di collaudo,
 * motore finto): CRUD con fonti idratate, limiti applicati davvero (409 e
 * 429), esecuzione manuale con parametri → job → esito con citazioni
 * validate e log che racconta, RF-E-08 (citazione non verificabile = fallita),
 * retry raccontato fino al fallimento persistente, il tick della
 * pianificazione che accoda, il documento su template dallo storico.
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
const DOC_FONTE = 'doc-priv-agt00000001';

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

/** Un motore a copione: legge dal prompt il path della prima fonte e risponde citandolo. */
class MotoreFinto implements Motore {
  richieste: RichiestaMotore[] = [];
  copione: (r: RichiestaMotore) => Partial<EsitoSessione> & { testo: string } = (r) => {
    const path = /- `([^`]+)` —/.exec(r.promptUtente)?.[1] ?? '';
    return {
      testo:
        'Nessuna scadenza critica: la polizza in fonte è regolare.\n\n' +
        '```velia-citazioni\n' +
        JSON.stringify({
          citazioni: [{ file: path, pagina: 1, estratto: 'La polizza è in regola.' }],
          provenienze: [],
          nonSupportato: false,
        }) +
        '\n```',
    };
  };

  interroga(r: RichiestaMotore, _o: OsservatoreSessione): Promise<EsitoSessione> {
    this.richieste.push(r);
    const parziale = this.copione(r);
    return Promise.resolve({
      terminato: 'completato',
      modello: r.modello ?? 'finto',
      turni: 3,
      durataMs: 10,
      costoUsd: 0.02,
      token: { input: 100, output: 50, cacheLettura: 0, cacheScrittura: 0 },
      documentiLetti: [],
      ...parziale,
    });
  }
}

describe.skipIf(!pronto)('agenti col progetto Supabase (motore finto)', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  const motore = new MotoreFinto();
  let app: FastifyInstance;
  let radice: string;
  let tokenAdmin: string;
  let idAdmin: string;
  let agenteId: string;
  let limitiOriginali: { limite_agenti_attivi: number; limite_esecuzioni_concorrenti: number };

  const richiedi = (
    metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${tokenAdmin}` }, ...(payload && { payload }) });

  async function lavoraTutto(visibilitaSecondi = 30): Promise<void> {
    while (await lavoraUno(pool(), { visibilitaSecondi })) {
      /* ancora */
    }
  }

  async function aspettaJob(esecuzioneId: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      const r = await pool().query(
        `select 1 from velia.jobs where tipo = 'agente' and payload->>'esecuzioneId' = $1`,
        [esecuzioneId],
      );
      if (r.rowCount) return;
      await new Promise((res) => setTimeout(res, 100));
    }
    throw new Error(`job per l'esecuzione ${esecuzioneId} mai accodato`);
  }

  const pulizia = async (): Promise<void> => {
    await pool().query(`delete from velia.agenti where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.jobs where tipo = 'agente' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.consumi where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.documenti where id = $1`, [DOC_FONTE]);
  };

  beforeAll(async () => {
    radice = await mkdtemp(join(tmpdir(), 'velia-agenti-'));
    app = creaApp({ logger: false, agenti: { archivio }, template: { archivio } });
    await pulizia();

    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.uno@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    tokenAdmin = accesso.json<EsitoAccesso>().tokenAccesso;
    idAdmin = accesso.json<EsitoAccesso>().sessione.utente.id;
    expect(tokenAdmin).toBeTruthy();

    gestori.agente = creaGestoreAgenti({ motore, archivio, radice });

    const limiti = await pool().query<typeof limitiOriginali>(
      `select limite_agenti_attivi, limite_esecuzioni_concorrenti from velia.tenant where id = $1`,
      [TENANT_COLLAUDO],
    );
    limitiOriginali = limiti.rows[0]!;

    const pathMd = `tenant/${TENANT_COLLAUDO}/documenti/${DOC_FONTE}.md`;
    await pool().query(
      `insert into velia.documenti
         (id, archivio, tenant_id, titolo, tipologia, stato, numero_pagine, path_md, ramo_id,
          caricato_il, dimensione_byte)
       values ($1, 'privato', $2, 'Polizza flotta aziendale', 'polizza', 'pronto', 2, $3, 'ram-auto', now(), 5000)`,
      [DOC_FONTE, TENANT_COLLAUDO, pathMd],
    );
    archivio.file.set(pathMd, Buffer.from('# Polizza flotta\n\n[pag. 1]\n\nLa polizza è in regola.\n\n[pag. 2]\n\nFine.\n'));
  }, 60_000);

  afterAll(async () => {
    await pool().query(
      `update velia.tenant set limite_agenti_attivi = $2, limite_esecuzioni_concorrenti = $3 where id = $1`,
      [TENANT_COLLAUDO, limitiOriginali.limite_agenti_attivi, limitiOriginali.limite_esecuzioni_concorrenti],
    );
    await pulizia();
    await app.close();
    await chiudiPool();
    await rm(radice, { recursive: true, force: true });
  });

  it('l’agente nasce con fonti idratate, pianificazione e prossima occorrenza calcolata', async () => {
    const r = await richiedi('POST', '/api/agenti', {
      nome: 'Controllo scadenze flotta',
      descrizione: 'Controlla le scadenze delle polizze della flotta.',
      istruzioni: 'Controlla le scadenze e segnala ciò che scade entro 60 giorni.',
      fonti: [{ tipo: 'selezione', archivio: 'privato' }],
      formatoOutput: 'testo',
      templateOutputId: 'tpl-002',
      parametri: [
        { chiave: 'polizza', etichetta: 'Polizza da controllare', tipo: 'documento', obbligatorio: true },
      ],
      pianificazione: { frequenza: 'giornaliera', orario: '07:30' },
    });
    expect(r.statusCode).toBe(201);
    const agente = r.json<Agente>();
    agenteId = agente.id;
    expect(agente.fonti[0]).toMatchObject({ tipo: 'selezione', etichetta: 'Archivio Privato — tutto' });
    expect(agente.pianificazione).toMatchObject({ frequenza: 'giornaliera', orario: '07:30', sospesa: false });
    expect(agente.creatoDa).toBe(idAdmin);

    const prossima = await pool().query<{ prossima_esecuzione: Date | null }>(
      `select prossima_esecuzione from velia.agenti where id = $1`,
      [agenteId],
    );
    expect(prossima.rows[0]!.prossima_esecuzione).not.toBeNull();
  });

  it('i limiti si applicano davvero: 409 oltre la soglia di agenti attivi', async () => {
    await pool().query(`update velia.tenant set limite_agenti_attivi = 1 where id = $1`, [TENANT_COLLAUDO]);
    const negato = await richiedi('POST', '/api/agenti', {
      nome: 'Secondo agente',
      istruzioni: 'X.',
      fonti: [{ tipo: 'documenti-riferimento' }],
    });
    expect(negato.statusCode).toBe(409);
    expect(negato.json()).toMatchObject({ codice: 'LIMITE_AGENTI' });

    const limiti = await richiedi('GET', '/api/agenti/limiti');
    expect(limiti.json<LimitiAgenti>()).toMatchObject({ agentiAttiviMax: 1, agentiAttivi: 1 });
  });

  it('l’avvio valida i parametri: obbligatorio mancante → 400, documento inesistente → 400', async () => {
    const mancante = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, {});
    expect(mancante.statusCode).toBe(400);
    expect(mancante.json()).toMatchObject({ codice: 'PARAMETRI_MANCANTI' });

    const ignoto = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, {
      parametri: { polizza: 'doc-priv-mai-visto' },
    });
    expect(ignoto.statusCode).toBe(400);
    expect(ignoto.json()).toMatchObject({ codice: 'PARAMETRO_NON_VALIDO' });
  });

  it('esecuzione manuale: job → esito con citazioni validate, log che racconta, documento su template', async () => {
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, {
      parametri: { polizza: DOC_FONTE },
    });
    expect(avvio.statusCode).toBe(201);
    const esecuzione = avvio.json<EsecuzioneAgente>();
    expect(esecuzione.stato).toBe('in-coda');

    await aspettaJob(esecuzione.id);
    await lavoraTutto();

    const r = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${esecuzione.id}`);
    const finita = r.json<EsecuzioneAgente>();
    expect(finita.stato).toBe('completata');
    expect(finita.tentativi).toBe(1);
    expect(finita.output).toContain('Nessuna scadenza critica');
    expect(finita.citazioni[0]).toMatchObject({
      documentoId: DOC_FONTE,
      documentoTitolo: 'Polizza flotta aziendale',
      posizione: { pagina: 1 },
    });
    const messaggi = finita.log.map((l) => l.messaggio).join(' | ');
    expect(messaggi).toContain('Esecuzione manuale avviata da Tea Collaudo.');
    expect(messaggi).toContain('Parametro polizza = «Polizza flotta aziendale».');
    expect(messaggi).toContain('Raccolte le fonti');
    expect(messaggi).toContain('Documento generato sul template');
    expect(finita.documentoGeneratoUrl).toBe(`/api/agenti/${agenteId}/esecuzioni/${esecuzione.id}/documento`);
    // Il prompt portava il parametro e la fonte risolta, e i consumi sono origine 'agente'.
    expect(motore.richieste[0]!.promptUtente).toContain('il documento «Polizza flotta aziendale»');
    const consumi = await pool().query<{ origine: string }>(
      `select origine from velia.consumi where tenant_id = $1`,
      [TENANT_COLLAUDO],
    );
    expect(consumi.rows).toEqual([{ origine: 'agente' }]);

    const documento = await richiedi('GET', finita.documentoGeneratoUrl!);
    expect(documento.statusCode).toBe(200);
    expect(documento.headers['content-type']).toContain('wordprocessingml');
    const testo = new PizZip(documento.rawPayload).files['word/document.xml']!.asText().replace(/<[^>]+>/g, '');
    expect(testo).toContain('Nessuna scadenza critica');

    const elenco = await richiedi('GET', '/api/agenti');
    const riepilogo = elenco.json<{ elementi: AgenteRiepilogo[] }>().elementi.find((a) => a.id === agenteId)!;
    expect(riepilogo.ultimaEsecuzione).toMatchObject({ stato: 'completata', documentoGeneratoUrl: finita.documentoGeneratoUrl });
  });

  it('RF-E-08: un esito che cita passaggi non verificabili è un’esecuzione fallita', async () => {
    motore.copione = (r) => {
      const path = /- `([^`]+)` —/.exec(r.promptUtente)?.[1] ?? '';
      return {
        testo: `Inventato.\n\n\`\`\`velia-citazioni\n${JSON.stringify({
          citazioni: [{ file: path, pagina: 99, estratto: 'x' }],
          provenienze: [],
          nonSupportato: false,
        })}\n\`\`\``,
      };
    };
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, {
      parametri: { polizza: DOC_FONTE },
    });
    await aspettaJob(avvio.json<EsecuzioneAgente>().id);
    await lavoraTutto();

    const r = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${avvio.json<EsecuzioneAgente>().id}`);
    const fallita = r.json<EsecuzioneAgente>();
    expect(fallita.stato).toBe('fallita');
    expect(fallita.tentativi).toBe(1); // un'allucinazione non si ritenta
    expect(fallita.errore).toContain('verifica delle fonti');
    expect(fallita.documentoGeneratoUrl).toBeUndefined();
  });

  it('il retry si racconta: tre tentativi loggati, poi fallimento persistente (RF-E-11)', async () => {
    motore.copione = () => {
      throw new Error('provider non raggiungibile');
    };
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, {
      parametri: { polizza: DOC_FONTE },
    });
    const esecuzioneId = avvio.json<EsecuzioneAgente>().id;
    await aspettaJob(esecuzioneId);
    await lavoraTutto(0); // visibilità zero: i tre tentativi si consumano subito

    const r = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${esecuzioneId}`);
    const fallita = r.json<EsecuzioneAgente>();
    expect(fallita.stato).toBe('fallita');
    expect(fallita.tentativi).toBe(3);
    expect(fallita.errore).toContain('per tre tentativi consecutivi');
    const avvisi = fallita.log.filter((l) => l.livello === 'avviso').map((l) => l.messaggio);
    expect(avvisi).toEqual(['Nuovo tentativo (2 di 3).', 'Nuovo tentativo (3 di 3).']);

    motore.copione = (richiesta) => {
      const path = /- `([^`]+)` —/.exec(richiesta.promptUtente)?.[1] ?? '';
      return {
        testo: `Ok.\n\n\`\`\`velia-citazioni\n${JSON.stringify({
          citazioni: [{ file: path, pagina: 1, estratto: 'ok' }],
          provenienze: [],
          nonSupportato: false,
        })}\n\`\`\``,
      };
    };
  });

  it('il tick della pianificazione accoda da sé, e l’esecuzione si dichiara pianificata', async () => {
    await pool().query(`update velia.agenti set prossima_esecuzione = now() - interval '1 minute' where id = $1`, [
      agenteId,
    ]);
    const tick = await pool().query<{ accodate: number }>(`select velia.accoda_agenti_pianificati() as accodate`);
    expect(tick.rows[0]!.accodate).toBe(1);

    const prossima = await pool().query<{ prossima_esecuzione: Date }>(
      `select prossima_esecuzione from velia.agenti where id = $1`,
      [agenteId],
    );
    expect(prossima.rows[0]!.prossima_esecuzione.getTime()).toBeGreaterThan(Date.now());

    await lavoraTutto();
    const storico = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni`);
    const pianificata = storico.json<{ elementi: EsecuzioneRiepilogo[] }>().elementi.find((e) => e.modalita === 'pianificata')!;
    expect(pianificata.stato).toBe('completata');

    const piena = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${pianificata.id}`);
    expect(piena.json<EsecuzioneAgente>().log.map((l) => l.messaggio).join(' | ')).toContain(
      'Esecuzione pianificata avviata.',
    );
  });

  it('esecuzioni concorrenti oltre il piano → 429 con ritentaTraSecondi', async () => {
    await pool().query(`update velia.tenant set limite_esecuzioni_concorrenti = 1 where id = $1`, [TENANT_COLLAUDO]);
    const prima = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, { parametri: { polizza: DOC_FONTE } });
    expect(prima.statusCode).toBe(201);
    const seconda = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`, { parametri: { polizza: DOC_FONTE } });
    expect(seconda.statusCode).toBe(429);
    expect(seconda.json()).toMatchObject({ codice: 'LIMITE_ESECUZIONI', ritentaTraSecondi: 20 });
    await aspettaJob(prima.json<EsecuzioneAgente>().id);
    await lavoraTutto();
  });

  it('duplica: la copia nasce disattiva, con la pianificazione sospesa, e non esegue', async () => {
    const r = await richiedi('POST', `/api/agenti/${agenteId}/duplica`);
    expect(r.statusCode).toBe(201);
    const copia = r.json<Agente>();
    expect(copia).toMatchObject({ nome: 'Copia di Controllo scadenze flotta', attivo: false });
    expect(copia.pianificazione?.sospesa).toBe(true);

    const negata = await richiedi('POST', `/api/agenti/${copia.id}/esecuzioni`, { parametri: { polizza: DOC_FONTE } });
    expect(negata.statusCode).toBe(409);
    expect(negata.json()).toMatchObject({ codice: 'AGENTE_DISATTIVO' });

    const storicoCopia = await richiedi('GET', `/api/agenti/${copia.id}/esecuzioni`);
    expect(storicoCopia.json<{ elementi: unknown[] }>().elementi).toEqual([]); // senza storico

    expect((await richiedi('DELETE', `/api/agenti/${copia.id}`)).statusCode).toBe(204);
  });

  it('un id malformato è un 404, non un errore SQL; DELETE porta via anche lo storico', async () => {
    expect((await richiedi('GET', '/api/agenti/agt-001')).statusCode).toBe(404);
    expect((await richiedi('DELETE', `/api/agenti/${agenteId}`)).statusCode).toBe(204);
    const esecuzioni = await pool().query<{ n: number }>(
      `select count(*)::int as n from velia.agenti_esecuzioni where tenant_id = $1`,
      [TENANT_COLLAUDO],
    );
    expect(esecuzioni.rows[0]!.n).toBe(0);
  });
});
