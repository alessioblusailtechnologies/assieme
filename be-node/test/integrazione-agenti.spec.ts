import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import type { InterpretePiano, PianoGrezzo, RichiestaPiano } from '../src/api/agenti/interprete.js';
import { configurazione, type Configurazione } from '../src/config.js';
import type {
  Agente,
  AgenteRiepilogo,
  EsecuzioneAgente,
  EsecuzioneRiepilogo,
  LimitiAgenti,
} from '../src/contratto/agenti.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { Conversazione, Messaggio } from '../src/contratto/conversazioni.js';
import { creaGestoreAgenti } from '../src/worker/agenti/gestore.js';
import { creaGestoreInterrogazione } from '../src/worker/motore/gestore.js';
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
 * Gli agenti per intero, contro il progetto vero (tenant di collaudo, lettore
 * del piano e motore finti).
 *
 * Dal 14/09/2026: la richiesta coi riferimenti idratati, il piano scritto al
 * salvataggio coi destinatari risolti, la conferma che attiva e che un
 * destinatario sconosciuto blocca, nessuna esecuzione senza conferma, la
 * richiesta corretta che rimette il piano da confermare; e poi quello che
 * c'era: limiti (409 e 429), esito con citazioni validate, RF-E-08, retry
 * raccontato, il tick che accoda, la copia che non esegue.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const pronto = Boolean(
  config?.SUPABASE_JWT_SECRET && config.DATABASE_URL && !config.DATABASE_URL.includes('PASSWORD_MANCANTE'),
);

const PASSWORD_DEMO = 'velia-demo-2026!';
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';
const EMAIL_ADMIN = 't.uno@collaudo.sonovelia.it';
const DOC_FONTE = 'doc-priv-agt00000001';
const RICHIESTA = `Controlla le scadenze di @[documento:${DOC_FONTE}] e mandami l'esito per email.`;

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

/** Il lettore del piano a copione: legge la legenda dei riferimenti e manda l'esito «a me». */
class InterpreteFinto implements InterpretePiano {
  richieste: RichiestaPiano[] = [];
  risposta: (r: RichiestaPiano) => PianoGrezzo = (r) => ({
    obiettivo: `Tenere d’occhio ${r.nome}`,
    passi: [
      { tipo: 'leggi', titolo: 'Legge la polizza della flotta' },
      { tipo: 'invia-email', titolo: 'Manda l’esito per email' },
    ],
    letture: r.riferimenti.map((x) => ({
      tipo: 'documento' as const,
      etichetta: x.titolo,
      riferimento: `@[${x.tipo}:${x.chiave}]`,
    })),
    file: [],
    email: [{ a: 'me', contenuto: 'L’esito del controllo.', allegati: [] }],
    dubbi: [],
  });

  interpreta(r: RichiestaPiano): Promise<PianoGrezzo> {
    this.richieste.push(r);
    return Promise.resolve(this.risposta(r));
  }
}

/** Un motore a copione: legge dal prompt il path della prima fonte e risponde citandolo. */
class MotoreFinto implements Motore {
  richieste: RichiestaMotore[] = [];
  copione: (
    r: RichiestaMotore,
  ) => (Partial<EsitoSessione> & { testo: string }) | Promise<Partial<EsitoSessione> & { testo: string }> = (r) => ({
    testo:
      'Nessuna scadenza critica: la polizza in fonte è regolare.\n\n' +
      '```velia-citazioni\n' +
      JSON.stringify({
        citazioni: [{ file: pathFonte(r), pagina: 1, estratto: 'La polizza è in regola.' }],
        provenienze: [],
        nonSupportato: false,
      }) +
      '\n```',
  });

  async interroga(r: RichiestaMotore, _o: OsservatoreSessione): Promise<EsitoSessione> {
    this.richieste.push(r);
    const parziale = await this.copione(r);
    return {
      terminato: 'completato',
      modello: r.modello ?? 'finto',
      turni: 3,
      durataMs: 10,
      costoUsd: 0.02,
      token: { input: 100, output: 50, cacheLettura: 0, cacheScrittura: 0 },
      documentiLetti: [],
      ...parziale,
    };
  }
}

