import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import {
  percorsoDocumentoGenerato,
  urlDocumentoGenerato,
  type AllegatoBozza,
  type BozzaEmail,
  type Conversazione,
  type Messaggio,
} from '../src/contratto/conversazioni.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import { risolviDestinatario } from '../src/email/destinatari.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import { creaStrumentiMotore } from '../src/worker/motore/strumenti.js';

/**
 * Le email dalla chat (14/09/2026) contro il progetto vero: a chi va
 * un'email detta a parole, lo strumento che ne prepara la bozza, e le rotte
 * che la correggono, la inviano e la annullano. L'invio è simulato
 * (`EMAIL_INVIO=simulato` in vitest.config.ts): qui conta che parta una
 * volta sola, anche con due clic, e che lasci una riga nel registro.
 *
 * Come le altre suite d'integrazione: worker di sviluppo fermo.
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
const TENANT = '22222222-2222-4222-8222-222222222222';
const EMAIL_ADMIN = 't.uno@collaudo.sonovelia.it';
const EMAIL_COLLEGA = 't.due@collaudo.sonovelia.it';
const CLIENTE_CON_EMAIL = 'Collaudo Posta Verdi';
const CLIENTE_SENZA_EMAIL = 'Collaudo Posta Neri';
const INDIRIZZO_CLIENTE = 'verdi.posta@collaudo.sonovelia.it';

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

describe.skipIf(!pronto)('Email dalla chat', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  let app: FastifyInstance;
  let token = '';
  let adminId = '';
  let convId = '';
  let rispostaId = '';
  const documento: AllegatoBozza = { id: randomUUID(), nome: 'Proposta di rinnovo', formato: 'pdf' };

  const richiedi = (metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method: metodo, url, headers: { authorization: `Bearer ${token}` }, ...(payload && { payload }) });

  /** Una bozza scritta come la scrive il worker: per il cliente con l'email, sulla risposta o su un altro messaggio. */
  async function bozza(opzioni: { messaggioId?: string; allegati?: AllegatoBozza[] } = {}): Promise<string> {
    const r = await pool().query<{ id: string }>(
      `insert into velia.email_bozze
         (tenant_id, conversazione_id, messaggio_id, destinatario_tipo, destinatario_id, destinatario_nome,
          a, oggetto, corpo, allegati)
       select $1, $2, $3, 'cliente', c.id, c.nome, c.email, 'Il rinnovo della sua RC Auto',
              'Gentile cliente, le confermo il rinnovo.', $4::jsonb
         from velia.clienti c
        where c.tenant_id = $1 and c.nome = $5
       returning id`,
      [TENANT, convId, opzioni.messaggioId ?? rispostaId, JSON.stringify(opzioni.allegati ?? []), CLIENTE_CON_EMAIL],
    );
    return r.rows[0]!.id;
  }

  const inviate = async (bozzaId: string): Promise<number> =>
    (await pool().query(`select 1 from velia.email_inviate where bozza_id = $1`, [bozzaId])).rowCount ?? 0;

  async function pulisci(): Promise<void> {
    await pool().query(`delete from velia.email_inviate where tenant_id = $1`, [TENANT]);
    await pool().query(`delete from velia.conversazioni where tenant_id = $1`, [TENANT]);
    await pool().query(`delete from velia.clienti where tenant_id = $1 and nome = any($2)`, [
      TENANT,
      [CLIENTE_CON_EMAIL, CLIENTE_SENZA_EMAIL],
    ]);
  }

  beforeAll(async () => {
    app = creaApp({ logger: false, conversazioni: { archivio } });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;
    adminId = (await pool().query<{ id: string }>(`select id from velia.utenti where email = $1`, [EMAIL_ADMIN])).rows[0]!.id;

    await pulisci();
    await pool().query(
      `insert into velia.clienti (tenant_id, nome, nome_normalizzato, email)
       values ($1, $2::text, velia.normalizza_nome($2::text), $3), ($1, $4::text, velia.normalizza_nome($4::text), null)`,
      [TENANT, CLIENTE_CON_EMAIL, INDIRIZZO_CLIENTE, CLIENTE_SENZA_EMAIL],
    );

    const nascita = await richiedi('POST', '/api/conversazioni', {});
    convId = nascita.json<Conversazione>().id;
    await pool().query(
      `insert into velia.messaggi (conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati)
       values ($1, $2, 'utente', $3, 'Prepara la mail per Verdi con la proposta', '{}')`,
      [convId, TENANT, adminId],
    );
    rispostaId = randomUUID();
    await pool().query(
      `insert into velia.messaggi
         (id, conversazione_id, tenant_id, autore, utente_id, testo, documenti_referenziati, documenti)
       values ($1, $2, $3, 'assistente', $4, 'La bozza è pronta qui sotto.', '{}', $5::jsonb)`,
      [rispostaId, convId, TENANT, adminId, JSON.stringify([{ ...documento, url: urlDocumentoGenerato(convId, documento.id) }])],
    );
    archivio.file.set(percorsoDocumentoGenerato(TENANT, documento.id, documento.formato), Buffer.from('%PDF-1.7 proposta'));
  });

  afterAll(async () => {
    await pulisci();
    await app.close();
    await chiudiPool();
  });

  it('a chi va: «me», un indirizzo, un collega, un cliente con la sua email; senza email non si indovina', async () => {
    const chi = { tenantId: TENANT, utenteId: adminId };

    expect(await risolviDestinatario(pool(), chi, 'me')).toMatchObject({
      esito: 'trovato',
      destinatario: { tipo: 'utente', id: adminId, a: EMAIL_ADMIN },
    });
    expect(await risolviDestinatario(pool(), chi, 'qualcuno@esempio.it')).toEqual({
      esito: 'trovato',
      destinatario: { tipo: 'indirizzo', a: 'qualcuno@esempio.it' },
    });

    const collega = (
      await pool().query<{ id: string; nome: string; cognome: string }>(
        `select id, nome, cognome from velia.utenti where email = $1`,
        [EMAIL_COLLEGA],
      )
    ).rows[0]!;
    expect(await risolviDestinatario(pool(), chi, `${collega.cognome} ${collega.nome}`)).toMatchObject({
      esito: 'trovato',
      destinatario: { tipo: 'utente', id: collega.id, a: EMAIL_COLLEGA },
    });

    expect(await risolviDestinatario(pool(), chi, CLIENTE_CON_EMAIL.toLowerCase())).toMatchObject({
      esito: 'trovato',
      destinatario: { tipo: 'cliente', nome: CLIENTE_CON_EMAIL, a: INDIRIZZO_CLIENTE },
    });
    const senza = await risolviDestinatario(pool(), chi, CLIENTE_SENZA_EMAIL);
    expect(senza.esito === 'non-trovato' ? senza.motivo : '').toContain('senza indirizzo email');
    expect(await risolviDestinatario(pool(), chi, 'Zzyzx Qwerty Inesistente')).toMatchObject({ esito: 'non-trovato' });
  });

  it('lo strumento prepara la bozza col destinatario risolto e gli allegati per nome; quando manca qualcosa lo dice al modello', async () => {
    const preparate: Array<Omit<BozzaEmail, 'id' | 'stato'>> = [];
    const strumenti = creaStrumentiMotore({
      db: pool(),
      archivio,
      tenantId: TENANT,
      conversazioneId: convId,
      messaggioId: randomUUID(),
      suDocumento: () => Promise.resolve(),
      email: {
        utenteId: adminId,
        suBozza: (b) => {
          preparate.push(b);
          return Promise.resolve({ ...b, id: 'bozza-finta', stato: 'bozza' });
        },
      },
    });
    expect(strumenti.nomi).toContain('mcp__velia__prepara_email');
    const prepara = strumenti.definizioni.find((d) => d.name === 'prepara_email')!;
    const testo = (r: Awaited<ReturnType<typeof prepara.handler>>): string =>
      r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');

    const pronta = await prepara.handler(
      { a: CLIENTE_CON_EMAIL, oggetto: 'Il rinnovo', corpo: 'Gentile cliente, in allegato la proposta.', allegati: ['rinnovo'] },
      {},
    );
    expect(pronta.isError).toBeFalsy();
    expect(testo(pronta)).toContain(`${CLIENTE_CON_EMAIL} <${INDIRIZZO_CLIENTE}>`);
    expect(testo(pronta)).toContain('non è ancora partita');
    const verdiId = (
      await pool().query<{ id: string }>(`select id from velia.clienti where tenant_id = $1 and nome = $2`, [
        TENANT,
        CLIENTE_CON_EMAIL,
      ])
    ).rows[0]!.id;
    expect(preparate).toEqual([
      {
        destinatario: { tipo: 'cliente', id: verdiId, nome: CLIENTE_CON_EMAIL, a: INDIRIZZO_CLIENTE },
        oggetto: 'Il rinnovo',
        corpo: 'Gentile cliente, in allegato la proposta.',
        allegati: [documento],
      },
    ]);

    const senzaFile = await prepara.handler({ a: 'me', oggetto: 'x', corpo: 'y', allegati: ['preventivo perso'] }, {});
    expect(senzaFile.isError).toBe(true);
    expect(testo(senzaFile)).toContain('Ci sono: «Proposta di rinnovo»');

    const senzaIndirizzo = await prepara.handler({ a: CLIENTE_SENZA_EMAIL, oggetto: 'x', corpo: 'y' }, {});
    expect(senzaIndirizzo.isError).toBe(true);
    expect(preparate).toHaveLength(1);
  });

  it('la bozza viaggia col messaggio, si corregge, parte una volta sola e lascia una riga nel registro', async () => {
    const id = await bozza({ allegati: [documento] });

    const filo = await richiedi('GET', `/api/conversazioni/${convId}/messaggi`);
    const risposta = filo.json<Messaggio[]>().find((m) => m.id === rispostaId)!;
    expect(risposta.email).toHaveLength(1);
    expect(risposta.email![0]).toMatchObject({
      id,
      stato: 'bozza',
      destinatario: { tipo: 'cliente', nome: CLIENTE_CON_EMAIL, a: INDIRIZZO_CLIENTE },
      allegati: [documento],
    });

    const corretta = await richiedi('PATCH', `/api/conversazioni/${convId}/email/${id}`, {
      oggetto: 'Il rinnovo, con la proposta',
    });
    expect(corretta.statusCode).toBe(200);
    expect(corretta.json<BozzaEmail>()).toMatchObject({
      oggetto: 'Il rinnovo, con la proposta',
      destinatario: { tipo: 'cliente', a: INDIRIZZO_CLIENTE },
    });

    const inviata = await richiedi('POST', `/api/conversazioni/${convId}/email/${id}/invio`, {});
    expect(inviata.statusCode).toBe(200);
    expect(inviata.json<BozzaEmail>()).toMatchObject({ stato: 'inviata', simulata: true });
    expect(Date.parse(inviata.json<BozzaEmail>().decisaIl ?? '')).not.toBeNaN();

    const registro = await pool().query(
      `select origine, a, oggetto, allegati, simulata, utente_id from velia.email_inviate where bozza_id = $1`,
      [id],
    );
    expect(registro.rows).toEqual([
      {
        origine: 'bozza',
        a: INDIRIZZO_CLIENTE,
        oggetto: 'Il rinnovo, con la proposta',
        allegati: ['Proposta di rinnovo.pdf'],
        simulata: true,
        utente_id: adminId,
      },
    ]);

    const ancora = await richiedi('POST', `/api/conversazioni/${convId}/email/${id}/invio`, {});
    expect(ancora.statusCode).toBe(409);
    expect(ancora.json<CorpoErroreApi>().codice).toBe('EMAIL_GIA_DECISA');
    expect((await richiedi('PATCH', `/api/conversazioni/${convId}/email/${id}`, { oggetto: 'Tardi' })).statusCode).toBe(409);
    expect((await richiedi('POST', `/api/conversazioni/${convId}/email/${id}/annulla`, {})).statusCode).toBe(409);
    expect(await inviate(id)).toBe(1);
  });

  it('due clic insieme spediscono una volta sola', async () => {
    const id = await bozza();
    const [primo, secondo] = await Promise.all([
      richiedi('POST', `/api/conversazioni/${convId}/email/${id}/invio`, {}),
      richiedi('POST', `/api/conversazioni/${convId}/email/${id}/invio`, {}),
    ]);
    expect([primo.statusCode, secondo.statusCode].sort()).toEqual([200, 409]);
    expect(await inviate(id)).toBe(1);
  });

  it('un indirizzo cambiato non è più il cliente, gli allegati si tolgono, e annullata non parte', async () => {
    const id = await bozza({ allegati: [documento] });

    const altra = await richiedi('PATCH', `/api/conversazioni/${convId}/email/${id}`, { a: 'altro@esempio.it', allegati: [] });
    expect(altra.statusCode).toBe(200);
    expect(altra.json<BozzaEmail>()).toMatchObject({ destinatario: { tipo: 'indirizzo', a: 'altro@esempio.it' }, allegati: [] });
    expect(altra.json<BozzaEmail>().destinatario.nome).toBeUndefined();

    const annullata = await richiedi('POST', `/api/conversazioni/${convId}/email/${id}/annulla`, {});
    expect(annullata.json<BozzaEmail>()).toMatchObject({ stato: 'annullata' });
    expect(Date.parse(annullata.json<BozzaEmail>().decisaIl ?? '')).not.toBeNaN();
    expect((await richiedi('POST', `/api/conversazioni/${convId}/email/${id}/invio`, {})).statusCode).toBe(409);
    expect(await inviate(id)).toBe(0);
  });

  it('non parte la bozza di una risposta non ancora salvata, né quella con un allegato sparito', async () => {
    const inVolo = await bozza({ messaggioId: randomUUID() });
    const r1 = await richiedi('POST', `/api/conversazioni/${convId}/email/${inVolo}/invio`, {});
    expect(r1.statusCode).toBe(409);
    expect(r1.json<CorpoErroreApi>().codice).toBe('RISPOSTA_IN_CORSO');

    const sparito = await bozza({ allegati: [{ id: randomUUID(), nome: 'Preventivo perso', formato: 'pdf' }] });
    const r2 = await richiedi('POST', `/api/conversazioni/${convId}/email/${sparito}/invio`, {});
    expect(r2.statusCode).toBe(409);
    expect(r2.json<CorpoErroreApi>().codice).toBe('ALLEGATO_SPARITO');

    expect(await inviate(inVolo)).toBe(0);
    expect(await inviate(sparito)).toBe(0);
  });

  it('nel registro finisce anche «Invia email» sotto una risposta', async () => {
    const r = await richiedi('POST', `/api/conversazioni/${convId}/messaggi/${rispostaId}/email`, { a: 'me' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ a: EMAIL_ADMIN, simulata: true });
    const registro = await pool().query(
      `select origine, a from velia.email_inviate where conversazione_id = $1 and origine = 'risposta'`,
      [convId],
    );
    expect(registro.rows).toEqual([{ origine: 'risposta', a: EMAIL_ADMIN }]);
  });
});
