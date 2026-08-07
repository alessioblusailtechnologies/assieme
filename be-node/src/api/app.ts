import Fastify, { type FastifyInstance } from 'fastify';

import { registraRotteDocumenti } from './documenti/rotte.js';
import { registraAuth, type VerificaToken } from './plugins/auth.js';
import { registraGestoreErrori } from './plugins/errori.js';
import { registraRotteSessione } from './sessione/rotte.js';

export interface OpzioniApp {
  logger?: boolean | object;
  /** Nei test: un verificatore finto al posto del JWKS di Supabase. */
  verificaToken?: VerificaToken;
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

  registraGestoreErrori(app);
  registraAuth(app, opzioni.verificaToken);

  /** Sonda di vita per deploy e sviluppo: non è parte del contratto FE. */
  app.get('/api/salute', () => ({ stato: 'ok' }));

  registraRotteSessione(app);
  registraRotteDocumenti(app);

  return app;
}
