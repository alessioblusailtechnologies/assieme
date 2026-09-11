import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import { percorsoDocumentoGenerato, type Conversazione } from '../src/contratto/conversazioni.js';
import type { LinkDocumento } from '../src/contratto/pagine.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';

/**
 * Le pagine condivise col progetto Supabase (fase 2 di
 * `PIANO-LINK-E-FORMATI.md`): l'agenzia crea, cambia e revoca il link di un
 * documento generato; il cliente lo apre senza credenziali, isolato; un
 * link scaduto o revocato non apre niente, sempre con la stessa pagina.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}
const pronto = Boolean(config?.SUPABASE_JWT_SECRET && config.DATABASE_URL && !config.DATABASE_URL.includes('PASSWORD_MANCANTE'));

const PASSWORD_DEMO = 'velia-demo-2026!';
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';
const BASE = 'https://pagine.prova';

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

const PAGINA = '<!doctype html><html lang="it"><body><h1>Scudo Cyber</h1><script>document.title = "ok"</script></body></html>';

describe.skipIf(!pronto)('le pagine condivise col progetto Supabase', () => {
  let app: FastifyInstance;
  let token: string;
  let conversazione: Conversazione;
  const archivio = new ArchivioFinto();
  const pagina = randomUUID();
  const archivioZip = randomUUID();

  const agenzia = (method: 'GET' | 'PUT' | 'DELETE', documento: string, payload?: object) =>
    app.inject({
      method,
      url: `/api/conversazioni/${conversazione.id}/documenti/${documento}/link`,
      headers: { authorization: `Bearer ${token}` },
      ...(payload && { payload }),
    });
  const tokenDi = (url: string) => url.slice(`${BASE}/p/`.length);

  beforeAll(async () => {
    app = creaApp({ logger: false, pagine: { archivio, baseLink: BASE } });
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: 't.due@collaudo.sonovelia.it', password: PASSWORD_DEMO },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;
    const nuova = await app.inject({
      method: 'POST',
      url: '/api/conversazioni',
      headers: { authorization: `Bearer ${token}` },
      payload: { titolo: 'Collaudo pagine condivise' },
    });
    conversazione = nuova.json<Conversazione>();

    /* Una risposta con due documenti generati: una pagina web e uno zip. */
    const documenti = [
      { id: pagina, nome: 'Scudo Cyber per il cliente', formato: 'html', url: `/api/conversazioni/${conversazione.id}/documenti/${pagina}` },
      { id: archivioZip, nome: 'Allegati della proposta', formato: 'zip', url: `/api/conversazioni/${conversazione.id}/documenti/${archivioZip}` },
    ];
    await poolDb().query(
      `insert into velia.messaggi (id, conversazione_id, tenant_id, autore, utente_id, testo, documenti)
       values ($1, $2, $3, 'assistente', $4, 'Ecco i documenti.', $5)`,
      [randomUUID(), conversazione.id, TENANT_COLLAUDO, conversazione.autoreId, JSON.stringify(documenti)],
    );
    archivio.file.set(percorsoDocumentoGenerato(TENANT_COLLAUDO, pagina, 'html'), Buffer.from(PAGINA));
    archivio.file.set(percorsoDocumentoGenerato(TENANT_COLLAUDO, archivioZip, 'zip'), Buffer.from('PK finto'));
  }, 60_000);

  afterAll(async () => {
    /* La conversazione porta con sé messaggi e link. */
    if (conversazione?.id) await poolDb().query(`delete from velia.conversazioni where id = $1`, [conversazione.id]);
    await app.close();
    await chiudiPool();
  });

  it('il link nasce per 30 giorni, e la pagina si apre isolata e senza rete', async () => {
    expect((await agenzia('GET', pagina)).json()).toEqual({ link: null });

    const creato = await agenzia('PUT', pagina, {});
    expect(creato.statusCode).toBe(200);
    const { link } = creato.json<{ link: LinkDocumento }>();
    expect(link.url.startsWith(`${BASE}/p/`)).toBe(true);
    const giorni = (new Date(link.scadeIl!).getTime() - Date.now()) / 86_400_000;
    expect(giorni).toBeGreaterThan(29.9);
    expect(giorni).toBeLessThan(30.1);

    /* Condividere di nuovo rimostra lo stesso link. */
    expect((await agenzia('PUT', pagina, {})).json<{ link: LinkDocumento }>().link.url).toBe(link.url);

    const aperta = await app.inject({ method: 'GET', url: `/p/${tokenDi(link.url)}` });
    expect(aperta.statusCode).toBe(200);
    expect(aperta.body).toBe(PAGINA);
    expect(aperta.headers['content-type']).toBe('text/html; charset=utf-8');
    const csp = String(aperta.headers['content-security-policy']);
    expect(csp).toContain('sandbox allow-scripts');
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('allow-same-origin');
    expect(aperta.headers['cache-control']).toBe('private, no-store');
    expect(aperta.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(aperta.headers['referrer-policy']).toBe('no-referrer');
  });

  it('la scadenza si cambia senza cambiare il link; «nessuna» vale per sempre', async () => {
    const prima = (await agenzia('GET', pagina)).json<{ link: LinkDocumento }>().link;
    const sempre = (await agenzia('PUT', pagina, { giorni: null })).json<{ link: LinkDocumento }>().link;
    expect(sempre.url).toBe(prima.url);
    expect(sempre.scadeIl).toBeNull();
    expect((await agenzia('PUT', pagina, { giorni: 0 })).statusCode).toBe(400);
  });

  it('un formato che il browser non mostra ha la pagina per scaricarlo', async () => {
    const { link } = (await agenzia('PUT', archivioZip, { giorni: 7 })).json<{ link: LinkDocumento }>();
    const t = tokenDi(link.url);
    const pagina = await app.inject({ method: 'GET', url: `/p/${t}` });
    expect(pagina.statusCode).toBe(200);
    expect(pagina.body).toContain('Allegati della proposta');
    expect(pagina.body).toContain(`href="${t}/file"`);
    expect(pagina.body).not.toContain('<script');
    const file = await app.inject({ method: 'GET', url: `/p/${t}/file` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/zip');
    expect(file.headers['content-disposition']).toBe('attachment; filename="allegati-della-proposta.zip"');
  });

  it('scaduto, revocato o inventato: la stessa pagina e lo stesso 404', async () => {
    const { link } = (await agenzia('GET', archivioZip)).json<{ link: LinkDocumento }>();
    const t = tokenDi(link.url);
    await poolDb().query(`update velia.pagine_condivise set scade_il = now() - interval '1 minute' where token = $1`, [t]);
    const scaduto = await app.inject({ method: 'GET', url: `/p/${t}` });
    expect(scaduto.statusCode).toBe(404);
    expect(scaduto.body).toContain('Questo link non è più attivo');

    const vecchio = tokenDi((await agenzia('GET', pagina)).json<{ link: LinkDocumento }>().link.url);
    expect((await agenzia('DELETE', pagina)).statusCode).toBe(204);
    const revocato = await app.inject({ method: 'GET', url: `/p/${vecchio}` });
    expect(revocato.statusCode).toBe(404);
    expect(revocato.body).toBe(scaduto.body);
    expect((await agenzia('GET', pagina)).json()).toEqual({ link: null });

    /* Un link nuovo dopo la revoca ha un token nuovo. */
    const nuovo = tokenDi((await agenzia('PUT', pagina, {})).json<{ link: LinkDocumento }>().link.url);
    expect(nuovo).not.toBe(vecchio);

    expect((await app.inject({ method: 'GET', url: '/p/inventato-ma-lungo-abbastanza-per-provare' })).body).toBe(scaduto.body);
    expect((await app.inject({ method: 'GET', url: '/p/corto' })).statusCode).toBe(404);
  });

  it('un documento che non esiste, o senza credenziali: niente link', async () => {
    expect((await agenzia('PUT', randomUUID(), {})).statusCode).toBe(404);
    const anonimo = await app.inject({ method: 'PUT', url: `/api/conversazioni/${conversazione.id}/documenti/${pagina}/link`, payload: {} });
    expect(anonimo.statusCode).toBe(401);
  });
});
