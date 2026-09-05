/**
 * Screenshot del sito compilato, per guardarlo invece di immaginarselo.
 *
 *   npm run build
 *   node scripts/screenshot.mjs                    # le rotte di default
 *   node scripts/screenshot.mjs /fr,/fr/plateforme # rotte scelte
 *   node scripts/screenshot.mjs /fr 390            # a una larghezza sola
 *
 * Serve la `dist/` con un server statico qualunque; qui se ne avvia uno
 * minimo, così lo script non dipende da `astro preview` già in esecuzione.
 *
 * `puppeteer-core` sta in `fe-angular`: è la stessa macchina e lo stesso
 * Chrome, non ha senso installarlo due volte.
 */

import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(RADICE, 'dist');
const OUT = join(RADICE, '.screenshot');

if (!existsSync(DIST)) {
  console.error('Manca dist/. Esegui prima `npm run build`.');
  process.exit(1);
}

const { default: puppeteer } = await import(
  new URL('../../fe-angular/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js', import.meta.url)
);

mkdirSync(OUT, { recursive: true });

const rotte = (process.argv[2] ?? '/,/fr').split(',');
const larghezze = process.argv[3] ? [Number(process.argv[3])] : [1440, 390];

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.ico': 'image/x-icon',
};

/* `build.format: 'file'` emette /piattaforma.html: il server prova prima il
   percorso così com'è, poi con .html, poi come cartella con index.html. */
const risolvi = (percorso) => {
  const base = join(DIST, normalize(decodeURIComponent(percorso)).replace(/^(\.\.[/\\])+/, ''));
  for (const tentativo of [base, `${base}.html`, join(base, 'index.html')]) {
    if (existsSync(tentativo) && statSync(tentativo).isFile()) return tentativo;
  }
  return null;
};

const server = createServer((req, res) => {
  const file = risolvi(new URL(req.url, 'http://x').pathname);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('non trovato');
    return;
  }
  res.writeHead(200, { 'content-type': TIPI[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;
console.log('server statico su ' + BASE);

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});

try {
  for (const larghezza of larghezze) {
    const page = await browser.newPage();
    await page.setViewport({ width: larghezza, height: 900, deviceScaleFactor: 2 });

    /* Chrome headless dichiara `prefers-reduced-motion: reduce`: senza questa
       emulazione si guarderebbe una versione del sito che nessun visitatore
       vede, con i video fermi e le animazioni spente. */
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);

    for (const rotta of rotte) {
      await page.goto(`${BASE}${rotta}`, { waitUntil: 'networkidle2' });
      const nome = (rotta === '/' ? 'home' : rotta.replace(/^\//, '').replace(/\//g, '-'));
      const file = join(OUT, `${nome}-${larghezza}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
    }

    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
