import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    // I test di integrazione (RLS, coda) parlano col database del file .env:
    // sequenziali, per non farsi concorrenza sulle stesse tabelle.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
