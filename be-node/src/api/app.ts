import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';

import { registraRotteArchivioPrivato, type OpzioniArchivioPrivato } from './archivio-privato/rotte.js';
import { registraRotteConversazioni, type OpzioniConversazioni } from './conversazioni/rotte.js';
import { registraRotteDocumenti } from './documenti/rotte.js';
import { registraAuth, type VerificaToken } from './plugins/auth.js';
import { registraGestoreErrori } from './plugins/errori.js';
import { registraRotteSegnalazioni } from './segnalazioni/rotte.js';
import { registraRotteSessione } from './sessione/rotte.js';
import { registraRotteTabelle, type OpzioniTabelle } from './tabelle/rotte.js';
import { registraRotteTemplate, type OpzioniTemplate } from './template/rotte.js';

export interface OpzioniApp {
  logger?: boolean | object;
  /** Nei test: un verificatore finto al posto del JWKS di Supabase. */
  verificaToken?: VerificaToken;
  /** Nei test: lo Storage finto per l'Archivio Privato. */
  archivioPrivato?: OpzioniArchivioPrivato;
  /** Nei test: Storage finto e ponte eventi condiviso per la chat. */
  conversazioni?: OpzioniConversazioni;
  /** Nei test: Storage finto per template e identità visiva. */
  template?: OpzioniTemplate;
  /** Nei test: Storage finto per l'esportazione delle tabelle. */
  tabelle?: OpzioniTabelle;
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

  registraGestoreErrori(app);
  registraAuth(app, opzioni.verificaToken);

  /** Sonda di vita per deploy e sviluppo: non è parte del contratto FE. */
  app.get('/api/salute', () => ({ stato: 'ok' }));

  registraRotteSessione(app);
  registraRotteDocumenti(app);
  registraRotteSegnalazioni(app);
  registraRotteArchivioPrivato(app, opzioni.archivioPrivato);
  registraRotteConversazioni(app, opzioni.conversazioni);
  registraRotteTemplate(app, opzioni.template);
  registraRotteTabelle(app, opzioni.tabelle);

  return app;
}
