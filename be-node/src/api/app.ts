import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';

import { poolDb } from '../db/pool.js';

import { registraRotteAgenti, type OpzioniAgenti } from './agenti/rotte.js';
import { registraRotteArchivioPrivato, type OpzioniArchivioPrivato } from './archivio-privato/rotte.js';
import { registraRotteCartelle } from './cartelle/rotte.js';
import { registraRotteChatClienti, type OpzioniChatClienti } from './chat-clienti/rotte.js';
import { registraRotteConversazioni, type OpzioniConversazioni } from './conversazioni/rotte.js';
import { registraRotteDocumenti } from './documenti/rotte.js';
import { registraRotteIntestazione, type OpzioniIntestazione } from './intestazione/rotte.js';
import { registraRotteIstruzioni, type OpzioniIstruzioni } from './istruzioni/rotte.js';
import { registraRotteModelli } from './modelli/rotte.js';
import { registraRottePagine, type OpzioniPagine } from './pagine/rotte.js';
import { registraAuth, type VerificaToken } from './plugins/auth.js';
import { registraGestoreErrori } from './plugins/errori.js';
import { registraRotteRicordi } from './ricordi/rotte.js';
import { registraRotteSegnalazioni } from './segnalazioni/rotte.js';
import { risolviOspite } from './sessione/ospite.js';
import { registraRotteSessione, type OpzioniSessione } from './sessione/rotte.js';
import { registraRotteTabelle, type OpzioniTabelle } from './tabelle/rotte.js';
import { registraRotteTemplate, type OpzioniTemplate } from './template/rotte.js';
import { registraRotteUtenti } from './utenti/rotte.js';

export interface OpzioniApp {
  logger?: boolean | object;
  /** Nei test: un verificatore finto al posto del JWKS di Supabase. */
  verificaToken?: VerificaToken;
  /** Nei test: lo Storage finto per l'Archivio Privato. */
  archivioPrivato?: OpzioniArchivioPrivato;
  /** Nei test: Storage finto e ponte eventi condiviso per la chat. */
  conversazioni?: OpzioniConversazioni;
  /** Nei test: Storage finto per i template. */
  template?: OpzioniTemplate;
  /** Nei test: Storage finto per le immagini dell'intestazione. */
  intestazione?: OpzioniIntestazione;
  /** Nei test: Storage finto per l'esportazione delle tabelle. */
  tabelle?: OpzioniTabelle;
  /** Nei test: Storage finto per i documenti di riferimento. */
  istruzioni?: OpzioniIstruzioni;
  /** Nei test: Storage finto per il documento su template degli agenti. */
  agenti?: OpzioniAgenti;
  /** Nei test: le origini CORS senza passare dalla configurazione. */
  corsOrigini?: string;
  /** Nei test: il servizio dei saluti con un generatore finto. */
  sessione?: OpzioniSessione;
  /** Nei test: creazione dell'utenza ospite senza Supabase Auth, e link finto. */
  chatClienti?: OpzioniChatClienti;
  /** Nei test: Storage finto e radice dei link delle pagine condivise. */
  pagine?: OpzioniPagine;
}

/**
 * Costruisce l'applicazione Fastify senza metterla in ascolto: i test la
 * usano con `app.inject()`, il server vero con `app.listen()`.
 *
 * Le rotte arrivano per dominio (documenti, conversazioni, …) man mano che
 * le fasi le implementano — speculari a `fe-angular/src/app/core/api/`.
 */
export function creaApp(opzioni: OpzioniApp = {}): FastifyInstance {
  const app = Fastify({
    logger: opzioni.logger ?? true,
    // Dietro il proxy del dev server (e domani un reverse proxy) l'URL
    // resta /api/...: il prefisso è parte del contratto, non lo strippiamo.
  });

  /* Upload dell'Archivio Privato (RF-B-02): i file si bufferizzano in
     memoria, il tetto duro qui è per non farsi saturare — il limite vero,
     per tenant, lo applica la rotta (RF-B-08) e risponde 413. */
  void app.register(multipart, {
    limits: { fileSize: 64 * 1024 * 1024, files: 30 },
    throwFileSizeLimit: false,
  });

  /* App e API su host diversi (Pages + Railway): il browser chiede il
     permesso, e lo si dà solo alle origini elencate. Il token viaggia
     nell'header Authorization, non nei cookie: niente credenziali. */
  const origini = (opzioni.corsOrigini ?? process.env['CORS_ORIGINI'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origini.length) {
    void app.register(cors, { origin: origini, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  }

  registraGestoreErrori(app);
  /* Il secondo risolutore è quello del cliente: dal token del link
     all'identità, ricontrollando ogni volta che la chat sia ancora viva. */
  registraAuth(app, opzioni.verificaToken, (token) => risolviOspite(poolDb(), token));

  /** Sonda di vita per deploy e sviluppo: non è parte del contratto FE. */
  app.get('/api/salute', () => ({
    stato: 'ok',
    /* Il commit in esecuzione (Render lo mette in RENDER_GIT_COMMIT): per sapere cosa gira davvero. */
    ...(process.env['RENDER_GIT_COMMIT'] && { versione: process.env['RENDER_GIT_COMMIT'].slice(0, 7) }),
  }));

  registraRotteSessione(app, opzioni.sessione);
  registraRotteDocumenti(app);
  registraRotteSegnalazioni(app);
  registraRotteArchivioPrivato(app, opzioni.archivioPrivato);
  registraRotteCartelle(app);
  registraRotteChatClienti(app, opzioni.chatClienti);
  registraRotteConversazioni(app, opzioni.conversazioni);
  registraRottePagine(app, opzioni.pagine);
  registraRotteTemplate(app, opzioni.template);
  registraRotteIntestazione(app, opzioni.intestazione);
  registraRotteTabelle(app, opzioni.tabelle);
  registraRotteModelli(app);
  registraRotteIstruzioni(app, opzioni.istruzioni);
  registraRotteUtenti(app);
  registraRotteAgenti(app, opzioni.agenti);
  registraRotteRicordi(app);

  return app;
}
