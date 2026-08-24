import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    // I test di integrazione (RLS, coda) parlano col database del file .env:
    // sequenziali, per non farsi concorrenza sulle stesse tabelle.
    fileParallelism: false,
    // Il giro della chat (workspace vera, memoria in linea) sul db remoto sta sotto i 30 s.
    testTimeout: 30_000,
  },
});
