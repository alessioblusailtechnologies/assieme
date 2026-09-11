import type { FastifyInstance, FastifyReply } from 'fastify';
import type pg from 'pg';

import { configurazione } from '../../config.js';
import { percorsoDocumentoGenerato, type DocumentoGenerato } from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import { mimeDi } from '../../contratto/formati.js';
import { schemaLinkDocumento, type LinkDocumento } from '../../contratto/pagine.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { nomeFileGenerato } from '../../generazione/generatore.js';
import { condividiDocumento, linkDelDocumento, paginaPerToken, revocaLink } from '../../pagine/condivise.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * Le pagine condivise (11/09/2026, fase 2 di `PIANO-LINK-E-FORMATI.md`).
 *
 * Dal lato dell'agenzia, il link di un documento generato in chat: si
 * legge, si crea o se ne cambia la scadenza, si revoca. Può farlo chi vede
 * la conversazione (la RLS), come chi può scaricarne il documento.
 *
 * Dal lato del cliente, `GET /p/:token`, fuori dall'autenticazione: il
 * documento nel browser, isolato. Una pagina HTML generata dal modello gira
 * con `Content-Security-Policy: sandbox` (origine opaca: niente accesso
 * all'API né ad altro) e con la rete chiusa, e per questo la sandbox la
 * scrive autosufficiente. Nessun contatore di aperture (decisione del
 * committente).
 */

export interface OpzioniPagine {
  /** Nei test: lo Storage finto. */
  archivio?: ArchivioFile;
  /** Nei test: la radice dei link senza passare dalla configurazione. */
  baseLink?: string;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Si aprono nel browser; gli altri formati hanno una pagina col pulsante per scaricarli. */
const NEL_BROWSER = new Set(['html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'txt', 'mp4', 'webm', 'mp3', 'm4a', 'wav', 'ogg']);

/**
 * La pagina generata: i suoi script sì, ma in un'origine opaca, senza rete
 * (`connect-src 'none'`), senza risorse esterne e senza form che inviano.
 * I link verso fuori, `tel:` e `mailto:` restano.
 */
const CSP_PAGINA = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Un SVG si mostra, ma senza script. */
const CSP_SVG = "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'";

/** Le pagine che scrive l'API (scaricamento, link non attivo): niente script. */
const CSP_STATICA = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function registraRottePagine(app: FastifyInstance, opzioni: OpzioniPagine = {}): void {
  let archivioPigro: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => (archivioPigro ??= opzioni.archivio ?? new ArchivioStorage());
  const base = (): string => opzioni.baseLink ?? configurazione().BASE_LINK_PAGINE;

  // --- Lato agenzia -------------------------------------------------------

  app.get<{ Params: { id: string; did: string } }>('/api/conversazioni/:id/documenti/:did/link', async (richiesta) => {
    const { id, did } = richiesta.params;
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<{ link: LinkDocumento | null }> => {
      await documentoGenerato(client, richiesta.identita, id, did);
      return { link: (await linkDelDocumento(client, base(), id, did)) ?? null };
    });
  });

  app.put<{ Params: { id: string; did: string } }>('/api/conversazioni/:id/documenti/:did/link', async (richiesta) => {
    const esito = schemaLinkDocumento.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Indica per quanti giorni vale il link (da 1 a 365), o nessuna scadenza.');
    const { id, did } = richiesta.params;
    return conIdentita(poolDb(), richiesta.identita, async (client): Promise<{ link: LinkDocumento }> => {
      const documento = await documentoGenerato(client, richiesta.identita, id, did);
      const link = await condividiDocumento(
        client,
        base(),
        { tenantId: richiesta.identita.tenantId, conversazioneId: id, documento, utenteId: richiesta.identita.utenteId },
        esito.data.giorni,
      );
      return { link };
    });
  });

  app.delete<{ Params: { id: string; did: string } }>('/api/conversazioni/:id/documenti/:did/link', async (richiesta, risposta) => {
    const { id, did } = richiesta.params;
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      await documentoGenerato(client, richiesta.identita, id, did);
      await revocaLink(client, id, did);
    });
    return risposta.status(204).send();
  });

  // --- Lato cliente -------------------------------------------------------

  app.get<{ Params: { token: string } }>('/p/:token', async (richiesta, risposta) => {
    const pagina = await paginaPerToken(poolDb(), richiesta.params.token);
    if (!pagina) return nonAttivo(risposta);
    const { formato } = pagina;
    const nomeFile = nomeFileGenerato(pagina.nome, formato);

    if (!NEL_BROWSER.has(formato)) {
      const agenzia = await nomeAgenzia(pagina.tenantId);
      return pubblica(risposta)
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Security-Policy', CSP_STATICA)
        .send(paginaScarica(agenzia, pagina.nome, formato, `${encodeURIComponent(richiesta.params.token)}/file`));
    }

    const byte = await leggi(archivio(), pagina.tenantId, pagina.documentoId, formato);
    if (!byte) return nonAttivo(risposta);
    pubblica(risposta)
      .header('Content-Type', mimeDi(formato))
      .header('Content-Length', byte.length)
      .header('Content-Disposition', `inline; filename="${nomeFile}"`);
    if (formato === 'html' || formato === 'htm') risposta.header('Content-Security-Policy', CSP_PAGINA);
    if (formato === 'svg') risposta.header('Content-Security-Policy', CSP_SVG);
    return risposta.send(byte);
  });

  app.get<{ Params: { token: string } }>('/p/:token/file', async (richiesta, risposta) => {
    const pagina = await paginaPerToken(poolDb(), richiesta.params.token);
    const byte = pagina && (await leggi(archivio(), pagina.tenantId, pagina.documentoId, pagina.formato));
    if (!pagina || !byte) return nonAttivo(risposta);
    return pubblica(risposta)
      .header('Content-Type', mimeDi(pagina.formato))
      .header('Content-Length', byte.length)
      .header('Content-Disposition', `attachment; filename="${nomeFileGenerato(pagina.nome, pagina.formato)}"`)
      .send(byte);
  });
}

/** Il documento generato, se chi chiede ne vede la conversazione (RLS); altrimenti 404. */
async function documentoGenerato(
  client: pg.ClientBase,
  identita: Identita,
  conversazioneId: string,
  documentoId: string,
): Promise<DocumentoGenerato> {
  if (!E_UUID.test(conversazioneId) || !E_UUID.test(documentoId)) throw ErroreApi.nonTrovato('Documento inesistente.');
  const r = await client.query<{ documento: DocumentoGenerato }>(
    `select d as documento
       from velia.conversazioni c
       join velia.messaggi m on m.conversazione_id = c.id,
       jsonb_array_elements(m.documenti) d
      where c.id = $1 and c.tenant_id = $2 and d->>'id' = $3`,
    [conversazioneId, identita.tenantId, documentoId],
  );
  const documento = r.rows[0]?.documento;
  if (!documento) throw ErroreApi.nonTrovato('Documento inesistente.');
  return documento;
}

async function leggi(archivio: ArchivioFile, tenantId: string, documentoId: string, formato: string): Promise<Buffer | undefined> {
  try {
    return await archivio.scarica(percorsoDocumentoGenerato(tenantId, documentoId, formato));
  } catch {
    /* Il file non c'è più (la conversazione è stata cancellata a metà): il link non vale. */
    return undefined;
  }
}

async function nomeAgenzia(tenantId: string): Promise<string> {
  const r = await poolDb().query<{ nome: string }>(`select nome from velia.tenant where id = $1`, [tenantId]);
  return r.rows[0]?.nome ?? '';
}

/** Gli header di ogni risposta pubblica: niente cache, niente indicizzazione, niente referrer. */
function pubblica(risposta: FastifyReply): FastifyReply {
  return risposta
    .header('Cache-Control', 'private, no-store')
    .header('X-Robots-Tag', 'noindex, nofollow')
    .header('Referrer-Policy', 'no-referrer')
    .header('X-Content-Type-Options', 'nosniff');
}

/**
 * Scaduto, revocato o mai esistito: la stessa pagina e lo stesso 404. Chi
 * ha un link che non vale più non deve poter distinguere i tre casi.
 */
function nonAttivo(risposta: FastifyReply): FastifyReply {
  return pubblica(risposta)
    .status(404)
    .header('Content-Type', 'text/html; charset=utf-8')
    .header('Content-Security-Policy', CSP_STATICA)
    .send(
      paginaStatica(
        'Link non più attivo',
        '<h1>Questo link non è più attivo</h1><p>Se ti serve ancora il documento, chiedilo a chi te l’ha mandato.</p>',
      ),
    );
}

function paginaScarica(agenzia: string, nome: string, formato: string, href: string): string {
  return paginaStatica(
    nome,
    `${agenzia ? `<p class="agenzia">${escapa(agenzia)}</p>` : ''}
<h1>${escapa(nome)}</h1>
<p class="formato">File ${escapa(formato.toUpperCase())}</p>
<a class="scarica" href="${escapa(href)}">Scarica il file</a>`,
  );
}

function paginaStatica(titolo: string, corpo: string): string {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapa(titolo)}</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f5f2; color: #1f1f1f;
         font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 26rem; padding: 2rem 1.5rem; text-align: center; }
  h1 { font-size: 1.35rem; line-height: 1.3; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; color: #4a4a4a; }
  .agenzia { font-weight: 600; color: #1f1f1f; }
  .formato { font-size: .9rem; }
  .scarica { display: inline-block; margin-top: .5rem; padding: .85rem 1.4rem; border-radius: .6rem; background: #1f1f1f;
             color: #fff; text-decoration: none; font-weight: 600; min-height: 44px; box-sizing: border-box; }
</style>
</head>
<body><main>${corpo}</main></body>
</html>`;
}

function escapa(testo: string): string {
  return testo.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
