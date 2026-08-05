/**
 * Espone la demo con un quick tunnel Cloudflare.
 *
 * Presuppone la demo in ascolto su 8080 (`npm run demo`). Cerca `cloudflared`
 * nel PATH e, in mancanza, nella posizione in cui lo installiamo su Windows
 * (`%LOCALAPPDATA%\cloudflared\`). L'URL `trycloudflare.com` che compare nel
 * log è effimero: vive quanto questo processo, e senza autenticazione — da
 * trattare come riservato.
 *
 * Avvio: `npm run demo:tunnel` (in un terminale accanto a `npm run demo`).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PORTA = Number(process.env.PORTA ?? 8080);

const candidati = [
  'cloudflared',
  ...(process.env.LOCALAPPDATA
    ? [join(process.env.LOCALAPPDATA, 'cloudflared', 'cloudflared.exe')]
    : []),
];

const eseguibile =
  candidati.find((c) => c !== 'cloudflared' && existsSync(c)) ?? candidati[0];

console.log(`[tunnel] cloudflared: ${eseguibile}`);
console.log(`[tunnel] espongo http://localhost:${PORTA} — l'URL compare qui sotto`);
console.log('[tunnel] nessuna autenticazione: trattare l’indirizzo come riservato');

const processo = spawn(eseguibile, ['tunnel', '--url', `http://localhost:${PORTA}`], {
  stdio: 'inherit',
});

processo.on('error', (errore) => {
  console.error(
    `[tunnel] cloudflared non trovato (${errore.message}).\n` +
      '[tunnel] Installalo da https://github.com/cloudflare/cloudflared/releases ' +
      'nel PATH o in %LOCALAPPDATA%\\cloudflared\\cloudflared.exe',
  );
  process.exit(1);
});

processo.on('exit', (codice) => process.exit(codice ?? 0));
