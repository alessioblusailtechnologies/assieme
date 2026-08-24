import { configurazione } from '../config.js';
import { creaApp } from './app.js';

const config = configurazione();

const app = creaApp({
  logger: { level: config.LOG_LIVELLO },
});

try {
  /* Le piattaforme (Railway) assegnano la porta in PORT: vince su PORTA_API. */
  await app.listen({ port: Number(process.env['PORT']) || config.PORTA_API, host: '0.0.0.0' });
} catch (errore) {
  app.log.fatal({ err: errore }, 'avvio fallito');
  process.exit(1);
}
