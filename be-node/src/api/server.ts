import { configurazione } from '../config.js';
import { creaApp } from './app.js';

const config = configurazione();

const app = creaApp({
  logger: { level: config.LOG_LIVELLO },
});

try {
  await app.listen({ port: config.PORTA_API, host: '0.0.0.0' });
} catch (errore) {
  app.log.fatal({ err: errore }, 'avvio fallito');
  process.exit(1);
}