/* Il turno è quello della chat: i documenti del contesto stanno in fila come «- `path` - titolo». */
const pathFonte = (r: RichiestaMotore): string => /- `([^`]+)` - /.exec(r.promptUtente)?.[1] ?? '';

describe.skipIf(!pronto)('agenti col progetto Supabase (lettore e motore finti)', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  const motore = new MotoreFinto();
  const interprete = new InterpreteFinto();
  let app: FastifyInstance;
  let radice: string;
  let tokenAdmin: string;
  let idAdmin: string;
  let agenteId: string;
  let limitiOriginali: { limite_agenti_attivi: number; limite_esecuzioni_concorrenti: number };

  const richiedi = (metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({
      method: metodo,
      url,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      ...(payload && { payload }),
    });

  /* Il ritento aspetta di norma due secondi: qui no, o il ciclo si fermerebbe
     prima di vedere il secondo tentativo. */
  async function lavoraTutto(visibilitaSecondi = 30): Promise<void> {
    while (await lavoraUno(pool(), { visibilitaSecondi, ritentaTraSecondi: 0 })) {
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

  const prossima = async (id: string): Promise<Date | null> =>
    (
      await pool().query<{ prossima_esecuzione: Date | null }>(
        `select prossima_esecuzione from velia.agenti where id = $1`,
        [id],
      )
    ).rows[0]!.prossima_esecuzione;

  const pulizia = async (): Promise<void> => {
    await pool().query(`delete from velia.agenti where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.jobs where tipo = 'agente' and tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.consumi where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.email_inviate where tenant_id = $1`, [TENANT_COLLAUDO]);
    await pool().query(`delete from velia.documenti where id = $1`, [DOC_FONTE]);
  };

  beforeAll(async () => {
    radice = await mkdtemp(join(tmpdir(), 'velia-agenti-'));
    app = creaApp({ logger: false, agenti: { interprete } });
    await pulizia();

    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    tokenAdmin = accesso.json<EsitoAccesso>().tokenAccesso;
    idAdmin = accesso.json<EsitoAccesso>().sessione.utente.id;
    expect(tokenAdmin).toBeTruthy();

    /* L'agente lavora col turno della chat: lo stesso gestore, col motore finto. */
    gestori.agente = creaGestoreAgenti({
      interrogazione: creaGestoreInterrogazione({ motore, archivio, radice, attesaAllegatiMs: 1000 }),
    });

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

  it('l’agente nasce con la richiesta idratata e il piano da confermare, e non parte finché non è confermato', async () => {
    const r = await richiedi('POST', '/api/agenti', {
      nome: 'Controllo scadenze flotta',
      richiesta: RICHIESTA,
      pianificazione: { frequenza: 'giornaliera', orario: '07:30' },
    });
    expect(r.statusCode).toBe(201);
    const agente = r.json<Agente>();
    agenteId = agente.id;

    expect(agente.riferimenti).toEqual([
      { tipo: 'documento', chiave: DOC_FONTE, titolo: 'Polizza flotta aziendale', archivio: 'privato' },
    ]);
    expect(agente.pianoStato).toBe('da-confermare');
    expect(agente.bloccoConferma).toBeUndefined();
    expect(agente.piano?.letture[0]?.riferimento).toEqual({ tipo: 'documento', chiave: DOC_FONTE });
    expect(agente.piano?.email[0]?.destinatario).toMatchObject({ tipo: 'utente', id: idAdmin, a: EMAIL_ADMIN });
    expect(agente.creatoDa).toBe(idAdmin);

    /* Il lettore ha visto il titolo col suo marcatore, e quando corre. */
    const letta = interprete.richieste.at(-1)!;
    expect(letta.richiesta).toContain(`«Polizza flotta aziendale» @[documento:${DOC_FONTE}]`);
    expect(letta.quando).toBe('ogni giorno alle 07:30');

    expect(await prossima(agenteId)).toBeNull();
    const negata = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
    expect(negata.statusCode).toBe(409);
    expect(negata.json<CorpoErroreApi>().codice).toBe('PIANO_DA_CONFERMARE');
  });

  it('confermare attiva e calcola la prossima occorrenza; confermare di nuovo è un conflitto', async () => {
    const r = await richiedi('POST', `/api/agenti/${agenteId}/conferma`);
    expect(r.statusCode).toBe(200);
    const agente = r.json<Agente>();
    expect(agente).toMatchObject({ pianoStato: 'confermato', attivo: true });
    expect(Date.parse(agente.pianoConfermatoIl ?? '')).not.toBeNaN();
    expect(await prossima(agenteId)).not.toBeNull();

    const ancora = await richiedi('POST', `/api/agenti/${agenteId}/conferma`);
    expect(ancora.statusCode).toBe(409);
    expect(ancora.json<CorpoErroreApi>().codice).toBe('PIANO_GIA_CONFERMATO');
  });

  it('una lettura che non riesce lo dice; un destinatario che non si risolve blocca la conferma', async () => {
    const risposta = interprete.risposta;
    interprete.risposta = () => {
      throw new Error('modello non raggiungibile');
    };
    const nato = await richiedi('POST', '/api/agenti', { nome: 'Avvisi ai clienti', richiesta: 'Scrivi ai clienti.' });
    expect(nato.statusCode).toBe(201);
    const agente = nato.json<Agente>();
    expect(agente.pianoStato).toBe('non-letto');
    expect(agente.pianoErrore).toContain('Non sono riuscito a leggere la richiesta');
    expect((await richiedi('POST', `/api/agenti/${agente.id}/conferma`)).json<CorpoErroreApi>().codice).toBe(
      'PIANO_NON_LETTO',
    );

    interprete.risposta = (r) => ({ ...risposta(r), email: [{ a: 'Zzyzx Qwerty Inesistente', contenuto: 'x', allegati: [] }] });
    const riletto = await richiedi('POST', `/api/agenti/${agente.id}/piano`);
    expect(riletto.json<Agente>()).toMatchObject({ pianoStato: 'da-confermare' });
    expect(riletto.json<Agente>().pianoErrore).toBeUndefined();
    expect(riletto.json<Agente>().piano?.email[0]?.destinatario).toMatchObject({
      tipo: 'non-risolto',
      richiesto: 'Zzyzx Qwerty Inesistente',
    });
    expect(riletto.json<Agente>().bloccoConferma).toContain('«Zzyzx Qwerty Inesistente»');

    const bloccata = await richiedi('POST', `/api/agenti/${agente.id}/conferma`);
    expect(bloccata.statusCode).toBe(409);
    expect(bloccata.json<CorpoErroreApi>().codice).toBe('PIANO_BLOCCATO');

    interprete.risposta = risposta;
    expect((await richiedi('DELETE', `/api/agenti/${agente.id}`)).statusCode).toBe(204);
  });

  it('esecuzione manuale: job → esito con citazioni validate e un log che racconta', async () => {
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
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
    expect(messaggi).toContain('Aperta la conversazione dell’esecuzione, con 1 documento della richiesta.');

    /* Il turno è quello della chat: la richiesta e il piano sono la domanda,
       e le email si mandano solo ai destinatari del piano, per numero. */
    const turno = motore.richieste.at(-1)!;
    expect(turno.promptUtente).toContain('Controlla le scadenze di «Polizza flotta aziendale»');
    expect(turno.promptUtente).toContain('1. Legge la polizza della flotta');
    expect(turno.promptSistema).toContain(`1. Tea Collaudo <${EMAIL_ADMIN}>`);
    expect(turno.strumenti?.nomi).toContain('mcp__velia__invia_email');
    expect(turno.strumenti?.nomi).not.toContain('mcp__velia__prepara_email');

    /* La conversazione dell'esecuzione: dell'agente, con domanda e risposta. */
    expect(finita.conversazioneId).toBeTruthy();
    const filo = await richiedi('GET', `/api/conversazioni/${finita.conversazioneId}/messaggi`);
    expect(filo.json<Messaggio[]>().map((m) => m.autore)).toEqual(['utente', 'assistente']);
    const elencoChat = await richiedi('GET', '/api/conversazioni');
    expect(
      elencoChat.json<{ elementi: Conversazione[] }>().elementi.find((c) => c.id === finita.conversazioneId)?.agente,
    ).toEqual({ id: agenteId, nome: 'Controllo scadenze flotta' });

    const consumi = await pool().query<{ origine: string }>(`select origine from velia.consumi where tenant_id = $1`, [
      TENANT_COLLAUDO,
    ]);
    expect(consumi.rows).toEqual([{ origine: 'agente' }]);

    const elenco = await richiedi('GET', '/api/agenti');
    const riepilogo = elenco.json<{ elementi: AgenteRiepilogo[] }>().elementi.find((a) => a.id === agenteId)!;
    expect(riepilogo).toMatchObject({
      obiettivo: 'Tenere d’occhio Controllo scadenze flotta',
      pianoStato: 'confermato',
      ultimaEsecuzione: { stato: 'completata' },
    });
  });

  it('l’esecuzione manda l’email solo ai destinatari del piano, e una volta sola', async () => {
    const copione = motore.copione;
    const esiti: string[] = [];
    motore.copione = async (r) => {
      const invia = r.strumenti!.definizioni!.find((d) => d.name === 'invia_email')!;
      const testo = (x: Awaited<ReturnType<typeof invia.handler>>): string =>
        x.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
      esiti.push(testo(await invia.handler({ destinatario: 2, oggetto: 'Esito', corpo: 'x' }, {})));
      const email = { destinatario: 1, oggetto: 'Esito del controllo', corpo: 'La polizza è **regolare**.' };
      esiti.push(testo(await invia.handler(email, {})));
      esiti.push(testo(await invia.handler(email, {})));
      return copione(r);
    };
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
    const id = avvio.json<EsecuzioneAgente>().id;
    await aspettaJob(id);
    await lavoraTutto();
    motore.copione = copione;

    expect(esiti[0]).toContain('non è nel piano');
    expect(esiti[1]).toContain(`Email inviata a Tea Collaudo <${EMAIL_ADMIN}>`);
    expect(esiti[2]).toContain('era già partita');

    const finita = (await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${id}`)).json<EsecuzioneAgente>();
    expect(finita.stato).toBe('completata');
    expect(finita.email).toHaveLength(1);
    expect(finita.email[0]).toMatchObject({
      stato: 'inviata',
      simulata: true,
      oggetto: 'Esito del controllo',
      destinatario: { tipo: 'utente', a: EMAIL_ADMIN },
    });
    expect(finita.log.map((l) => l.messaggio).join(' | ')).toContain(`Email inviata a ${EMAIL_ADMIN} (simulata).`);

    const registro = await pool().query(`select origine, a, simulata from velia.email_inviate where esecuzione_id = $1`, [
      id,
    ]);
    expect(registro.rows).toEqual([{ origine: 'agente', a: EMAIL_ADMIN, simulata: true }]);
  });

  /*
   * RF-E-08 rivisto il 22/09/2026 (decisione del committente sulla chat, che
   * gli agenti condividono): una citazione non verificabile si scarta da
   * sola e l'esecuzione arriva in fondo, senza quella fonte.
   */
  it('RF-E-08: una citazione non verificabile si scarta, l’esecuzione arriva in fondo senza quella fonte', async () => {
    const copione = motore.copione;
    motore.copione = (r) => ({
      testo: `Inventato.\n\n\`\`\`velia-citazioni\n${JSON.stringify({
        citazioni: [{ file: pathFonte(r), pagina: 99, estratto: 'x' }],
        provenienze: [],
        nonSupportato: false,
      })}\n\`\`\``,
    });
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
    await aspettaJob(avvio.json<EsecuzioneAgente>().id);
    await lavoraTutto();
    motore.copione = copione;

    const r = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${avvio.json<EsecuzioneAgente>().id}`);
    const finita = r.json<EsecuzioneAgente>();
    expect(finita.stato).toBe('completata');
    expect(finita.citazioni).toEqual([]);
  });

  it('il retry si racconta: tre tentativi loggati, poi fallimento persistente (RF-E-11)', async () => {
    const copione = motore.copione;
    motore.copione = () => {
      throw new Error('provider non raggiungibile');
    };
    const avvio = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
    const esecuzioneId = avvio.json<EsecuzioneAgente>().id;
    await aspettaJob(esecuzioneId);
    await lavoraTutto(0); // visibilità zero: i tre tentativi si consumano subito
    motore.copione = copione;

    const r = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${esecuzioneId}`);
    const fallita = r.json<EsecuzioneAgente>();
    expect(fallita.stato).toBe('fallita');
    expect(fallita.tentativi).toBe(3);
    expect(fallita.errore).toContain('per tre tentativi consecutivi');
    const avvisi = fallita.log.filter((l) => l.livello === 'avviso').map((l) => l.messaggio);
    expect(avvisi).toEqual(['Nuovo tentativo (2 di 3).', 'Nuovo tentativo (3 di 3).']);
  });

  it('il tick accoda da sé i piani confermati, e l’esecuzione si dichiara pianificata', async () => {
    await pool().query(`update velia.agenti set prossima_esecuzione = now() - interval '1 minute' where id = $1`, [
      agenteId,
    ]);
    const tick = await pool().query<{ accodate: number }>(
      `select velia.accoda_agenti_pianificati($1, $2::uuid) as accodate`,
      [config!.CODA_LAVORI, TENANT_COLLAUDO],
    );
    expect(tick.rows[0]!.accodate).toBe(1);
    expect((await prossima(agenteId))!.getTime()).toBeGreaterThan(Date.now());

    await lavoraTutto();
    const storico = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni`);
    const pianificata = storico
      .json<{ elementi: EsecuzioneRiepilogo[] }>()
      .elementi.find((e) => e.modalita === 'pianificata')!;
    expect(pianificata.stato).toBe('completata');

    const piena = await richiedi('GET', `/api/agenti/${agenteId}/esecuzioni/${pianificata.id}`);
    expect(piena.json<EsecuzioneAgente>().log.map((l) => l.messaggio).join(' | ')).toContain(
      'Esecuzione pianificata avviata.',
    );
  });

  it('sospendere non tocca la conferma; cambiare quando corre la rimette; cambiare la richiesta la fa rileggere', async () => {
    const sospesa = await richiedi('PATCH', `/api/agenti/${agenteId}`, {
      pianificazione: { frequenza: 'giornaliera', orario: '07:30', sospesa: true },
    });
    expect(sospesa.json<Agente>()).toMatchObject({ pianoStato: 'confermato', pianificazione: { sospesa: true } });
    expect(await prossima(agenteId)).toBeNull();

    const settimanale = await richiedi('PATCH', `/api/agenti/${agenteId}`, {
      pianificazione: { frequenza: 'settimanale', orario: '07:30' },
    });
    expect(settimanale.json<Agente>()).toMatchObject({ pianoStato: 'da-confermare' });
    expect(settimanale.json<Agente>().piano?.obiettivo).toBe('Tenere d’occhio Controllo scadenze flotta');
    expect(await prossima(agenteId)).toBeNull();
    expect((await richiedi('POST', `/api/agenti/${agenteId}/conferma`)).statusCode).toBe(200);

    const letture = interprete.richieste.length;
    const nuova = await richiedi('PATCH', `/api/agenti/${agenteId}`, {
      richiesta: `Riassumi @[documento:${DOC_FONTE}] e mandamelo.`,
    });
    expect(interprete.richieste.length).toBe(letture + 1);
    expect(nuova.json<Agente>()).toMatchObject({ pianoStato: 'da-confermare' });
    expect(nuova.json<Agente>().pianoConfermatoIl).toBeUndefined();
    expect(interprete.richieste.at(-1)!.quando).toBe('ogni lunedì alle 07:30');

    /* Salvare la stessa richiesta non rilegge niente. */
    await richiedi('PATCH', `/api/agenti/${agenteId}`, { richiesta: `Riassumi @[documento:${DOC_FONTE}] e mandamelo.` });
    expect(interprete.richieste.length).toBe(letture + 1);
    expect((await richiedi('POST', `/api/agenti/${agenteId}/conferma`)).statusCode).toBe(200);
  });

  it('i limiti si applicano davvero: 409 oltre la soglia di agenti attivi', async () => {
    await pool().query(`update velia.tenant set limite_agenti_attivi = 1 where id = $1`, [TENANT_COLLAUDO]);
    const negato = await richiedi('POST', '/api/agenti', { nome: 'Secondo agente', richiesta: 'X.' });
    expect(negato.statusCode).toBe(409);
    expect(negato.json<CorpoErroreApi>().codice).toBe('LIMITE_AGENTI');

    const limiti = await richiedi('GET', '/api/agenti/limiti');
    expect(limiti.json<LimitiAgenti>()).toMatchObject({ agentiAttiviMax: 1, agentiAttivi: 1 });
  });

  it('esecuzioni concorrenti oltre il piano → 429 con ritentaTraSecondi', async () => {
    await pool().query(`update velia.tenant set limite_esecuzioni_concorrenti = 1 where id = $1`, [TENANT_COLLAUDO]);
    const prima = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
    expect(prima.statusCode).toBe(201);
    const seconda = await richiedi('POST', `/api/agenti/${agenteId}/esecuzioni`);
    expect(seconda.statusCode).toBe(429);
    expect(seconda.json()).toMatchObject({ codice: 'LIMITE_ESECUZIONI', ritentaTraSecondi: 20 });
    await aspettaJob(prima.json<EsecuzioneAgente>().id);
    await lavoraTutto();
  });

  it('duplica: la copia nasce disattiva, sospesa e col piano da confermare, e non esegue', async () => {
    const r = await richiedi('POST', `/api/agenti/${agenteId}/duplica`);
    expect(r.statusCode).toBe(201);
    const copia = r.json<Agente>();
    expect(copia).toMatchObject({ nome: 'Copia di Controllo scadenze flotta', attivo: false, pianoStato: 'da-confermare' });
    expect(copia.pianificazione?.sospesa).toBe(true);

    const negata = await richiedi('POST', `/api/agenti/${copia.id}/esecuzioni`);
    expect(negata.statusCode).toBe(409);
    expect(negata.json<CorpoErroreApi>().codice).toBe('AGENTE_DISATTIVO');

    const storicoCopia = await richiedi('GET', `/api/agenti/${copia.id}/esecuzioni`);
    expect(storicoCopia.json<{ elementi: unknown[] }>().elementi).toEqual([]);

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
